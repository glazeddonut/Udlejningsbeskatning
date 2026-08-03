import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tomtSaet, sumIndtaegter, sumFradragsUdgifter, resultatFoerRenter,
  sumRenter, fordelPrPerson, renterPrPerson, personOpgoerelse, markedslejeTjek,
  resolveFordeling, antalMaaneder, udlejningsdage, effektivBeloeb, estimeretAarligRente,
  periodeForAar, prorataMaaneder, leaseForAar, udlejningsdage360,
  aarsgrundlag, periodeAfvigelse, periodeKvittering, gruppeOpgoerelse, manglerPeriode,
  udlejetAndel, fradragsBeloeb,
} from './beregning.js'

// Fælles testopsætning: to ægtefæller 50/50, ét realkreditlån 50/50 hæftelse.
// Person 1 (Nanna) er udlejer = drivende ægtefælle.
const persons = [{ id: 1, navn: 'Nanna', rolle: 'udlejer' }, { id: 2, navn: 'Thomas', rolle: 'medejer' }]
const property = { ejerandele: { 1: 50, 2: 50 } }
const loans = [{ id: 1, haeftelse: { 1: 50, 2: 50 } }]
const DEL = { mode: 'del', beskattetPersonId: null }
const ALT = { mode: 'alt_paa_en', beskattetPersonId: 1 }

function eksempelSaet() {
  const s = tomtSaet()
  s.indtaegter = { leje: 72000, vand: 3600, varme: 3600, andet: 0 } // 79.200
  s.udgifter = {
    grundskyld: 7488, faellesudgifter: 24000, forsikring: 0, vedligeholdelse: 30000,
    vand: 3600, varme: 3600, administration: 0, renovation: 0, andet: 0,          // 68.688
  }
  s.forbedringer = 12000            // må IKKE påvirke resultatet
  s.renteudgifter = { 1: 42380 }
  return s
}

test('sumIndtaegter lægger alle indtægter sammen', () => {
  assert.equal(sumIndtaegter(eksempelSaet()), 79200)
})

test('sumFradragsUdgifter ekskluderer forbedringer', () => {
  assert.equal(sumFradragsUdgifter(eksempelSaet()), 68688)
})

test('resultatFoerRenter = indtægter − fradragsudgifter (forbedringer tæller ikke)', () => {
  assert.equal(resultatFoerRenter(eksempelSaet()), 79200 - 68688) // 10.512
})

test('resultat er upåvirket af forbedringer', () => {
  const s = eksempelSaet()
  const uden = resultatFoerRenter({ ...s, forbedringer: 0 })
  const med = resultatFoerRenter({ ...s, forbedringer: 999999 })
  assert.equal(uden, med)
})

test('sumRenter summerer på tværs af lån', () => {
  const s = eksempelSaet()
  s.renteudgifter = { 1: 42380, 2: 1000 }
  assert.equal(sumRenter(s), 43380)
})

test('fordelPrPerson fordeler 50/50', () => {
  const f = fordelPrPerson(10512, { 1: 50, 2: 50 })
  assert.equal(f[1], 5256)
  assert.equal(f[2], 5256)
})

test('renterPrPerson fordeler renter efter hæftelse', () => {
  const r = renterPrPerson(eksempelSaet(), loans)
  assert.equal(r[1], 21190)
  assert.equal(r[2], 21190)
})

test('renterPrPerson respekterer skæv hæftelse', () => {
  const skaevLoans = [{ id: 1, haeftelse: { 1: 70, 2: 30 } }]
  const r = renterPrPerson(eksempelSaet(), skaevLoans)
  assert.equal(Math.round(r[1]), Math.round(42380 * 0.7))
  assert.equal(Math.round(r[2]), Math.round(42380 * 0.3))
})

test('personOpgoerelse (del): fordeler resultat efter ejerandel og renter efter hæftelse', () => {
  const opg = personOpgoerelse(eksempelSaet(), { persons, property, loans, fordeling: DEL })
  const nanna = opg.find(o => o.personId === 1)
  assert.equal(nanna.resultatAndel, 5256)   // 10.512 / 2
  assert.equal(nanna.renter, 21190)         // 42.380 / 2
  assert.equal(nanna.erBeskattet, true)
  assert.equal(nanna.nettoKapitalindkomst, 5256 - 21190) // negativ = fradrag
})

test('personOpgoerelse (alt på den ene): hele resultat + alle renter hos den beskattede', () => {
  const opg = personOpgoerelse(eksempelSaet(), { persons, property, loans, fordeling: ALT })
  const nanna = opg.find(o => o.personId === 1)
  const thomas = opg.find(o => o.personId === 2)
  // Nanna beskattes af det hele
  assert.equal(nanna.erBeskattet, true)
  assert.equal(nanna.resultatAndel, 10512)
  assert.equal(nanna.renter, 42380)
  assert.equal(nanna.nettoKapitalindkomst, 10512 - 42380)
  // Thomas beskattes af 0, men hans fysiske renteandel kan flyttes til Nanna
  assert.equal(thomas.erBeskattet, false)
  assert.equal(thomas.resultatAndel, 0)
  assert.equal(thomas.renter, 0)
  assert.equal(thomas.renterFysisk, 21190)   // 42.380 / 2 (hæftelse)
})

test('resolveFordeling: default = alt på den ene, beskattet = udlejer', () => {
  const f = resolveFordeling({}, persons)
  assert.equal(f.mode, 'alt_paa_en')
  assert.equal(f.beskattetPersonId, 1)       // Nanna har rollen 'udlejer'
})

test('resolveFordeling: respekterer eksplicit valg', () => {
  const f = resolveFordeling({ fordeling_mode: 'del', beskattet_person_id: 2 }, persons)
  assert.equal(f.mode, 'del')
  assert.equal(f.beskattetPersonId, 2)
})

test('markedslejeTjek advarer når lejen er mere end X % under markedsleje', () => {
  const t = markedslejeTjek({ maanedlig_leje: 6000, markedsleje_maanedlig_skoen: 6500 }, 5)
  assert.equal(t.aftaltAarsleje, 72000)
  assert.equal(t.markedsAarsleje, 78000)
  assert.equal(t.difference, 6000)
  assert.ok(t.underPct > 5 && t.underPct < 8)
  assert.equal(t.advarsel, true)
})

test('markedslejeTjek advarer ikke ved markedskonform leje', () => {
  const t = markedslejeTjek({ maanedlig_leje: 6400, markedsleje_maanedlig_skoen: 6500 }, 5)
  assert.equal(t.advarsel, false)
})

test('markedslejeTjek uden skøn giver harSkoen=false', () => {
  const t = markedslejeTjek({ maanedlig_leje: 6000, markedsleje_maanedlig_skoen: 0 }, 5)
  assert.equal(t.harSkoen, false)
})

test('antalMaaneder: fra/til giver antal, default = 12', () => {
  assert.equal(antalMaaneder({ fra_maaned: 8, til_maaned: 12 }), 5)   // aug–dec
  assert.equal(antalMaaneder({}), 12)
  assert.equal(antalMaaneder({ fra_maaned: 6, til_maaned: 6 }), 1)
})

// Skrevet om (ADR-0002): testen cementerede tidligere udlejningsdage({}) === 360.
// 360 er præcis SKATs egen værdi for et helt udlejningsår, så gættet så legitimt ud
// netop når oplysningen manglede. Uden en udlejningsperiode er svaret nu 0 + et flag.
test('udlejningsdage uden periode: 0 dage og et flag — aldrig et gæt', () => {
  assert.equal(udlejningsdage({}), 0)
  assert.equal(manglerPeriode({}), true)
  // Heller ikke det gamle måneds-format må genoplive gættet
  assert.equal(udlejningsdage({ fra_maaned: 8, til_maaned: 12 }), 0)
  assert.equal(manglerPeriode({ fra_maaned: 8, til_maaned: 12 }), true)
})

test('manglerPeriode: kun en hel periode med to gyldige datoer tæller som oplyst', () => {
  assert.equal(manglerPeriode({ fra_dato: '2025-08-06', til_dato: '2025-12-31' }), false)
  assert.equal(manglerPeriode({ fra_dato: '2025-08-06', til_dato: '' }), true)   // mangler til-dato
  assert.equal(manglerPeriode({ fra_dato: '', til_dato: '2025-12-31' }), true)   // mangler fra-dato
  assert.equal(manglerPeriode(null), true)
  assert.equal(manglerPeriode({ fra_dato: 'ikke en dato', til_dato: '2025-12-31' }), true)
})

test('udlejningsdage: en halv periode er også en manglende periode', () => {
  assert.equal(udlejningsdage({ fra_dato: '2025-08-06' }), 0)                    // ingen til-dato
  assert.equal(udlejningsdage({ til_dato: '2025-12-31' }), 0)                    // ingen fra-dato
})

test('effektivBeloeb: pro rata ganger månedsbeløb med antal måneder', () => {
  const saet = {
    fra_maaned: 8, til_maaned: 12,       // 5 måneder
    indtaegter: { leje: 6000 }, udgifter: { forsikring: 2400 },
    prorata: { 'indtaegter.leje': true },  // leje er månedsbeløb
  }
  assert.equal(effektivBeloeb(saet, 'indtaegter', 'leje'), 30000)   // 6000 × 5
  assert.equal(effektivBeloeb(saet, 'udgifter', 'forsikring'), 2400) // ikke pro rata → uændret
})

test('sumIndtaegter respekterer pro rata pr. felt', () => {
  const saet = {
    fra_maaned: 8, til_maaned: 12,
    indtaegter: { leje: 6000, andet: 1000 },
    prorata: { 'indtaegter.leje': true },   // kun leje er månedlig
  }
  assert.equal(sumIndtaegter(saet), 6000 * 5 + 1000)  // 31.000
})

// ── Gruppesummering over kontoplanen + hjemløse poster (ADR-0001) ─────────────
// Invarianten: rækkerne i en gruppe summer ALTID til gruppens total. En værdi under
// en nøgle kontoplanen ikke kender er hjemløs — den tælles med og rapporteres, så en
// visende flade kan give den sin egen række.

test('gruppeOpgoerelse: kun kendte poster — kontoplanens rækkefølge, ingen hjemløse', () => {
  const saet = { indtaegter: { leje: 72000, vand: 3600 } }
  const g = gruppeOpgoerelse(saet, 'indtaegter')
  assert.deepEqual(g.poster.map(p => p.noegle), ['leje', 'vand', 'varme', 'andet'])
  assert.deepEqual(g.poster.map(p => p.beloeb), [72000, 3600, 0, 0])   // manglende nøgle = 0
  assert.deepEqual(g.hjemloese, [])
  assert.equal(g.sum, 75600)
  assert.equal(g.sum, g.poster.reduce((s, p) => s + p.beloeb, 0))      // rækkerne summer til totalen
})

test('gruppeOpgoerelse: kendte plus hjemløse — den hjemløse tælles med i totalen', () => {
  const saet = { udgifter: { grundskyld: 7488, ejerforening: 1200, gammel_nøgle: 300 } }
  const g = gruppeOpgoerelse(saet, 'udgifter')
  assert.equal(g.poster.every(p => p.noegle !== 'ejerforening'), true) // ikke i kontoplanen
  assert.deepEqual(g.hjemloese.map(h => [h.noegle, h.beloeb]), [['ejerforening', 1200], ['gammel_nøgle', 300]])
  assert.deepEqual(g.hjemloese.map(h => h.id), ['udgifter.ejerforening', 'udgifter.gammel_nøgle'])
  assert.equal(g.sum, 7488 + 1200 + 300)
  const raekkesum = [...g.poster, ...g.hjemloese].reduce((s, p) => s + p.beloeb, 0)
  assert.equal(g.sum, raekkesum)
  assert.equal(sumFradragsUdgifter(saet), 8988)                        // samme total som gruppen
})

test('gruppeOpgoerelse: kun hjemløse — totalen er stadig summen af alt gemt data', () => {
  const saet = { udgifter: { ejerforening: 1200 } }
  const g = gruppeOpgoerelse(saet, 'udgifter')
  assert.equal(g.poster.every(p => p.beloeb === 0), true)
  assert.equal(g.sum, 1200)
  assert.equal(sumFradragsUdgifter(saet), 1200)
  assert.equal(resultatFoerRenter(saet), -1200)                        // en hjemløs udgift er stadig et fradrag
})

test('gruppeOpgoerelse: tomt talsæt — alt nul, ingen hjemløse', () => {
  for (const saet of [tomtSaet(), {}, null]) {
    const g = gruppeOpgoerelse(saet, 'udgifter')
    assert.deepEqual(g.hjemloese, [])
    assert.equal(g.sum, 0)
  }
  assert.equal(sumIndtaegter(tomtSaet()), 0)
  assert.equal(sumFradragsUdgifter(tomtSaet()), 0)
})

test('en hjemløs post regnes pro rata på præcis samme vilkår som en kendt post', () => {
  const saet = {
    fra_dato: '2025-08-05', til_dato: '2025-12-31',
    udgifter: { ejerforening: 1000 },
    prorata: { 'udgifter.ejerforening': true },
  }
  const forventet = Math.round(1000 * prorataMaaneder(saet))
  const g = gruppeOpgoerelse(saet, 'udgifter')
  assert.equal(g.hjemloese[0].beloeb, forventet)
  assert.equal(g.hjemloese[0].prorata, true)
  assert.equal(g.sum, forventet)
})

test('en hjemløs indtægt rapporteres på samme måde som en hjemløs udgift', () => {
  const saet = { indtaegter: { depositum: 18000 }, udgifter: { ejerforening: 1200 } }
  assert.deepEqual(gruppeOpgoerelse(saet, 'indtaegter').hjemloese.map(h => h.id), ['indtaegter.depositum'])
  assert.deepEqual(gruppeOpgoerelse(saet, 'udgifter').hjemloese.map(h => h.id), ['udgifter.ejerforening'])
  assert.equal(resultatFoerRenter(saet), 18000 - 1200)
})

// ── Den udlejede andel (ADR-0003) ─────────────────────────────────────────────

test('udlejetAndel: fuld udlejning er default — et talsæt uden andelen er 100 %', () => {
  assert.equal(udlejetAndel(tomtSaet()), 100)
  assert.equal(udlejetAndel({}), 100)
  assert.equal(udlejetAndel(null), 100)
  assert.equal(udlejetAndel({ udlejet_andel_pct: '' }), 100)
  assert.equal(udlejetAndel({ udlejet_andel_pct: 'noget vrøvl' }), 100)
})

test('udlejetAndel: 0 er en rigtig andel og bliver ikke lavet om til fuld udlejning', () => {
  assert.equal(udlejetAndel({ udlejet_andel_pct: 0 }), 0)
})

test('udlejetAndel: en andel over 100 eller under 0 kan ikke forøge et fradrag', () => {
  assert.equal(udlejetAndel({ udlejet_andel_pct: 150 }), 100)
  assert.equal(udlejetAndel({ udlejet_andel_pct: -20 }), 0)
})

test('fradragsBeloeb: ved fuld udlejning er fradraget det effektive årsbeløb, krone for krone', () => {
  const saet = eksempelSaet()                                    // udlejet_andel_pct = 100
  for (const gruppe of ['indtaegter', 'udgifter']) {
    for (const noegle of Object.keys(saet[gruppe])) {
      assert.equal(fradragsBeloeb(saet, gruppe, noegle), effektivBeloeb(saet, gruppe, noegle), `${gruppe}.${noegle}`)
    }
  }
})

test('fradragsBeloeb: en delvis andel rammer ejendomsposterne — og kun dem', () => {
  const saet = { ...eksempelSaet(), udlejet_andel_pct: 60 }
  // Ejendomsposter: hele ejendommens omkostning, kun fradrag med den udlejede andel.
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'grundskyld'), 4493)               // 60 % af 7.488
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'faellesudgifter'), 14400)         // 60 % af 24.000
  // Vedrører udelukkende det udlejede — uberørt.
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'vedligeholdelse'), 30000)
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'vand'), 3600)
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'varme'), 3600)
})

test('fradragsBeloeb: indtægter er upåvirkede ved enhver andel — lejen er den leje der er modtaget', () => {
  for (const pct of [0, 1, 33, 60, 99, 100]) {
    const saet = { ...eksempelSaet(), udlejet_andel_pct: pct }
    assert.equal(fradragsBeloeb(saet, 'indtaegter', 'leje'), 72000, `andel ${pct}`)
    assert.equal(fradragsBeloeb(saet, 'indtaegter', 'vand'), 3600, `andel ${pct}`)
    assert.equal(fradragsBeloeb(saet, 'indtaegter', 'varme'), 3600, `andel ${pct}`)
  }
})

test('fradragsBeloeb: 0 % nulstiller ejendomsposterne og kun dem', () => {
  const saet = { ...eksempelSaet(), udlejet_andel_pct: 0 }
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'grundskyld'), 0)
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'faellesudgifter'), 0)
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'vedligeholdelse'), 30000)
  assert.equal(fradragsBeloeb(saet, 'indtaegter', 'leje'), 72000)
})

// Rækkefølgen af de to faktorer er et VALG, ikke en tilfældighed: pro rata først, så
// andelen. Pro rata siger hvad der er afholdt i perioden (en kendsgerning om året),
// andelen hvor meget af det der er fradragsberettiget. De to er kun ombyttelige indtil
// afrundingen — effektivBeloeb runder til hele kroner, og gør man det på det allerede
// nedskrevne beløb, får man et andet tal.
test('fradragsBeloeb: pro rata regnes først, derefter andelen', () => {
  const saet = {
    fra_dato: '2025-08-05', til_dato: '2025-12-31',
    udgifter: { faellesudgifter: 1000 },
    prorata: { 'udgifter.faellesudgifter': true },
    udlejet_andel_pct: 60,
  }
  const mdr = prorataMaaneder(saet)                          // 4,8709…
  const proRataFoerst = Math.round(Math.round(1000 * mdr) * 0.6)   // 4.871 → 2.923
  const andelFoerst = Math.round(1000 * 0.6 * mdr)                 // 2.923 — den anden vej
  assert.equal(proRataFoerst, 2923)
  assert.equal(andelFoerst, 2923)
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'faellesudgifter'), proRataFoerst)
  assert.equal(effektivBeloeb(saet, 'udgifter', 'faellesudgifter'), 4871)  // uændret af andelen
})

// Rækkefølgen er ikke altid usynlig. Regnes andelen først, mister man ører FØR pro rata
// ganger dem op, og forskellen bliver til hele kroner.
test('fradragsBeloeb: pro rata før andel giver et andet tal end andel før pro rata', () => {
  const saet = {
    fra_dato: '2025-01-01', til_dato: '2025-12-31',
    udgifter: { faellesudgifter: 1041 },
    prorata: { 'udgifter.faellesudgifter': true },
    udlejet_andel_pct: 33,
  }
  assert.equal(effektivBeloeb(saet, 'udgifter', 'faellesudgifter'), 12492)   // 1.041 × 12
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'faellesudgifter'), 4122)    // 33 % af 12.492
  assert.equal(Math.round(1041 * 33 / 100) * 12, 4128)                       // den anden vej: 6 kr. fra
})

// Afrundingen sker PR. POST, til øre — den mindste enhed et beløb kan bære. Rundes der
// først på summen, kan rækkerne i regnskabet ikke længere lægges sammen til totalen
// (ADR-0001), og et regnskab hvor delene ikke giver totalen er værdiløst over for SKAT.
// Afrundingen sker PR. POST og til HELE KRONER — samme konvention som effektivBeloeb
// bruger på pro rata. Det er ikke kosmetik: regnskabets rækker skrives med kr() uden
// decimaler, så en andel der efterlod ører ville give rækker der ikke kunne lægges
// sammen til den viste total (60 % af 3.121 = 1.872,60 skrives som 1.873, men tæller
// 1.872,60 i summen). ADR-0001 kræver at delene giver totalen.
test('fradragsBeloeb: afrundes pr. post til hele kroner, så andelen ikke laver ører', () => {
  const saet = { udgifter: { grundskyld: 3121, faellesudgifter: 13251 }, udlejet_andel_pct: 60 }
  assert.equal(3121 * 60 / 100, 1872.6)                   // det uafrundede mellemresultat
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'grundskyld'), 1873)
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'faellesudgifter'), 7951)
  assert.equal(sumFradragsUdgifter(saet), 1873 + 7951)    // rækkerne ER totalen
})

test('fradragsBeloeb: et tastet ørebeløb bliver til hele kroner efter andelen', () => {
  const saet = { udgifter: { faellesudgifter: 21608.75 }, udlejet_andel_pct: 60 }
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'faellesudgifter'), 12965)
})

// Alle ører i et regnskab skal komme fra noget brugeren selv har tastet. Andelen må
// ikke kunne tilføje nye — det er den eneste måde rækkerne kan blive ved med at summe
// til den viste total.
test('fradragsBeloeb: andelen tilføjer aldrig ører til et helt kronebeløb', () => {
  for (const pct of [1, 12.5, 33, 60, 87, 99]) {
    for (const beloeb of [1, 7, 999, 3120, 7488, 13250, 31200]) {
      const v = fradragsBeloeb({ udgifter: { grundskyld: beloeb }, udlejet_andel_pct: pct }, 'udgifter', 'grundskyld')
      assert.ok(Number.isInteger(v), `${pct} % af ${beloeb} gav ${v}`)
    }
  }
})

test('fradragsBeloeb: en hjemløs post er ikke en ejendomspost og røres ikke', () => {
  const saet = { udgifter: { ejerforening: 12000 }, udlejet_andel_pct: 60 }
  assert.equal(fradragsBeloeb(saet, 'udgifter', 'ejerforening'), 12000)
})

test('gruppeOpgoerelse: ved 100 % er hver række sit fulde beløb — intet er skåret ned', () => {
  const g = gruppeOpgoerelse(eksempelSaet(), 'udgifter')
  assert.equal(g.andelPct, 100)
  assert.equal(g.sum, 68688)
  assert.equal(g.sumFoerAndel, 68688)
  for (const p of g.poster) assert.equal(p.beloeb, p.beloebFoerAndel, p.id)
})

test('gruppeOpgoerelse: en delvis andel skærer kun ejendomsposternes rækker ned', () => {
  const g = gruppeOpgoerelse({ ...eksempelSaet(), udlejet_andel_pct: 60 }, 'udgifter')
  const linje = (n) => g.poster.find(p => p.noegle === n)
  assert.equal(g.andelPct, 60)
  assert.equal(linje('grundskyld').beloebFoerAndel, 7488)
  assert.equal(linje('grundskyld').beloeb, 4493)
  assert.equal(linje('grundskyld').andel, true)
  assert.equal(linje('faellesudgifter').beloeb, 14400)
  assert.equal(linje('vedligeholdelse').beloeb, 30000)          // kun det udlejede
  assert.equal(linje('vedligeholdelse').beloebFoerAndel, 30000)
  assert.equal(linje('vedligeholdelse').andel, false)
  assert.equal(linje('forsikring').andel, false, 'en ejendomspost uden beløb er ikke skåret ned')
  // Rækkerne summer stadig til totalen (ADR-0001)
  assert.equal(g.sum, [...g.poster, ...g.hjemloese].reduce((s, p) => s + p.beloeb, 0))
  assert.equal(g.sum, 4493 + 14400 + 30000 + 3600 + 3600)   // 56.093
  assert.equal(g.sumFoerAndel, 68688)
})

test('gruppeOpgoerelse: indtægtsgruppen er den samme uanset andelen', () => {
  const fuld = gruppeOpgoerelse(eksempelSaet(), 'indtaegter')
  for (const pct of [0, 25, 60, 99]) {
    const delvis = gruppeOpgoerelse({ ...eksempelSaet(), udlejet_andel_pct: pct }, 'indtaegter')
    assert.equal(delvis.sum, fuld.sum, `andel ${pct}`)
    assert.deepEqual(delvis.poster.map(p => p.beloeb), fuld.poster.map(p => p.beloeb), `andel ${pct}`)
  }
})

test('gruppeOpgoerelse: en hjemløs post tælles fuldt med, uanset andelen', () => {
  const saet = { udgifter: { grundskyld: 7488, ejerforening: 12000 }, udlejet_andel_pct: 60 }
  const g = gruppeOpgoerelse(saet, 'udgifter')
  assert.equal(g.hjemloese[0].beloeb, 12000)
  assert.equal(g.hjemloese[0].beloebFoerAndel, 12000)
  assert.equal(g.hjemloese[0].ejendomspost, false)
  assert.equal(g.hjemloese[0].andel, false)
  assert.equal(g.sum, 4493 + 12000)
})

test('resultatFoerRenter: den udlejede andel slår igennem på fradraget, ikke på lejen', () => {
  const fuld = eksempelSaet()
  const delvis = { ...fuld, udlejet_andel_pct: 60 }
  assert.equal(sumIndtaegter(delvis), sumIndtaegter(fuld))                 // 79.200 begge veje
  assert.equal(sumFradragsUdgifter(delvis), 56093)     // 68.688 − 40 % af (7.488 + 24.000)
  assert.equal(resultatFoerRenter(delvis), 23107)      // 79.200 − 56.093
  // Et mindre fradrag giver et STØRRE resultat — det er hele pointen.
  assert.ok(resultatFoerRenter(delvis) > resultatFoerRenter(fuld))
})

test('resultatFoerRenter: 0 % fjerner ejendomsposternes fradrag, men ingen andre', () => {
  const saet = { ...eksempelSaet(), udlejet_andel_pct: 0 }
  assert.equal(sumFradragsUdgifter(saet), 68688 - 7488 - 24000)            // 37.200
  assert.equal(sumIndtaegter(saet), 79200)
})

// De eneste ører der må stå i et regnskab er dem brugeren selv har tastet. Andelen laver
// ingen nye, så en total kan stadig lægges sammen af sine rækker — også når en enkelt
// post er tastet med ører.
test('en delvis andel efterlader kun de ører brugeren selv har tastet', () => {
  const saet = {
    indtaegter: { leje: 79200 },
    udgifter: {
      grundskyld: 7488, faellesudgifter: 31200, vedligeholdelse: 21608.75,
      vand: 3600, varme: 3600, andet: 2695,
    },
    udlejet_andel_pct: 60,
  }
  const g = gruppeOpgoerelse(saet, 'udgifter')
  assert.deepEqual(g.poster.filter(p => p.beloeb).map(p => [p.noegle, p.beloeb]), [
    ['grundskyld', 4493], ['faellesudgifter', 18720], ['vedligeholdelse', 21608.75],
    ['vand', 3600], ['varme', 3600], ['andet', 2695],
  ])
  assert.equal(sumFradragsUdgifter(saet), 54716.75)
  assert.equal(resultatFoerRenter(saet), 24483.25)
})

test('renteudgifter og forbedringer ligger uden for den udlejede andel', () => {
  const saet = { ...eksempelSaet(), udlejet_andel_pct: 40 }
  assert.equal(sumRenter(saet), 42380)                                     // renter er personlige
  assert.equal(saet.forbedringer, 12000)                                   // ikke fradrag i forvejen
})

test('udlejningsdage (datobaseret): faktiske kalenderdage inkl. start og slut', () => {
  assert.equal(udlejningsdage({ fra_dato: '2025-08-05', til_dato: '2025-12-31' }), 149)
  assert.equal(udlejningsdage({ fra_dato: '2025-01-01', til_dato: '2025-12-31' }), 365)
  assert.equal(udlejningsdage({ fra_dato: '2025-06-10', til_dato: '2025-06-10' }), 1)
})

test('antalMaaneder (datobaseret): antal berørte kalendermåneder', () => {
  assert.equal(antalMaaneder({ fra_dato: '2025-08-05', til_dato: '2025-12-31' }), 5)  // aug–dec
  assert.equal(antalMaaneder({ fra_dato: '2025-01-01', til_dato: '2025-12-31' }), 12)
})

test('periodeForAar: klipper lejeperioden til året', () => {
  const lease = { startdato: '2025-08-05' }                 // åben slutdato
  assert.deepEqual(periodeForAar(lease, 2025), ['2025-08-05', '2025-12-31'])
  assert.deepEqual(periodeForAar(lease, 2026), ['2026-01-01', '2026-12-31'])
  const lease2 = { startdato: '2025-08-05', slutdato: '2027-06-15' }
  assert.deepEqual(periodeForAar(lease2, 2027), ['2027-01-01', '2027-06-15'])
})

// Samme fælde som de manglende datoer, ad en anden vej (ADR-0002): uden kontrakt fik
// året tildelt hele kalenderåret og dermed 360 indberetningsdage — uden at nogen havde
// lejet noget ud. Ingen lejekontrakt betyder ingen periode.
test('periodeForAar uden lejekontrakt: ingen periode, ikke hele kalenderåret', () => {
  assert.deepEqual(periodeForAar(null, 2028), ['', ''])
  assert.deepEqual(periodeForAar(undefined, 2028), ['', ''])
})

test('et hul-år får hverken periode eller dagstal', () => {
  // Kontrakterne dækker 2025–2027 og igen fra 2029. 2028 er et hul-år.
  const leases = [
    { id: 1, startdato: '2025-08-05', slutdato: '2027-06-30', maanedlig_leje: 4500 },
    { id: 2, startdato: '2029-01-01', maanedlig_leje: 6000 },
  ]
  assert.equal(leaseForAar(leases, 2028), null)
  const g = aarsgrundlag(leases, 2028)
  assert.equal(g.fra_dato, '')
  assert.equal(g.til_dato, '')
  assert.equal(g.mangler, true)
  assert.equal(g.dage, 0)
  assert.equal(g.dage360, 0)          // ikke 360 — der er ingen lejekontrakt
  assert.equal(g.maanedlig_leje, 0)
  // Kontraktårene er uberørte
  assert.equal(aarsgrundlag(leases, 2026).dage360, 360)
  assert.equal(aarsgrundlag(leases, 2026).mangler, false)
})

test('aarsgrundlag: udleder periode og leje fra den kontrakt der gælder i året', () => {
  const leases = [{ id: 1, startdato: '2025-08-05', maanedlig_leje: 6000, forbrug_aconto: { vand: 200, varme: 300 } }]
  const g = aarsgrundlag(leases, 2025)
  assert.equal(g.fra_dato, '2025-08-05')
  assert.equal(g.til_dato, '2025-12-31')
  assert.equal(g.maanedlig_leje, 6000)
  assert.equal(g.dage, 149)          // faktiske kalenderdage
  assert.equal(g.dage360, 146)       // skemaets 30/360
  assert.equal(g.mangler, false)
  // Uden kontrakt: ingen periode og ingen leje (ADR-0002 — tidligere: hele året)
  const tom = aarsgrundlag([], 2025)
  assert.equal(tom.lease, null)
  assert.equal(tom.fra_dato, '')
  assert.equal(tom.til_dato, '')
  assert.equal(tom.mangler, true)
  assert.equal(tom.maanedlig_leje, 0)
})

test('periodeAfvigelse: opdager drift mellem gemt periode og lejekontrakt', () => {
  const leases = [{ id: 1, startdato: '2025-08-05', maanedlig_leje: 6000 }]
  const g = aarsgrundlag(leases, 2025)

  // Enige → ingen afvigelse
  assert.equal(periodeAfvigelse({ fra_dato: '2025-08-05', til_dato: '2025-12-31' }, g), null)

  // Den faktiske drift i brugerens DB: gemt 06-08, kontrakt 05-08
  const a = periodeAfvigelse({ fra_dato: '2025-08-06', til_dato: '2025-12-31' }, g)
  assert.ok(a, 'skal rapportere afvigelse')
  assert.equal(a.gemt.dage, 148)
  assert.equal(a.afledt.dage, 149)
  assert.equal(a.gemt.dage360, 145)     // det tal der indberettes i dag
  assert.equal(a.afledt.dage360, 146)   // det kontrakten giver

  // Ingen kontrakt at afstemme mod → ingen afvigelse (ikke en fejl)
  assert.equal(periodeAfvigelse({ fra_dato: '2025-03-01', til_dato: '2025-12-31' }, aarsgrundlag([], 2025)), null)
})

// ── Kvittering på en periodeafvigelse ─────────────────────────────────────────
//
// Brugerens 2025 har gemt 6. august mod lejekontraktens 5. — den faktiske indflytning
// skete dagen efter. Afvigelsen er altså rigtig, og advarslen ville ellers stå der for
// evigt på et korrekt år. Kvitteringen gør den til en neutral note med begrundelsen.

const LEASES = [{ id: 1, startdato: '2025-08-05', slutdato: '2025-12-31', maanedlig_leje: 6000 }]
const GEMT = { fra_dato: '2025-08-06', til_dato: '2025-12-31' }
const BEGRUNDELSE = 'Faktisk indflytning skete 6. august, dagen efter kontraktens start.'

// Et talsæt med en kvittering der er givet for præcis den afvigelse det bærer.
function kvitteretSaet(saet = GEMT, leases = LEASES) {
  const afvigelse = periodeAfvigelse(saet, aarsgrundlag(leases, 2025))
  return { ...saet, periode_kvittering: periodeKvittering(afvigelse, BEGRUNDELSE) }
}

test('periodeAfvigelse: uden kvittering er afvigelsen ukvitteret', () => {
  const a = periodeAfvigelse(GEMT, aarsgrundlag(LEASES, 2025))
  assert.equal(a.kvitteret, false)
  assert.equal(a.begrundelse, '')
  assert.equal(a.foraeldet, false)
})

test('periodeAfvigelse: en begrundelse gør afvigelsen kvitteret', () => {
  const a = periodeAfvigelse(kvitteretSaet(), aarsgrundlag(LEASES, 2025))
  assert.ok(a, 'afvigelsen forsvinder ikke — den rapporteres stadig')
  assert.equal(a.kvitteret, true)
  assert.equal(a.begrundelse, BEGRUNDELSE)
  assert.equal(a.foraeldet, false)
  // Perioden rettes aldrig af en kvittering — begge sæt tal står uændret.
  assert.equal(a.gemt.fra_dato, '2025-08-06')
  assert.equal(a.afledt.fra_dato, '2025-08-05')
  assert.equal(a.gemt.dage360, 145)
})

test('periodeAfvigelse: en tom begrundelse kvitterer ikke', () => {
  for (const tekst of ['', '   ', null, undefined]) {
    assert.equal(periodeKvittering(periodeAfvigelse(GEMT, aarsgrundlag(LEASES, 2025)), tekst), null)
  }
  const a = periodeAfvigelse({ ...GEMT, periode_kvittering: { begrundelse: '  ', gemt: GEMT, afledt: { fra_dato: '2025-08-05', til_dato: '2025-12-31' } } }, aarsgrundlag(LEASES, 2025))
  assert.equal(a.kvitteret, false)
})

// Kvitteringen må ikke kunne dække over noget nyt: den er bundet til BEGGE de perioder
// den blev givet for. Ændrer den ene sig, vender advarslen tilbage.
test('periodeAfvigelse: ændres talsættets periode efter kvitteringen, vender advarslen tilbage', () => {
  const saet = { ...kvitteretSaet(), fra_dato: '2025-09-01' }     // brugeren flytter fra-datoen
  const a = periodeAfvigelse(saet, aarsgrundlag(LEASES, 2025))
  assert.equal(a.kvitteret, false, 'kvitteringen gjaldt 6. august, ikke 1. september')
  assert.equal(a.begrundelse, '')
  assert.equal(a.foraeldet, true)
  assert.equal(a.foraeldet_begrundelse, BEGRUNDELSE)              // teksten tabes ikke tavst
})

test('periodeAfvigelse: ændres lejekontrakten efter kvitteringen, vender advarslen tilbage', () => {
  const rettet = [{ id: 1, startdato: '2025-07-01', slutdato: '2025-12-31', maanedlig_leje: 6000 }]
  const a = periodeAfvigelse(kvitteretSaet(), aarsgrundlag(rettet, 2025))
  assert.equal(a.kvitteret, false, 'kvitteringen gjaldt kontraktens 5. august, ikke 1. juli')
  assert.equal(a.foraeldet, true)
  assert.equal(a.foraeldet_begrundelse, BEGRUNDELSE)
})

// ADR-0002: en manglende periode gættes ikke — og den forklares heller ikke væk. En
// kvittering på et fravær ville skrive "— – — (0 dage til skat.dk)" i årsregnskabets note
// som en bevidst afvigelse: præcis den slags svar der ser legitimt ud, netop når
// oplysningen mangler. Perioden skal udfyldes, ikke begrundes.
test('periodeAfvigelse: en manglende periode kan ikke kvitteres væk', () => {
  const uden = { fra_dato: '', til_dato: '' }
  const g = aarsgrundlag(LEASES, 2025)
  assert.equal(periodeKvittering(periodeAfvigelse(uden, g), BEGRUNDELSE), null)

  // Og en kvittering der alligevel ligger i talsættet dækker ikke.
  const a = periodeAfvigelse({ ...uden, periode_kvittering: { begrundelse: BEGRUNDELSE, gemt: uden, afledt: { fra_dato: '2025-08-05', til_dato: '2025-12-31' } } }, g)
  assert.equal(a.kvitteret, false)
  assert.equal(a.foraeldet, true)
})

test('periodeKvittering binder begrundelsen til begge de perioder den blev givet for', () => {
  const k = periodeKvittering(periodeAfvigelse(GEMT, aarsgrundlag(LEASES, 2025)), `  ${BEGRUNDELSE}  `)
  assert.equal(k.begrundelse, BEGRUNDELSE)                        // trimmet
  assert.deepEqual(k.gemt, { fra_dato: '2025-08-06', til_dato: '2025-12-31' })
  assert.deepEqual(k.afledt, { fra_dato: '2025-08-05', til_dato: '2025-12-31' })
  // Uden en afvigelse er der intet at kvittere for.
  assert.equal(periodeKvittering(null, BEGRUNDELSE), null)
})

test('udlejningsdage360: SKATs 30/360-konvention (md = 30 dage, år = 360)', () => {
  // Fuldt år = præcis 360, ikke 365 — jf. fodnoten på felt 748 / rubrik 207
  assert.equal(udlejningsdage360({ fra_dato: '2025-01-01', til_dato: '2025-12-31' }), 360)
  // 5. aug–31. dec: aug bidrager 26 dage (5.-30.), sep-dec 4×30 = 120 → 146
  assert.equal(udlejningsdage360({ fra_dato: '2025-08-05', til_dato: '2025-12-31' }), 146)
  // Skarpt skilt fra den kalenderbaserede optælling, som giver 149
  assert.equal(udlejningsdage({ fra_dato: '2025-08-05', til_dato: '2025-12-31' }), 149)
  // Skudår ændrer ikke 30/360-tallet
  assert.equal(udlejningsdage360({ fra_dato: '2024-01-01', til_dato: '2024-12-31' }), 360)
})

// Skrevet om (ADR-0002): her stod tidligere udlejningsdage360({}) === 360 med
// begrundelsen "falder tilbage til måneder × 30". Det er netop det tal SKAT forventer
// for et helt udlejningsår, så det manglende input kunne indberettes ubemærket.
test('udlejningsdage360 uden periode: 0 dage — intet at indberette i felt 748 / rubrik 207', () => {
  assert.equal(udlejningsdage360({}), 0)
  assert.equal(udlejningsdage360({ fra_maaned: 1, til_maaned: 12 }), 0)
  assert.equal(udlejningsdage360({ fra_dato: '2025-08-06' }), 0)                 // ingen til-dato
  assert.equal(udlejningsdage360({ til_dato: '2025-12-31' }), 0)                 // ingen fra-dato
  // ... men et helt oplyst udlejningsår giver stadig præcis 360, ikke 365
  assert.equal(udlejningsdage360({ fra_dato: '2025-01-01', til_dato: '2025-12-31' }), 360)
  assert.equal(udlejningsdage({ fra_dato: '2025-01-01', til_dato: '2025-12-31' }), 365)
})

test('leaseForAar: vælger den kontrakt der er aktiv i året', () => {
  const l1 = { id: 1, startdato: '2025-08-05', slutdato: '2027-07-31', maanedlig_leje: 10000 }
  const l2 = { id: 2, startdato: '2027-08-01', maanedlig_leje: 11000 }   // åben slutdato
  const leases = [l1, l2]
  // Rene år: kun én kontrakt dækker
  assert.equal(leaseForAar(leases, 2026)?.id, 1)
  assert.equal(leaseForAar(leases, 2028)?.id, 2)
  // Delt år 2027: l1 dækker jan–jul (212 dage), l2 aug–dec (153 dage) → l1 vinder
  assert.equal(leaseForAar(leases, 2027)?.id, 1)
  // År uden dækning → null
  assert.equal(leaseForAar(leases, 2024), null)
  // Robusthed: tomt/ugyldigt input
  assert.equal(leaseForAar([], 2026), null)
  assert.equal(leaseForAar(null, 2026), null)
})

test('prorataMaaneder: delmåned tæller forholdsmæssigt (5.–31. aug + fulde mdr)', () => {
  // aug: 27/31 = 0.8710; sep–dec: 4 fulde = 4 → 4.8710
  const pm = prorataMaaneder({ fra_dato: '2025-08-05', til_dato: '2025-12-31' })
  assert.ok(Math.abs(pm - 4.871) < 0.001)
  // fuldt år = præcis 12
  assert.equal(prorataMaaneder({ fra_dato: '2025-01-01', til_dato: '2025-12-31' }), 12)
})

// Bevidst asymmetri (ADR-0002): dagstallene svarer 0 ved manglende periode, pro rata
// gør IKKE. De to ting er ikke ens. Et dagstal ER den værdi der indberettes, og kan
// derfor erstattes af teksten "periode mangler" — tallet vises aldrig. Pro rata-måneder
// er en faktor på et beløb brugeren selv har tastet, og det beløb skal ende som et tal
// i en sum; ingen tekst kan træde i stedet. Ville pro rata svare 0, forsvandt den
// indtastede husleje tavst ud af udlejningsresultatet — netop den slags plausibelt
// udseende tal ADR-0002 handler om, blot i beløb i stedet for i dage, og et tal der
// indberettes i rubrik 111/112. Adfærden er derfor uændret her og markeres i stedet
// med flaget på de visende flader.
test('prorataMaaneder uden periode: uændret adfærd — flaget bærer oplysningen, ikke tallet', () => {
  assert.equal(prorataMaaneder({}), 12)
  assert.equal(prorataMaaneder({ fra_maaned: 8, til_maaned: 12 }), 5)
  // Men dagstallene for samme talsæt nægter at gætte
  assert.equal(udlejningsdage({ fra_maaned: 8, til_maaned: 12 }), 0)
  assert.equal(udlejningsdage360({ fra_maaned: 8, til_maaned: 12 }), 0)
})

test('effektivBeloeb (datobaseret): leje forholdsmæssigt, ikke fulde 5 mdr', () => {
  const saet = {
    fra_dato: '2025-08-05', til_dato: '2025-12-31',
    indtaegter: { leje: 6000 }, prorata: { 'indtaegter.leje': true },
  }
  assert.equal(effektivBeloeb(saet, 'indtaegter', 'leje'), 29226)  // 6000 × 4.871, afrundet
})

test('estimeretAarligRente: restgæld × rente, afrundet', () => {
  assert.equal(estimeretAarligRente({ restgaeld: 1482717, rente_pct: 4 }), 59309)
  assert.equal(estimeretAarligRente({ restgaeld: 2000000, rente_pct: 3.5 }), 70000)
  assert.equal(estimeretAarligRente({}), 0)
})

test('tomtSaet: uden pro rata er sum = rå værdier (ingen regression)', () => {
  const t = tomtSaet()
  t.indtaegter.leje = 72000
  assert.equal(sumIndtaegter(t), 72000)   // default 12 mdr, ingen prorata → uændret
})
