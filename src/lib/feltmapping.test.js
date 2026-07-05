import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hentFeltmapping, felterForRolle, feltRolle, evalKilde } from './feltmapping.js'

test('hentFeltmapping: bruger defaults for det definerede år', () => {
  assert.ok(hentFeltmapping(2026, 'forskud').length > 0)
  assert.ok(hentFeltmapping(2026, 'selvangivelse').length > 0)
})

test('hentFeltmapping: falder tilbage til nærmeste år for udefineret år (også tidligere)', () => {
  // 2025 er ikke defineret, men skal arve 2026-mappingen (fallback opad).
  assert.ok(hentFeltmapping(2025, 'forskud').length > 0)
  // Fremtidigt år arver også seneste kendte.
  assert.ok(hentFeltmapping(2030, 'selvangivelse').length > 0)
})

test('hentFeltmapping: overrides vinder over defaults', () => {
  const overrides = { '2026-forskud': [{ felt_nr: 'X', label: 'Test', kilde: 'resultat', rolle: 'begge' }] }
  assert.equal(hentFeltmapping(2026, 'forskud', overrides)[0].felt_nr, 'X')
})

test('felterForRolle: overskud viser 111/221, ikke 112/435', () => {
  const felter = hentFeltmapping(2026, 'selvangivelse')
  const overskud = felterForRolle(felter, 'beskattet', true).map(f => f.felt_nr)
  assert.ok(overskud.includes('111'))
  assert.ok(!overskud.includes('112'))
})

test('felterForRolle: underskud viser 112/435, ikke 111/221', () => {
  const felter = hentFeltmapping(2026, 'selvangivelse')
  const underskud = felterForRolle(felter, 'beskattet', false).map(f => f.felt_nr)
  assert.ok(underskud.includes('112'))
  assert.ok(!underskud.includes('111'))
})

test('felterForRolle: ikke-beskattet ser ikke rubrik 117 (kun beskattet)', () => {
  const felter = hentFeltmapping(2026, 'selvangivelse')
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
