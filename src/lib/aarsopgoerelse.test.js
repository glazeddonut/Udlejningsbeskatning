import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aarsopgoerelse, REGNSKABSNOTE } from './aarsopgoerelse.js'

// Seamet: db-formede data ind, domæneformede data ud (ADR-0004).
//
// Fixturerne herunder er med vilje RÅ — de har præcis den form data har i
// udlejning-data.json, inklusive talsæt der mangler poster, mangler `prorata`
// eller bærer legacy-nøgler. Det er hele pointen: de fejl der har kunnet påvises
// i projektet lå ikke i regnereglerne men i hvordan de blev kaldt, og en test der
// selv normaliserer inddata ville teste den forkerte side af seamet.

const db = (over = {}) => ({
  persons: [
    { id: 1, navn: 'Nanna', cpr: '', rolle: 'udlejer' },
    { id: 2, navn: 'Thomas', cpr: '', rolle: 'medejer' },
  ],
  property: {
    navn: 'Dronning Margrethes Vej 3',
    adresse: 'Dronning Margrethes Vej 3',
    ejerandele: { 1: 50, 2: 50 },
  },
  loans: [{ id: 1, laangiver: 'Danske Bank', restgaeld: 1500000, rente_pct: 3, haeftelse: { 1: 50, 2: 50 } }],
  leases: [{ id: 1, startdato: '2025-08-05', slutdato: '2025-12-31', maanedlig_leje: 4500, forbrug_aconto: { vand: 300, varme: 300 } }],
  settings: { fordeling_mode: 'alt_paa_en', beskattet_person_id: null },
  years: [{ id: 8, aar: 2025, budget: raatSaet(), faktisk: raatSaet() }],
  bilag: [],
  ...over,
})

// Et talsæt som det ligger på disken: pro rata-flag, legacy-nøgler på topniveau,
// og ingen garanti for at alle kontoplanens poster findes.
function raatSaet(over = {}) {
  return {
    fra_dato: '2025-08-06',
    til_dato: '2025-12-31',
    indtaegter: { leje: 4500, vand: 300, varme: 300, andet: 0 },
    udgifter: { grundskyld: 3120, faellesudgifter: 13250, vedligeholdelse: 5211, andet: 2695 },
    prorata: { 'indtaegter.leje': true, 'indtaegter.vand': true, 'indtaegter.varme': true },
    forbedringer: 0,
    renteudgifter: { 1: 17849 },
    udlejet_andel_pct: 100,
    naertstaaende: true,
    fra_maaned: 1,
    til_maaned: 12,
    ...over,
  }
}

const kald = (over = {}, aar = 2025, grundlag = 'faktisk') =>
  aarsopgoerelse({ ...db(over), aar, grundlag })

const sektion = (o, id) => o.opstilling.sektioner.find(s => s.id === id)
const raekke = (o, sektionId, raekkeId) => sektion(o, sektionId)?.raekker.find(r => r.id === raekkeId)

// ── Normaliseringen sker ét sted: inde i modulet ──────────────────────────────

test('et råt talsæt uden alle kontoplanens poster giver samme svar som et fyldt', () => {
  const fyldt = raatSaet({
    indtaegter: { leje: 4500, vand: 300, varme: 300, andet: 0 },
    udgifter: {
      grundskyld: 3120, faellesudgifter: 13250, forsikring: 0, vedligeholdelse: 5211,
      vand: 0, varme: 0, administration: 0, renovation: 0, andet: 2695,
    },
  })
  const raat = kald()                                            // udgifter mangler 5 poster
  const helt = kald({ years: [{ id: 8, aar: 2025, budget: fyldt, faktisk: fyldt }] })
  assert.deepEqual(raat.opstilling, helt.opstilling)
  assert.deepEqual(raat.sum, helt.sum)
  assert.deepEqual(raat.personer, helt.personer)
})

test('et talsæt uden indtægter, udgifter og renteudgifter overhovedet giver nul, ikke NaN', () => {
  const tomt = { fra_dato: '2025-08-06', til_dato: '2025-12-31' }
  const o = kald({ years: [{ id: 8, aar: 2025, budget: tomt, faktisk: tomt }] })
  assert.deepEqual(o.sum, { indtaegter: 0, udgifter: 0, udlejningsresultat: 0, renter: 0, forbedringer: 0 })
  assert.equal(sektion(o, 'indtaegter').raekker.length, 1)        // kun sumrækken
})

test('modulet muterer ikke det gemte talsæt', () => {
  const data = db()
  const foer = JSON.stringify(data.years[0])
  aarsopgoerelse({ ...data, aar: 2025, grundlag: 'faktisk' })
  assert.equal(JSON.stringify(data.years[0]), foer)
})

test('et år der ikke findes giver null — kalderen skal ikke gætte', () => {
  assert.equal(kald({}, 2099), null)
  assert.equal(aarsopgoerelse({ ...db(), aar: 2025, grundlag: 'faktisk', years: [] }), null)
})

// ── De tre dagsbegreber holdes adskilt ────────────────────────────────────────

test('dagstallene er tre forskellige tal og bærer domænets navne', () => {
  const o = kald()                                               // 6. aug – 31. dec 2025
  assert.equal(o.dagstal.udlejningsdage, 148)                    // faktiske kalenderdage
  assert.equal(o.dagstal.indberetningsdage, 145)                 // 30/360 til felt 748 / rubrik 207
  assert.equal(o.dagstal.prorataMaaneder.toFixed(6), (26 / 31 + 4).toFixed(6))
})

test('et helt år indberettes som 360 dage, ikke 365', () => {
  const helt = raatSaet({ fra_dato: '2026-01-01', til_dato: '2026-12-31' })
  const o = kald({ years: [{ id: 9, aar: 2026, budget: helt, faktisk: helt }] }, 2026)
  assert.equal(o.dagstal.udlejningsdage, 365)
  assert.equal(o.dagstal.indberetningsdage, 360)
  assert.equal(o.dagstal.prorataMaaneder, 12)
})

test('periodeflaget kan bæres — en periode uden datoer er markeret som manglende', () => {
  const uden = raatSaet({ fra_dato: '', til_dato: '' })
  const o = kald({ years: [{ id: 8, aar: 2025, budget: uden, faktisk: uden }] })
  assert.equal(o.periode.mangler, true)
  assert.equal(kald().periode.mangler, false)
})

test('perioden og afvigelsen fra lejekontrakten rapporteres, men rettes ikke', () => {
  const o = kald()
  assert.deepEqual(o.periode.fra_dato, '2025-08-06')             // talsættets egen, ikke kontraktens
  assert.equal(o.aarsgrundlag.fra_dato, '2025-08-05')
  assert.equal(o.periodeafvigelse.gemt.fra_dato, '2025-08-06')
  assert.equal(o.periodeafvigelse.afledt.fra_dato, '2025-08-05')
  const enige = raatSaet({ fra_dato: '2025-08-05' })
  assert.equal(kald({ years: [{ id: 8, aar: 2025, budget: enige, faktisk: enige }] }).periodeafvigelse, null)
})

// ── Opstillingen: rækker, summer og invarianten ───────────────────────────────

test('opstillingens hoved er det samme tekststykke til begge flader', () => {
  const h = kald().opstilling.hoved
  assert.equal(h.overskrift, 'Regnskab for udlejning · 2025')
  assert.deepEqual(h.linjer, [
    'Dronning Margrethes Vej 3, Dronning Margrethes Vej 3',
    'Ejere: Nanna (50 %) · Thomas (50 %)',
    'Grundlag: faktiske tal · Udlejet til nærtstående: ja · 148 udlejningsdage',
  ])
})

test('grundlaget budget skrives som budget i hovedet', () => {
  assert.match(kald({}, 2025, 'budget').opstilling.hoved.linjer[2], /^Grundlag: budget ·/)
})

test('rækkerne summer til sektionens sumrække — i hver eneste sektion', () => {
  const o = kald()
  for (const s of o.opstilling.sektioner) {
    const sumraekker = s.raekker.filter(r => r.sum)
    if (!sumraekker.length) continue
    const poster = s.raekker.filter(r => !r.sum).reduce((n, r) => n + r.beloeb, 0)
    if (s.id === 'indtaegter' || s.id === 'udgifter') {
      assert.equal(poster, sumraekker[0].beloeb, `${s.id} summer ikke`)
    }
  }
})

// Labellen er kontoplanens, ordret. Regnskabet skrev tidligere "Husleje (ekskl.
// forbrug)" — altså kontoplanens label plus dens hint — mens Årets tal skrev
// "Husleje". Hintet er en vejledning ved indtastningen, ikke postens navn, og
// posterne skal hedde det samme i indtastning, skærmregnskab, PDF og bilag.
test('kun poster med beløb får en række — og de bærer kontoplanens danske labels', () => {
  const o = kald()
  assert.deepEqual(sektion(o, 'indtaegter').raekker.map(r => r.label), [
    'Husleje', 'Vand (opkrævet)', 'Varme (opkrævet)', 'Indtægter i alt',
  ])
  assert.deepEqual(sektion(o, 'udgifter').raekker.map(r => r.label), [
    'Grundskyld (ejendomsskat)', 'Fællesudgifter (drift)', 'Vedligeholdelse', 'Andet', 'Udgifter i alt',
  ])
})

test('pro rata-poster ganges op med forholdsmæssige måneder, ikke med 30/360', () => {
  const o = kald()
  assert.equal(raekke(o, 'indtaegter', 'indtaegter.leje').beloeb, 21774)     // 4500 × 4,8387
  assert.equal(raekke(o, 'indtaegter', 'indtaegter.leje').prorata, true)
  assert.equal(raekke(o, 'indtaegter', 'indtaegter.vand').beloeb, 1452)
  assert.equal(raekke(o, 'udgifter', 'udgifter.faellesudgifter').beloeb, 13250)  // ikke pro rata
  assert.equal(raekke(o, 'udgifter', 'udgifter.faellesudgifter').prorata, false)
  assert.equal(o.sum.indtaegter, 21774 + 1452 + 1452)
})

test('beløbene kommer med som både tal og færdig dansk tekst, så begge flader skriver det samme', () => {
  const r = raekke(kald(), 'indtaegter', 'indtaegter.leje')
  assert.equal(r.beloeb, 21774)
  assert.equal(r.vaerdi, '21.774 kr.')
})

test('udlejningsresultatet er indtægter minus udgifter, før renter', () => {
  const o = kald()
  assert.equal(o.sum.udlejningsresultat, o.sum.indtaegter - o.sum.udgifter)
  assert.equal(raekke(o, 'resultat', 'resultat.udlejningsresultat').beloeb, o.sum.udlejningsresultat)
  assert.equal(o.sum.renter, 17849)
})

// ── Hjemløse poster (ADR-0001) ────────────────────────────────────────────────

test('en hjemløs post får sin egen række og tælles med i totalen', () => {
  const medLegacy = raatSaet({
    udgifter: { grundskyld: 3120, faellesudgifter: 13250, vedligeholdelse: 5211, andet: 2695, ejerforening: 1000 },
  })
  const o = kald({ years: [{ id: 8, aar: 2025, budget: medLegacy, faktisk: medLegacy }] })
  const hjemloes = sektion(o, 'udgifter').raekker.find(r => r.hjemloes)
  assert.ok(hjemloes, 'den hjemløse post mangler sin række')
  assert.equal(hjemloes.id, 'udgifter.ejerforening')
  assert.equal(hjemloes.beloeb, 1000)
  assert.match(hjemloes.label, /ejerforening/)
  assert.equal(o.sum.udgifter, 3120 + 13250 + 5211 + 2695 + 1000)
  const poster = sektion(o, 'udgifter').raekker.filter(r => !r.sum).reduce((n, r) => n + r.beloeb, 0)
  assert.equal(poster, o.sum.udgifter, 'rækkerne skal summe til totalen')
})

test('en hjemløs post vises også når beløbet er nul — nøglen er selv oplysningen', () => {
  const medTom = raatSaet({ indtaegter: { leje: 4500, fremleje: 0 } })
  const o = kald({ years: [{ id: 8, aar: 2025, budget: medTom, faktisk: medTom }] })
  assert.equal(sektion(o, 'indtaegter').raekker.filter(r => r.hjemloes).length, 1)
})

test('kendte poster er ikke hjemløse, heller ikke når samme nøgle findes i begge grupper', () => {
  const o = kald()
  assert.equal(o.opstilling.sektioner.flatMap(s => s.raekker).some(r => r.hjemloes), false)
})

// ── Fordeling mellem ægtefæller (§25 A) ───────────────────────────────────────

test('alt_paa_en: hele resultatet og alle renter hos den ægtefælle der driver udlejningen', () => {
  const o = kald()
  assert.equal(o.fordeling.mode, 'alt_paa_en')
  assert.equal(o.fordeling.beskattetPersonId, 1)
  const [nanna, thomas] = o.personer
  assert.equal(nanna.erBeskattet, true)
  assert.equal(nanna.resultatAndel, o.sum.udlejningsresultat)    // 100 %, ikke ejerandelen
  assert.equal(nanna.renter, 17849)
  assert.equal(thomas.erBeskattet, false)
  assert.equal(thomas.resultatAndel, 0)
  assert.equal(thomas.renter, 0)
  assert.equal(thomas.renterFysisk, 17849 / 2)                   // det han "flytter" til ægtefællen
})

test('del: resultat efter ejerandel, renter efter hæftelse', () => {
  const o = kald({ settings: { fordeling_mode: 'del', beskattet_person_id: null } })
  assert.equal(o.fordeling.mode, 'del')
  const [nanna, thomas] = o.personer
  assert.equal(nanna.erBeskattet, true)
  assert.equal(thomas.erBeskattet, true)
  assert.equal(nanna.resultatAndel, o.sum.udlejningsresultat / 2)
  assert.equal(thomas.resultatAndel, o.sum.udlejningsresultat / 2)
  assert.equal(nanna.renter, 17849 / 2)
  assert.equal(thomas.renter, 17849 / 2)
})

test('fordelingssektionen viser samme række til begge flader, med navn, resultat og renter', () => {
  const o = kald()
  const r = sektion(o, 'fordeling').raekker
  assert.equal(r[0].label, 'Nanna — resultat 402 kr., renter 17.849 kr.')
  assert.equal(r[0].beloeb, 402 - 17849)
  assert.equal(r[1].label, 'Thomas (beskattes ikke) — resultat 0 kr., renter 0 kr.')
  assert.equal(r[2].label, 'Renteudgifter i alt (personlige, kapitalindkomst)')
  assert.equal(r[2].sum, true)
  assert.equal(r[2].beloeb, 17849)
})

// ── Forbedringer (ikke fradrag) ───────────────────────────────────────────────

test('forbedringer uden beløb giver ingen sektion, og indgår aldrig i udgifterne', () => {
  const o = kald()
  assert.equal(sektion(o, 'forbedringer'), undefined)
  assert.equal(o.sum.forbedringer, 0)
  assert.equal(o.sum.udgifter, 3120 + 13250 + 5211 + 2695)
})

test('forbedringer med beløb får egen sektion uden for udlejningsresultatet', () => {
  const medForbedring = raatSaet({ forbedringer: 40000 })
  const o = kald({ years: [{ id: 8, aar: 2025, budget: medForbedring, faktisk: medForbedring }] })
  const s = sektion(o, 'forbedringer')
  assert.equal(s.titel, 'Forbedringer (ikke fradrag)')
  assert.equal(s.raekker[0].beloeb, 40000)
  assert.equal(o.sum.forbedringer, 40000)
  assert.equal(o.sum.udgifter, 3120 + 13250 + 5211 + 2695, 'forbedringer er ikke fradrag')
  assert.equal(o.sum.udlejningsresultat, kald().sum.udlejningsresultat)
})

// ── Bilagsoversigten ──────────────────────────────────────────────────────────

const bl = (id, aar, over = {}) => ({
  id, aar, dato: `${aar}-03-17`, tekst: `bilag ${id}`, post_id: 'udgifter.vedligeholdelse',
  type: 'udgift', beloeb: 1000, mimetype: 'application/pdf', filsti: `${id}.pdf`, ...over,
})

test('bilagsoversigten nummereres gapfrit fra årets egen liste', () => {
  const o = kald({ bilag: [bl(2, 2025, { nummer: 1 }), bl(4, 2025, { nummer: 2 }), bl(5, 2026)] })
  assert.equal(o.opstilling.bilagsoversigt.antal, 2)
  assert.deepEqual(o.opstilling.bilagsoversigt.raekker.map(r => r.celler.nummer), ['1', '2'])
  assert.deepEqual(o.bilag.map(b => b.id), [2, 4])                // filerne PDF'en skal vedhæfte
})

test('bilagets fortegn følger typen, og beløbet vises med ører', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 21608.75 }), bl(2, 2025, { type: 'indtaegt', beloeb: 500 })] })
  const [udgift, indtaegt] = o.opstilling.bilagsoversigt.raekker
  assert.equal(udgift.celler.beloeb, '-21.608,75 kr.')
  assert.equal(indtaegt.celler.beloeb, '500,00 kr.')
})

test('et år uden bilag giver en tom oversigt med en forklarende tekst — ikke en fejl', () => {
  const o = kald({ bilag: [bl(1, 2026)] })
  assert.equal(o.opstilling.bilagsoversigt.antal, 0)
  assert.deepEqual(o.opstilling.bilagsoversigt.raekker, [])
  assert.equal(o.opstilling.bilagsoversigt.tom_tekst, 'Ingen bilag registreret.')
  assert.equal(o.opstilling.bilagsoversigt.titel, 'Bilagsoversigt (0)')
  assert.deepEqual(o.bilag, [])
})

test('bilagsoversigtens kolonner er de samme på begge flader', () => {
  const o = kald({ bilag: [bl(1, 2025)] })
  assert.deepEqual(o.opstilling.bilagsoversigt.kolonner.map(k => k.id), ['nummer', 'dato', 'tekst', 'post', 'beloeb'])
  assert.deepEqual(Object.keys(o.opstilling.bilagsoversigt.raekker[0].celler), ['nummer', 'dato', 'tekst', 'post', 'beloeb'])
})

test('bilagsoversigten viser postens danske label — ikke postens id', () => {
  const o = kald({
    bilag: [
      bl(1, 2025),
      bl(2, 2025, { post_id: 'renteudgifter.renteudgifter' }),
      bl(3, 2025, { post_id: 'indtaegter.leje', type: 'indtaegt' }),
    ],
  })
  assert.deepEqual(o.opstilling.bilagsoversigt.raekker.map(r => r.celler.post),
    ['Vedligeholdelse', 'Renteudgifter', 'Husleje'])
})

test('et bilag med en uoversættelig kategori vises markeret frem for at stå tomt', () => {
  const o = kald({ bilag: [bl(1, 2025, { post_id: null, kategori: 'Ejerforening' })] })
  assert.equal(o.opstilling.bilagsoversigt.raekker[0].celler.post, 'Ejerforening (ukendt post)')
})

test('et bilag på en ikke-summerbar post ændrer ikke udlejningsresultatet', () => {
  const uden = kald()
  const med = kald({
    bilag: [
      bl(1, 2025, { post_id: 'renteudgifter.renteudgifter', beloeb: 17849 }),
      bl(2, 2025, { post_id: 'forbedringer.forbedringer', beloeb: 40000 }),
    ],
  })
  assert.equal(med.sum.udlejningsresultat, uden.sum.udlejningsresultat)
  assert.equal(med.sum.udgifter, uden.sum.udgifter)
  assert.equal(med.sum.forbedringer, uden.sum.forbedringer, 'bilaget er dokumentation, ikke en indtastning')
})

// ── Afstemningen (ADR-0005) ───────────────────────────────────────────────────

const afstemning = (o) => o.opstilling.afstemning
const afstRaekke = (o, id) => afstemning(o).raekker.find(r => r.id === id)

test('en post hvis bilag summer til det indtastede årsbeløb markeres som stemmende', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5211 })] })      // udgifter.vedligeholdelse = 5211
  const r = afstRaekke(o, 'udgifter.vedligeholdelse')
  assert.equal(r.indtastet, 5211)
  assert.equal(r.bilagssum, 5211)
  assert.equal(r.difference, 0)
  assert.equal(r.status, 'stemmer')
})

test('en post hvor bilagene ikke summer til det indtastede beløb markeres med differencen', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5000 })] })      // indtastet 5211
  const r = afstRaekke(o, 'udgifter.vedligeholdelse')
  assert.equal(r.bilagssum, 5000)
  assert.equal(r.difference, -211)
  assert.equal(r.status, 'difference')
  assert.equal(r.celler.difference, '-211,00 kr.')
  assert.equal(r.celler.status, 'Difference')
})

// Alle tre tal skal stå på rækken — også når differencen er nul. "Stemmer" alene
// fortæller ikke, at der faktisk ER regnet en difference ud.
test('rækken viser indtastet årsbeløb, bilagssum OG difference — også når den er nul', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5211 })] })
  const r = afstRaekke(o, 'udgifter.vedligeholdelse')
  assert.equal(r.celler.indtastet, '5.211,00 kr.')
  assert.equal(r.celler.bilagssum, '5.211,00 kr.')
  assert.equal(r.celler.difference, '0,00 kr.')
})

test('en difference over det indtastede får eksplicit fortegn, så retningen ikke skal gættes', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5211.75 })] })
  assert.equal(afstRaekke(o, 'udgifter.vedligeholdelse').celler.difference, '+0,75 kr.')
})

test('flere bilag på samme post lægges sammen, og øre tæller med', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5000.5 }), bl(2, 2025, { beloeb: 210.5 })] })
  const r = afstRaekke(o, 'udgifter.vedligeholdelse')
  assert.equal(r.antal, 2)
  assert.equal(r.bilagssum, 5211)
  assert.equal(r.status, 'stemmer')
})

// Det er det EFFEKTIVE årsbeløb der afstemmes — huslejen tastes som 4.500 kr. pr.
// måned, men regnskabet viser 21.774 kr., og det er det tal bilagene skal dokumentere.
test('en pro rata-post afstemmes mod årsbeløbet, ikke mod månedsbeløbet', () => {
  const o = kald({ bilag: [bl(1, 2025, { post_id: 'indtaegter.leje', type: 'indtaegt', beloeb: 21774 })] })
  const r = afstRaekke(o, 'indtaegter.leje')
  assert.equal(r.indtastet, 21774)
  assert.equal(r.status, 'stemmer')
})

// Posten bestemmer HVILKEN række bilaget hører til, typen bestemmer FORTEGNET.
// En kreditnota på husleje er et 'udgift'-bilag på en indtægtspost: den trækker fra
// huslejens bilagssum og flytter ikke over på udgiftssiden (afgjort i #9/#13).
test('en kreditnota trækker fra sin egen posts bilagssum i stedet for at skifte side', () => {
  const o = kald({
    bilag: [
      bl(1, 2025, { post_id: 'indtaegter.leje', type: 'indtaegt', beloeb: 22774 }),
      bl(2, 2025, { post_id: 'indtaegter.leje', type: 'udgift', beloeb: 1000 }),   // kreditnota
    ],
  })
  const leje = afstRaekke(o, 'indtaegter.leje')
  assert.equal(leje.antal, 2)
  assert.equal(leje.bilagssum, 21774)
  assert.equal(leje.status, 'stemmer')
  assert.equal(afstRaekke(o, 'udgifter.andet').antal, 0, 'kreditnotaen må ikke lande på en udgiftspost')
})

test('en refusion på en udgiftspost trækker tilsvarende fra udgiftspostens bilagssum', () => {
  const o = kald({
    bilag: [
      bl(1, 2025, { beloeb: 6000 }),
      bl(2, 2025, { type: 'indtaegt', beloeb: 789 }),   // refusion på vedligeholdelse
    ],
  })
  assert.equal(afstRaekke(o, 'udgifter.vedligeholdelse').bilagssum, 5211)
})

test('en post uden bilag vises neutralt som "ingen bilag" — ikke som en fejl', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5211 })] })
  const r = afstRaekke(o, 'udgifter.grundskyld')                  // indtastet 3120, ingen bilag
  assert.equal(r.indtastet, 3120)
  assert.equal(r.bilagssum, null)
  assert.equal(r.difference, null)
  assert.equal(r.status, 'ingen_bilag')
  assert.equal(r.celler.status, 'Ingen bilag')
  assert.equal(r.celler.bilagssum, '—')
  assert.equal(r.celler.difference, '—', 'uden bilag findes der ingen difference at vise')
})

test('en post uden både beløb og bilag får ingen række — den fylder kun afstemningen', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5211 })] })
  assert.equal(afstRaekke(o, 'udgifter.forsikring'), undefined)   // 0 kr. og ingen bilag
})

test('et år helt uden bilag giver en tom afstemning med en forklarende tekst', () => {
  const o = kald({ bilag: [bl(1, 2026)] })                        // bilaget hører til et andet år
  assert.deepEqual(afstemning(o).raekker, [])
  assert.equal(afstemning(o).tom_tekst, 'Ingen bilag registreret — der er intet at afstemme.')
})

// Bilag på renteudgifter og forbedringer skal kunne afstemmes, selv om posterne ligger
// uden for udlejningsresultatet. Deres beløb ligger på gruppeniveau i talsættet —
// `saet.forbedringer` er en skalar, og `saet.renteudgifter` er nøglet på lånets id.
test('bilag på de ikke-summerbare poster afstemmes uden at påvirke udlejningsresultatet', () => {
  const uden = kald()
  const o = kald({
    bilag: [
      bl(1, 2025, { post_id: 'renteudgifter.renteudgifter', beloeb: 17849 }),
      bl(2, 2025, { post_id: 'forbedringer.forbedringer', beloeb: 40000 }),
    ],
  })
  const renter = afstRaekke(o, 'renteudgifter.renteudgifter')
  assert.equal(renter.indtastet, 17849, 'summen af lånenes renter, ikke en nøgleopslag')
  assert.equal(renter.status, 'stemmer')
  const forbedring = afstRaekke(o, 'forbedringer.forbedringer')
  assert.equal(forbedring.indtastet, 0)
  assert.equal(forbedring.bilagssum, 40000)
  assert.equal(forbedring.status, 'difference')
  assert.equal(o.sum.udlejningsresultat, uden.sum.udlejningsresultat)
  assert.equal(o.sum.forbedringer, 0, 'bilaget er dokumentation, ikke en indtastning')
})

test('bilag med ukendt post samles i én markeret række — de forsvinder ikke tavst', () => {
  const o = kald({
    bilag: [
      bl(1, 2025, { beloeb: 5211 }),
      bl(2, 2025, { post_id: null, kategori: 'Ejerforening', beloeb: 1200 }),
      bl(3, 2025, { post_id: 'udgifter.ejerforening', beloeb: 800 }),   // id kontoplanen ikke kender
    ],
  })
  const r = afstRaekke(o, 'afstemning.ukendte')
  assert.equal(r.status, 'ukendt_post')
  assert.equal(r.antal, 2)
  assert.equal(r.celler.post, 'Bilag med ukendt post (2)')
  assert.equal(r.celler.status, 'Kan ikke afstemmes')
  // Rækken tæller, den summer ikke: uden en post er der ingen gruppe at se fortegnet
  // fra, og samme kolonne må ikke bære to forskellige fortegnskonventioner.
  assert.equal(r.bilagssum, null)
  assert.equal(r.celler.bilagssum, '—')
  assert.equal(r.celler.difference, '—')
  assert.equal(afstRaekke(o, 'udgifter.vedligeholdelse').status, 'stemmer', 'de øvrige poster afstemmes stadig')
})

test('afstemningen gælder kun grundlaget faktisk — ved budget er den fraværende', () => {
  const medBilag = { bilag: [bl(1, 2025, { beloeb: 5211 })] }
  assert.ok(kald(medBilag, 2025, 'faktisk').opstilling.afstemning)
  assert.equal(kald(medBilag, 2025, 'budget').opstilling.afstemning, null)
})

test('afstemningens kolonner er de samme på begge flader', () => {
  const o = kald({ bilag: [bl(1, 2025, { beloeb: 5211 })] })
  assert.deepEqual(afstemning(o).kolonner.map(k => k.id), ['post', 'indtastet', 'bilagssum', 'difference', 'status'])
  for (const r of afstemning(o).raekker) {
    assert.deepEqual(Object.keys(r.celler), ['post', 'indtastet', 'bilagssum', 'difference', 'status'])
  }
})

test('et bilag med gammel fri kategori migreres af indgangen selv', () => {
  // Indgangen lover db-formede data ind (ADR-0004), og en DB fra disken kan stadig
  // bære den gamle kategori. Uden migrering her ville bilaget tavst blive en
  // "ukendt post" — et svar der ser plausibelt ud, netop når oplysningen mangler.
  const gammelt = { id: 1, aar: 2025, dato: '2025-03-17', tekst: 'bilag 1', kategori: 'Vedligeholdelse', type: 'udgift', beloeb: 5211 }
  const o = kald({ bilag: [gammelt] })
  const r = afstRaekke(o, 'udgifter.vedligeholdelse')
  assert.equal(r.bilagssum, 5211, 'bilaget skal ramme sin post, ikke havne som ukendt')
  assert.equal(r.status, 'stemmer')
  assert.equal(afstemning(o).raekker.find(x => x.status === 'ukendt_post'), undefined)
})

test('migreringen i indgangen muterer ikke inddata', () => {
  const gammelt = { id: 1, aar: 2025, dato: '2025-03-17', tekst: 'bilag 1', kategori: 'Vedligeholdelse', type: 'udgift', beloeb: 5211 }
  kald({ bilag: [gammelt] })
  assert.equal(gammelt.post_id, undefined)
  assert.equal(gammelt.kategori, 'Vedligeholdelse')
})

// ── Noten ─────────────────────────────────────────────────────────────────────

test('noteteksten findes ét sted og er den samme i opstillingen', () => {
  assert.equal(kald().opstilling.note, REGNSKABSNOTE)
  assert.match(REGNSKABSNOTE, /nærtstående/)
  assert.match(REGNSKABSNOTE, /Renteudgifter er personlige/)
})
