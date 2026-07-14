import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tomtSaet, sumIndtaegter, sumFradragsUdgifter, resultatFoerRenter,
  sumRenter, fordelPrPerson, renterPrPerson, personOpgoerelse, markedslejeTjek,
  resolveFordeling, antalMaaneder, udlejningsdage, effektivBeloeb, estimeretAarligRente,
  periodeForAar, prorataMaaneder, leaseForAar,
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

test('udlejningsdage: 30-dages-måneder (5 mdr = 150, fuldt år = 360)', () => {
  assert.equal(udlejningsdage({ fra_maaned: 8, til_maaned: 12 }), 150)
  assert.equal(udlejningsdage({}), 360)
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
