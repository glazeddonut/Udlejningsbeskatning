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
    navn: 'Bøgevej 12, 2. th',
    adresse: 'Bøgevej 12, 2. th',
    ejerandele: { 1: 50, 2: 50 },
  },
  loans: [{ id: 1, laangiver: 'Eksempelbanken', restgaeld: 1500000, rente_pct: 3, haeftelse: { 1: 50, 2: 50 } }],
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

// ADR-0002: dagstallene holder op med at gætte. Talsættet herunder bærer stadig det
// gamle fra_maaned/til_maaned (1–12), som tidligere gav 360 — netop SKATs egen værdi
// for et helt udlejningsår.
test('et talsæt uden periode giver 0 dage, ikke 360', () => {
  for (const uden of [
    raatSaet({ fra_dato: '', til_dato: '' }),          // ingen af delene
    raatSaet({ til_dato: '' }),                        // kun fra-dato
    raatSaet({ fra_dato: '' }),                        // kun til-dato
  ]) {
    const o = kald({ years: [{ id: 8, aar: 2025, budget: uden, faktisk: uden }] })
    assert.equal(o.periode.mangler, true)
    assert.equal(o.dagstal.udlejningsdage, 0)
    assert.equal(o.dagstal.indberetningsdage, 0)
  }
})

test('opstillingens hoved skriver "periode mangler" frem for et dagstal', () => {
  const uden = raatSaet({ fra_dato: '', til_dato: '' })
  const o = kald({ years: [{ id: 8, aar: 2025, budget: uden, faktisk: uden }] })
  assert.equal(
    o.opstilling.hoved.linjer[2],
    'Grundlag: faktiske tal · Udlejet til nærtstående: ja · udlejningsperiode mangler',
  )
  assert.doesNotMatch(o.opstilling.hoved.linjer[2], /\d+ udlejningsdage/)
})

test('et hul-år uden lejekontrakt får ingen afledt periode og ingen 360', () => {
  const leases = [
    { id: 1, startdato: '2025-08-05', slutdato: '2027-06-30', maanedlig_leje: 4500 },
    { id: 2, startdato: '2029-01-01', maanedlig_leje: 6000 },
  ]
  const uden = raatSaet({ fra_dato: '', til_dato: '' })
  const o = kald({ leases, years: [{ id: 20, aar: 2028, budget: uden, faktisk: uden }] }, 2028)
  assert.equal(o.aarsgrundlag.lease, null)
  assert.equal(o.aarsgrundlag.fra_dato, '')
  assert.equal(o.aarsgrundlag.dage360, 0)
  assert.equal(o.aarsgrundlag.mangler, true)
  assert.equal(o.dagstal.indberetningsdage, 0)
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
    'Bøgevej 12, 2. th, Bøgevej 12, 2. th',
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

// ── Den udlejede andel (ADR-0003) ─────────────────────────────────────────────
//
// Andelen indberettes til skat.dk (felt 744) og er fra nu af også den andel fradraget
// er REGNET på. Den rammer kun ejendomsposter — hele ejendommens omkostninger — aldrig
// indtægter og aldrig poster der udelukkende vedrører det udlejede.

const medAndel = (pct) => kald({ years: [{ id: 8, aar: 2025, budget: raatSaet({ udlejet_andel_pct: pct }), faktisk: raatSaet({ udlejet_andel_pct: pct }) }] })

test('fuld udlejning: opstillingen er tal for tal og ord for ord den samme som uden andelen', () => {
  const uden = kald({ years: [{ id: 8, aar: 2025, budget: raatSaet({ udlejet_andel_pct: undefined }), faktisk: raatSaet({ udlejet_andel_pct: undefined }) }] })
  assert.deepEqual(medAndel(100).opstilling, uden.opstilling)
  assert.deepEqual(medAndel(100).sum, uden.sum)
})

test('en delvis andel skærer kun ejendomsposternes rækker ned', () => {
  const o = medAndel(60)
  assert.equal(raekke(o, 'udgifter', 'udgifter.grundskyld').beloeb, 3120 * 0.6)          // 1.872
  assert.equal(raekke(o, 'udgifter', 'udgifter.faellesudgifter').beloeb, 13250 * 0.6)    // 7.950
  assert.equal(raekke(o, 'udgifter', 'udgifter.vedligeholdelse').beloeb, 5211)           // kun det udlejede
  assert.equal(raekke(o, 'udgifter', 'udgifter.andet').beloeb, 2695)
  assert.equal(o.sum.udgifter, 24276 - (3120 + 13250) * 0.4)                             // 17.728
  assert.equal(o.sum.indtaegter, 24678)                                                  // uændret
  assert.equal(o.sum.udlejningsresultat, 24678 - 17728)
})

test('indtægtssektionen er upåvirket af enhver andel — lejen er den leje der er modtaget', () => {
  const fuld = medAndel(100)
  for (const pct of [0, 33, 60, 99]) {
    assert.deepEqual(
      sektion(medAndel(pct), 'indtaegter').raekker.map(r => [r.id, r.beloeb]),
      sektion(fuld, 'indtaegter').raekker.map(r => [r.id, r.beloeb]),
      `andel ${pct}`,
    )
  }
})

test('rækkerne summer stadig til sektionens sumrække ved en delvis andel', () => {
  for (const s of medAndel(60).opstilling.sektioner) {
    if (s.id !== 'indtaegter' && s.id !== 'udgifter') continue
    const poster = s.raekker.filter(r => !r.sum).reduce((n, r) => n + r.beloeb, 0)
    assert.equal(poster, s.raekker.find(r => r.sum).beloeb, `${s.id} summer ikke`)
  }
})

// ADR-0001 gælder det brugeren SER, ikke kun tallene bag. Rækkerne skrives med kr() uden
// decimaler, så en andel der efterlod ører ville give et regnskab hvor de viste rækker
// ikke kunne lægges sammen til den viste total: 60 % af 3.121 er 1.872,60 og står som
// "1.873", men ville tælle 1.872,60 med i summen.
test('de VISTE rækker summer til den viste total, også ved en skæv andel', () => {
  const s = raatSaet({
    udlejet_andel_pct: 60,
    udgifter: { grundskyld: 3121, faellesudgifter: 13251, vedligeholdelse: 5211, andet: 2695 },
  })
  const o = kald({ years: [{ id: 8, aar: 2025, budget: s, faktisk: s }] })
  const sek = sektion(o, 'udgifter')
  const somTal = (v) => Number(v.replace(/[^\d-]/g, ''))   // "1.873 kr." → 1873
  const visteTal = sek.raekker.filter(r => !r.sum).map(r => somTal(r.vaerdi))
  const visttotal = somTal(sek.raekker.find(r => r.sum).vaerdi)
  assert.equal(visteTal.reduce((a, b) => a + b, 0), visttotal)
  assert.deepEqual(visteTal, [1873, 7951, 5211, 2695])           // 60 % af 3.121 / 13.251
  assert.equal(visttotal, 17730)
})

// Beregningen må ikke være en black box: rækken skal selv sige HVOR meget der er skåret
// fra og af hvilket beløb. Teksten står i labellen, fordi det er den kanal både skærmen
// og PDF'en skriver — de to må ikke kunne vise hver sin forklaring.
test('en nedskrevet række siger selv at den er nedskrevet, og af hvilket beløb', () => {
  const r = raekke(medAndel(60), 'udgifter', 'udgifter.grundskyld')
  assert.equal(r.label, 'Grundskyld (ejendomsskat) — 60 % af 3.120 kr.')
  assert.equal(r.beloebFoerAndel, 3120)
  assert.equal(r.andel, true)
  assert.equal(raekke(medAndel(60), 'udgifter', 'udgifter.vedligeholdelse').label, 'Vedligeholdelse')
  assert.equal(raekke(medAndel(60), 'udgifter', 'udgifter.vedligeholdelse').andel, false)
})

test('ved fuld udlejning står der ikke noget om andelen nogen steder', () => {
  const o = medAndel(100)
  assert.equal(raekke(o, 'udgifter', 'udgifter.grundskyld').label, 'Grundskyld (ejendomsskat)')
  assert.equal(sektion(o, 'udgifter').forklaring, '')
  assert.equal(o.opstilling.hoved.linjer[2].includes('andel'), false)
})

test('udgiftssektionen forklarer hvilke poster andelen rammer', () => {
  const f = sektion(medAndel(60), 'udgifter').forklaring
  assert.match(f, /60 %/)
  assert.match(f, /Grundskyld \(ejendomsskat\), Fællesudgifter \(drift\)/)
})

test('hovedet skriver andelen, så den står sammen med de øvrige indberetningstal', () => {
  assert.match(medAndel(60).opstilling.hoved.linjer[2], /· Udlejet andel: 60 %$/)
})

// En post der er skrevet HELT ned beholder sin række. Et fradrag der forsvinder sporløst
// er præcis den black box ticketen skal væk fra — rækken skal kunne læses som "her stod
// 3.120 kr., og andelen tog dem alle".
test('0 % nulstiller ejendomsposternes fradrag og kun dem, men skjuler dem ikke', () => {
  const o = medAndel(0)
  const r = raekke(o, 'udgifter', 'udgifter.grundskyld')
  assert.equal(r.beloeb, 0)
  assert.equal(r.beloebFoerAndel, 3120)
  assert.equal(r.label, 'Grundskyld (ejendomsskat) — 0 % af 3.120 kr.')
  assert.equal(o.sum.udgifter, 5211 + 2695)
  assert.equal(o.sum.indtaegter, 24678)
  assert.match(o.opstilling.hoved.linjer[2], /· Udlejet andel: 0 %$/)
})

test('en ejendomspost uden beløb får stadig ingen række — den fylder kun regnskabet', () => {
  assert.equal(raekke(medAndel(60), 'udgifter', 'udgifter.forsikring'), undefined)   // 0 kr. tastet
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

// Den udlejede andel er en fradragsBEGRÆNSNING, ikke et andet betalt beløb. Bilaget
// dokumenterer hvad der ER betalt, og afstemningen er en kontrol af INDTASTNINGEN mod
// bilagene. Blev der afstemt mod det nedskrevne fradrag, ville hver eneste ejendomspost
// lyse "difference" for evigt ved delvis udlejning — og en advarsel der altid lyser,
// lærer man at ignorere.
test('afstemningen holder bilagene op mod det afholdte beløb, ikke mod det nedskrevne fradrag', () => {
  const s = raatSaet({ udlejet_andel_pct: 60 })
  const o = kald({
    years: [{ id: 8, aar: 2025, budget: s, faktisk: s }],
    bilag: [bl(1, 2025, { post_id: 'udgifter.grundskyld', beloeb: 3120 })],
  })
  const r = afstRaekke(o, 'udgifter.grundskyld')
  assert.equal(r.indtastet, 3120)                                // det afholdte, ikke 1.872
  assert.equal(r.bilagssum, 3120)
  assert.equal(r.status, 'stemmer')
  assert.equal(raekke(o, 'udgifter', 'udgifter.grundskyld').beloeb, 1872)  // regnskabet viser fradraget
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

// Rettevejen i Bilag-fanen (#19) sætter en post på et bilag der stod med ukendt post.
// Det er afstemningen der skal mærke det: bilaget flytter fra den markerede række over
// på sin egen post. Her måles KONSEKVENSEN — samme bilag (samme id, beløb og fil) før
// og efter, så det eneste der skifter, er posten. Selve skrivningen — at posten sættes
// og den bevarede kategori ryddes — er prøvet gennem endepunktet i server.test.js.
test('et bilag der får sin post sat, flytter fra den ukendte række over på posten', () => {
  const ukendt = { post_id: null, kategori: 'Ejerforening', beloeb: 5211 }
  const foer = kald({ bilag: [bl(1, 2025, ukendt)] })
  assert.equal(afstRaekke(foer, 'afstemning.ukendte').antal, 1)
  assert.equal(afstRaekke(foer, 'udgifter.vedligeholdelse').status, 'ingen_bilag')

  // Præcis det rettevejen skriver: posten sættes, og den bevarede kategori ryger med.
  const efter = kald({ bilag: [bl(1, 2025, { post_id: 'udgifter.vedligeholdelse', beloeb: 5211 })] })
  assert.equal(afstRaekke(efter, 'afstemning.ukendte'), undefined, 'den markerede række skal forsvinde')
  const r = afstRaekke(efter, 'udgifter.vedligeholdelse')
  assert.equal(r.antal, 1)
  assert.equal(r.bilagssum, 5211)
  assert.equal(r.status, 'stemmer')
  // Bilaget står i oversigten begge gange — det er posten der ændrer sig, ikke bilaget.
  assert.equal(foer.opstilling.bilagsoversigt.antal, 1)
  assert.equal(efter.opstilling.bilagsoversigt.raekker[0].celler.nummer, '1')
  assert.equal(efter.opstilling.bilagsoversigt.raekker[0].celler.post, 'Vedligeholdelse')
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

// ── Kvittering på en periodeafvigelse ─────────────────────────────────────────
//
// Fixturens 2025 har gemt 6. august mod lejekontraktens 5. — den faktiske indflytning
// skete dagen efter, så afvigelsen er rigtig. Kvitteringen gør advarslen til en neutral
// note, og begrundelsen følger med i regnskabets note, hvor den hører hjemme over for
// SKAT. Noten er ÉN streng, så skærmen og PDF'en skriver ordret det samme.

const BEGRUNDELSE = 'Faktisk indflytning skete 6. august, dagen efter kontraktens start.'
// Kvitteringen som den ligger på disken: begrundelsen plus de to perioder den blev
// givet for. En ren boolean ville kunne dække over en periode der er ændret siden.
const KVITTERING = {
  begrundelse: BEGRUNDELSE,
  gemt: { fra_dato: '2025-08-06', til_dato: '2025-12-31' },
  afledt: { fra_dato: '2025-08-05', til_dato: '2025-12-31' },
}
const medKvittering = (over = {}) => {
  const s = raatSaet({ periode_kvittering: KVITTERING, ...over })
  return { years: [{ id: 8, aar: 2025, budget: s, faktisk: s }] }
}

test('en afvigelse uden begrundelse er ukvitteret og står ikke i noten', () => {
  const o = kald()
  assert.equal(o.periodeafvigelse.kvitteret, false)
  assert.equal(o.opstilling.note, REGNSKABSNOTE)
})

test('en kvitteret afvigelse bliver til en neutral note med begrundelsen', () => {
  const o = kald(medKvittering())
  assert.equal(o.periodeafvigelse.kvitteret, true)
  assert.equal(o.periodeafvigelse.begrundelse, BEGRUNDELSE)
  // Perioden er uændret — en kvittering forklarer, den retter ikke (ADR-0002).
  assert.equal(o.periode.fra_dato, '2025-08-06')
  assert.equal(o.dagstal.indberetningsdage, 145)
})

test('begrundelsen når frem til opstillingens note — den ene tekst begge flader skriver', () => {
  const note = kald(medKvittering()).opstilling.note
  assert.match(note, /Faktisk indflytning skete 6\. august/)
  assert.match(note, /2025-08-06/)                       // talsættets egen periode
  assert.match(note, /2025-08-05/)                       // lejekontraktens
  assert.match(note, /145/)                              // det dagstal der indberettes
  assert.ok(note.startsWith(REGNSKABSNOTE), 'den faste note står stadig først')
})

test('kvitteringen dækker ikke en periode der er ændret siden — advarslen vender tilbage', () => {
  // Talsættets periode flyttes efter kvitteringen.
  const flyttet = kald(medKvittering({ fra_dato: '2025-09-01' }))
  assert.equal(flyttet.periodeafvigelse.kvitteret, false)
  assert.equal(flyttet.periodeafvigelse.foraeldet, true)
  assert.equal(flyttet.opstilling.note, REGNSKABSNOTE)

  // Eller lejekontrakten rettes efter kvitteringen.
  const rettetLease = kald({
    ...medKvittering(),
    leases: [{ id: 1, startdato: '2025-07-01', slutdato: '2025-12-31', maanedlig_leje: 4500 }],
  })
  assert.equal(rettetLease.periodeafvigelse.kvitteret, false)
  assert.equal(rettetLease.periodeafvigelse.foraeldet, true)
  assert.equal(rettetLease.opstilling.note, REGNSKABSNOTE)
})

test('en manglende periode kan ikke kvitteres væk — noten påstår ikke en bevidst afvigelse', () => {
  const o = kald(medKvittering({
    fra_dato: '', til_dato: '',
    periode_kvittering: { ...KVITTERING, gemt: { fra_dato: '', til_dato: '' } },
  }))
  assert.equal(o.periode.mangler, true)
  assert.equal(o.periodeafvigelse.kvitteret, false)
  assert.equal(o.opstilling.note, REGNSKABSNOTE)
})

test('uden afvigelse er der intet at kvittere — heller ikke med en gammel kvittering liggende', () => {
  const o = kald(medKvittering({ fra_dato: '2025-08-05' }))   // enig med lejekontrakten
  assert.equal(o.periodeafvigelse, null)
  assert.equal(o.opstilling.note, REGNSKABSNOTE)
})
