import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hentFeltmapping, felterForRolle, feltRolle, evalKilde } from './feltmapping.js'
import { fradragsBeloeb } from './beregning.js'

test('hentFeltmapping: bruger defaults for det definerede år', () => {
  assert.ok(hentFeltmapping(2026, 'forskud').felter.length > 0)
  assert.ok(hentFeltmapping(2026, 'selvangivelse').felter.length > 0)
})

// Har året sin egen feltmapping, er der intet at advare om — herkomsten er året selv.
test('hentFeltmapping: årets egen mapping rapporterer året som kilde og markeres ikke', () => {
  for (const doktype of ['forskud', 'selvangivelse']) {
    const m = hentFeltmapping(2026, doktype)
    assert.equal(m.kildeAar, 2026, doktype)
    assert.equal(m.egetAar, true, doktype)
    assert.equal(m.rettet, false, doktype)
  }
})

test('hentFeltmapping: falder tilbage til nærmeste år for udefineret år (også tidligere)', () => {
  // 2025 er ikke defineret, men skal arve 2026-mappingen (fallback opad).
  assert.ok(hentFeltmapping(2025, 'forskud').felter.length > 0)
  // Fremtidigt år arver også seneste kendte.
  assert.ok(hentFeltmapping(2030, 'selvangivelse').felter.length > 0)
})

// Kernen i ticketen: fallbacket må ikke være tavst. Både det år der blev spurgt om og
// det år felterne faktisk kommer fra skal kunne skrives på fladen.
test('hentFeltmapping: arvet mapping rapporterer sit rigtige kildeår og markeres', () => {
  for (const aar of [2025, 2027, 2030]) {
    const m = hentFeltmapping(aar, 'forskud')
    assert.equal(m.aar, aar)
    assert.equal(m.kildeAar, 2026, `${aar} arver 2026`)
    assert.equal(m.egetAar, false, `${aar} er ikke sit eget år`)
    assert.equal(m.rettet, false, `${aar}`)
  }
})

test('hentFeltmapping: overrides vinder over defaults', () => {
  const overrides = { '2026-forskud': [{ felt_nr: 'X', label: 'Test', kilde: 'resultat', rolle: 'begge' }] }
  assert.equal(hentFeltmapping(2026, 'forskud', overrides).felter[0].felt_nr, 'X')
})

// En override er brugerens egen, verificerede mapping for præcis det år — så er herkomsten
// årets egen, også for et år uden defaults, og der advares ikke.
test('hentFeltmapping: en override gør året til sin egen kilde — også hvor der ingen defaults er', () => {
  const raekke = [{ felt_nr: 'X', label: 'Test', kilde: 'resultat', rolle: 'begge' }]
  const m = hentFeltmapping(2027, 'forskud', { '2027-forskud': raekke })
  assert.equal(m.kildeAar, 2027)
  assert.equal(m.egetAar, true)
  assert.equal(m.rettet, true)
  // En override for et andet år smitter ikke af på det valgte.
  const andet = hentFeltmapping(2027, 'selvangivelse', { '2027-forskud': raekke })
  assert.equal(andet.kildeAar, 2026)
  assert.equal(andet.egetAar, false)
  assert.equal(andet.rettet, false)
})

// Er der intet at falde tilbage på, siges det også. `kildeAar: null` betyder "ingen
// kilde" og adskiller sig fra et årstal — fladen må ikke kunne komme til at skrive et
// kildeår den ikke har.
test('hentFeltmapping: uden rækker overhovedet er der ingen kilde', () => {
  const m = hentFeltmapping(2026, 'et-skema-der-ikke-findes')
  assert.deepEqual(m.felter, [])
  assert.equal(m.kildeAar, null)
  assert.equal(m.egetAar, false)
  assert.equal(m.rettet, false)
})

// Ticketen gør fallbacket synligt — den ændrer ikke et eneste feltnummer. Denne test
// er låsen om det: retter nogen et nummer her, skal det ske bevidst og verificeret
// mod skat.dk for netop den opgørelse (se CLAUDE.md's tre faldgruber).
test('hentFeltmapping: 2026-feltnumrene er uændrede', () => {
  assert.deepEqual(
    hentFeltmapping(2026, 'forskud').felter.map(f => f.felt_nr),
    ['221', '435', '481', '488', '481', '748', '744', '699'],
  )
  assert.deepEqual(
    hentFeltmapping(2026, 'selvangivelse').felter.map(f => f.felt_nr),
    ['42', '42', '207', '699', '111', '112', '117', '300', '638', '301/302'],
  )
})

test('felterForRolle: overskud viser 111/221, ikke 112/435', () => {
  const felter = hentFeltmapping(2026, 'selvangivelse').felter
  const overskud = felterForRolle(felter, 'beskattet', true).map(f => f.felt_nr)
  assert.ok(overskud.includes('111'))
  assert.ok(!overskud.includes('112'))
})

test('felterForRolle: underskud viser 112/435, ikke 111/221', () => {
  const felter = hentFeltmapping(2026, 'selvangivelse').felter
  const underskud = felterForRolle(felter, 'beskattet', false).map(f => f.felt_nr)
  assert.ok(underskud.includes('112'))
  assert.ok(!underskud.includes('111'))
})

test('felterForRolle: ikke-beskattet ser ikke rubrik 117 (kun beskattet)', () => {
  const felter = hentFeltmapping(2026, 'selvangivelse').felter
  const ikke = felterForRolle(felter, 'ikke_beskattet', true).map(f => f.felt_nr)
  assert.ok(!ikke.includes('117'))
})

test('feltRolle: ikke-beskattet i alt-på-den-ene', () => {
  assert.equal(feltRolle({ erBeskattet: false }, { mode: 'alt_paa_en' }), 'ikke_beskattet')
  assert.equal(feltRolle({ erBeskattet: true }, { mode: 'alt_paa_en' }), 'beskattet')
  assert.equal(feltRolle({ erBeskattet: false }, { mode: 'del' }), 'beskattet')
})

test('evalKilde: renter_flyt bruger renterFysisk, renter_beskattet bruger renter', () => {
  const personOpg = { renter: 42380, renterFysisk: 21190 }
  assert.equal(evalKilde('renter_beskattet', { personOpg }), 42380)
  assert.equal(evalKilde('renter_flyt', { personOpg }), 21190)
})

test('evalKilde: dagsfelterne er 30/360 for en oplyst periode', () => {
  const saet = { fra_dato: '2025-08-06', til_dato: '2025-12-31' }
  assert.equal(evalKilde('udlejningsdage360', { saet }), 145)   // felt 748 / rubrik 207
  assert.equal(evalKilde('udlejningsdage', { saet }), 148)      // faktiske kalenderdage
  const heltAar = { fra_dato: '2026-01-01', til_dato: '2026-12-31' }
  assert.equal(evalKilde('udlejningsdage360', { saet: heltAar }), 360)
})

// ADR-0002: uden udlejningsperiode er der ingen værdi at indberette i felt 748 /
// rubrik 207. Kilden svarer null — ikke 0 og navnlig ikke 360 — så fladen skriver
// "periode mangler" og ikke tilbyder brugeren et tal at kopiere ind på skat.dk.
test('evalKilde: uden periode indberettes intet dagstal', () => {
  for (const saet of [{}, { fra_dato: '2025-08-06' }, { til_dato: '2025-12-31' }, { fra_maaned: 1, til_maaned: 12 }]) {
    assert.equal(evalKilde('udlejningsdage360', { saet }), null)
    assert.equal(evalKilde('udlejningsdage', { saet }), null)
  }
})

// ADR-0003: felt 744 ("erhvervsmæssig andel") skal bære PRÆCIS den andel fradraget er
// regnet på. Læses de to hver for sig, kan man indberette ét tal til SKAT og fradrage
// efter et andet — netop den fejl ticketen findes for at lukke.
test('evalKilde: felt 744 er den samme andel som fradraget er beregnet på', () => {
  const medAndel = (pct) => ({
    udgifter: { grundskyld: 10000, vedligeholdelse: 10000 },
    udlejet_andel_pct: pct,
  })
  for (const raa of [60, 0, 100, '', undefined, 150, -20, 'vrøvl']) {
    const saet = medAndel(raa)
    const indberettet = evalKilde('udlejet_andel_pct', { saet })
    // Grundskyld er ejendomspost; 10.000 kr. gør fradraget til andelen skrevet som kroner.
    assert.equal(fradragsBeloeb(saet, 'udgifter', 'grundskyld') / 100, indberettet, `andel ${raa}`)
    assert.equal(fradragsBeloeb(saet, 'udgifter', 'vedligeholdelse'), 10000, `andel ${raa}`)
  }
})

// Editoren prefiller et år med de ARVEDE rækker. Gemmes de uændret, har brugeren ikke
// verificeret noget — og advarslen om uverificerede feltnumre må ikke kunne slukkes med
// ét klik på projektets højeste risikopunkt. `rettet` siger hvor rækkerne kom fra,
// `egetAar` siger om nogen har taget stilling til dem for netop dette år.
test('en override der er identisk med det arvede tæller ikke som årets egen kilde', () => {
  const arvet = hentFeltmapping(2027, 'forskud')
  assert.equal(arvet.kildeAar, 2026)
  assert.equal(arvet.egetAar, false)

  // Præcis det editoren gemmer, hvis brugeren klikker Gem uden at røre en række.
  const uaendret = { '2027-forskud': arvet.felter.map(r => ({ ...r })) }
  const efter = hentFeltmapping(2027, 'forskud', uaendret)
  assert.equal(efter.rettet, true, 'rækkerne kommer stadig fra brugerens egne overrides')
  assert.equal(efter.kildeAar, 2026, 'men de er stadig 2026-numre')
  assert.equal(efter.egetAar, false, 'så advarslen skal blive stående')
  assert.deepEqual(efter.felter, uaendret['2027-forskud'])
})

test('en override med ét ændret feltnummer gør året til sin egen kilde', () => {
  const arvet = hentFeltmapping(2027, 'forskud')
  const rettede = arvet.felter.map(r => ({ ...r }))
  rettede[0] = { ...rettede[0], felt_nr: '999' }

  const efter = hentFeltmapping(2027, 'forskud', { '2027-forskud': rettede })
  assert.equal(efter.egetAar, true)
  assert.equal(efter.kildeAar, 2027)
  assert.equal(efter.rettet, true)
})

test('nøglerækkefølgen i en gemt række afgør ikke om den tæller som ændret', () => {
  const arvet = hentFeltmapping(2027, 'selvangivelse')
  // Samme indhold, omvendt nøglerækkefølge — som en håndredigeret DB kunne se ud.
  const omvendt = arvet.felter.map(r =>
    Object.fromEntries(Object.keys(r).reverse().map(k => [k, r[k]])))
  assert.equal(hentFeltmapping(2027, 'selvangivelse', { '2027-selvangivelse': omvendt }).egetAar, false)
})

test('en override for året med egne defaults er årets egen kilde, uændret eller ej', () => {
  const eget = hentFeltmapping(2026, 'forskud')
  assert.equal(eget.egetAar, true)
  const uaendret = { '2026-forskud': eget.felter.map(r => ({ ...r })) }
  const efter = hentFeltmapping(2026, 'forskud', uaendret)
  assert.equal(efter.egetAar, true, '2026 har sin egen mapping — der er intet arvet at falde tilbage til')
  assert.equal(efter.kildeAar, 2026)
})
