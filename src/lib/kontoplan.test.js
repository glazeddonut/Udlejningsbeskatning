import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KONTOPLAN, posterIGruppe, findPost, erKendtPost } from './kontoplan.js'
import { tomtSaet } from './beregning.js'

// Kontoplanen er én kilde til sandhed. Testene her fastholder to ting: at posterne
// er dem der findes i dag (ingen tavs omdøbning), og at et tomt talsæt ikke kan
// drive fra kontoplanen.

test('hver post bærer nøgle, dansk label, gruppe, hint og ejendomspost-flag', () => {
  for (const p of KONTOPLAN) {
    assert.equal(typeof p.noegle, 'string', `${p.id}: nøgle`)
    assert.ok(p.noegle.length > 0, `${p.id}: nøgle må ikke være tom`)
    assert.equal(typeof p.label, 'string', `${p.id}: label`)
    assert.ok(p.label.length > 0, `${p.id}: label må ikke være tom`)
    assert.ok(['indtaegter', 'udgifter'].includes(p.gruppe), `${p.id}: gruppe`)
    assert.equal(typeof p.hint, 'string', `${p.id}: hint (må gerne være tom)`)
    assert.equal(typeof p.ejendomspost, 'boolean', `${p.id}: ejendomspost`)
    assert.equal(p.id, `${p.gruppe}.${p.noegle}`)
  }
})

test('kontoplanen rummer nøjagtig dagens poster, med uændrede nøgler og rækkefølge', () => {
  assert.deepEqual(posterIGruppe('indtaegter').map(p => p.noegle), ['leje', 'vand', 'varme', 'andet'])
  assert.deepEqual(posterIGruppe('udgifter').map(p => p.noegle), [
    'grundskyld', 'faellesudgifter', 'forsikring', 'vedligeholdelse',
    'vand', 'varme', 'administration', 'renovation', 'andet',
  ])
})

test('kontoplanen bruger de labels Årets tal viste i forvejen', () => {
  assert.equal(findPost('indtaegter', 'leje').label, 'Husleje')
  assert.equal(findPost('indtaegter', 'leje').hint, 'ekskl. forbrug')
  assert.equal(findPost('indtaegter', 'vand').label, 'Vand (opkrævet)')
  assert.equal(findPost('udgifter', 'vand').label, 'Vand (afholdt)')
  assert.equal(findPost('udgifter', 'grundskyld').label, 'Grundskyld (ejendomsskat)')
  assert.equal(findPost('udgifter', 'faellesudgifter').hint, 'ikke henlæggelser til forbedring')
  assert.equal(findPost('udgifter', 'vedligeholdelse').hint, 'ikke forbedring')
})

test('id er unikt, selv om samme nøgle findes i begge grupper', () => {
  const ids = KONTOPLAN.map(p => p.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.notEqual(findPost('indtaegter', 'vand').id, findPost('udgifter', 'vand').id)
})

test('ejendomsposter er dem der vedrører hele ejendommen — ikke kun det udlejede', () => {
  const ejendom = KONTOPLAN.filter(p => p.ejendomspost).map(p => p.id)
  assert.deepEqual(ejendom, [
    'udgifter.grundskyld', 'udgifter.faellesudgifter', 'udgifter.forsikring', 'udgifter.renovation',
  ])
})

test('ingen indtægt er en ejendomspost — den udlejede andel må aldrig ramme indtægter', () => {
  assert.equal(posterIGruppe('indtaegter').some(p => p.ejendomspost), false)
})

test('erKendtPost skelner mellem grupperne og afviser ukendte nøgler', () => {
  assert.equal(erKendtPost('udgifter', 'grundskyld'), true)
  assert.equal(erKendtPost('indtaegter', 'grundskyld'), false)   // findes kun som udgift
  assert.equal(erKendtPost('udgifter', 'ejerforening'), false)
  assert.equal(erKendtPost('renteudgifter', 'leje'), false)      // ikke en kontoplan-gruppe
  assert.equal(findPost('indtaegter', 'grundskyld'), undefined)
})

test('posterIGruppe returnerer kun den ønskede gruppe og aldrig noget for ukendte grupper', () => {
  assert.equal(posterIGruppe('udgifter').every(p => p.gruppe === 'udgifter'), true)
  assert.deepEqual(posterIGruppe('forbedringer'), [])
})

test('tomtSaet bygges af kontoplanen, så de to ikke kan drive fra hinanden', () => {
  const t = tomtSaet()
  assert.deepEqual(Object.keys(t.indtaegter), posterIGruppe('indtaegter').map(p => p.noegle))
  assert.deepEqual(Object.keys(t.udgifter), posterIGruppe('udgifter').map(p => p.noegle))
  assert.equal(Object.values(t.indtaegter).every(v => v === 0), true)
  assert.equal(Object.values(t.udgifter).every(v => v === 0), true)
})
