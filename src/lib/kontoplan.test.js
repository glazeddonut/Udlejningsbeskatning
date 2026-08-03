import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KONTOPLAN, posterIGruppe, findPost, findPostId, erKendtPost } from './kontoplan.js'
import { tomtSaet, sumIndtaegter, sumFradragsUdgifter, resultatFoerRenter, gruppeOpgoerelse } from './beregning.js'

// Kontoplanen er én kilde til sandhed. Testene her fastholder to ting: at posterne
// er dem der findes i dag (ingen tavs omdøbning), og at et tomt talsæt ikke kan
// drive fra kontoplanen.

test('hver post bærer nøgle, dansk label, gruppe, hint, ejendomspost- og summerbar-flag', () => {
  for (const p of KONTOPLAN) {
    assert.equal(typeof p.noegle, 'string', `${p.id}: nøgle`)
    assert.ok(p.noegle.length > 0, `${p.id}: nøgle må ikke være tom`)
    assert.equal(typeof p.label, 'string', `${p.id}: label`)
    assert.ok(p.label.length > 0, `${p.id}: label må ikke være tom`)
    assert.ok(['indtaegter', 'udgifter', 'renteudgifter', 'forbedringer'].includes(p.gruppe), `${p.id}: gruppe`)
    assert.equal(typeof p.hint, 'string', `${p.id}: hint (må gerne være tom)`)
    assert.equal(typeof p.ejendomspost, 'boolean', `${p.id}: ejendomspost`)
    assert.equal(typeof p.summerbar, 'boolean', `${p.id}: summerbar`)
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

// ── De ikke-summerbare poster ─────────────────────────────────────────────────
//
// Renteudgifter er personlige og forbedringer tillægges anskaffelsessummen. Begge
// dele kan dokumenteres med et bilag, men ingen af dem er en linje i
// udlejningsresultatet. De ligger derfor i hver sin gruppe — uden for 'indtaegter'
// og 'udgifter' — så ingen summering overhovedet kan komme til at se dem.

test('kontoplanen rummer ikke-summerbare poster til renteudgifter og forbedringer', () => {
  const ikkeSummerbare = KONTOPLAN.filter(p => !p.summerbar)
  assert.deepEqual(ikkeSummerbare.map(p => p.id), ['renteudgifter.renteudgifter', 'forbedringer.forbedringer'])
  assert.equal(findPostId('renteudgifter.renteudgifter').label, 'Renteudgifter')
  assert.equal(findPostId('forbedringer.forbedringer').label, 'Forbedring')
})

test('alle poster i indtaegter og udgifter er summerbare — og kun de to andre er ikke', () => {
  for (const p of [...posterIGruppe('indtaegter'), ...posterIGruppe('udgifter')]) {
    assert.equal(p.summerbar, true, `${p.id} indgår i udlejningsresultatet og skal være summerbar`)
  }
  for (const p of KONTOPLAN.filter(p => !p.summerbar)) {
    assert.equal(['indtaegter', 'udgifter'].includes(p.gruppe), false, `${p.id} må ikke ligge i en summeret gruppe`)
  }
})

test('renteudgifter og forbedringer lækker aldrig ind i udlejningsresultatet', () => {
  // Beløbene lægges ind i talsættets EGNE former — forbedringer er ét tal, og
  // renteudgifter er nøglet på lånets id — altså præcis som de faktisk gemmes.
  const rent = tomtSaet()
  rent.indtaegter.leje = 100000
  rent.udgifter.vedligeholdelse = 20000
  const medUdenfor = { ...rent, forbedringer: 40000, renteudgifter: { 1: 45000 } }

  assert.equal(resultatFoerRenter(rent), 80000)
  assert.equal(resultatFoerRenter(medUdenfor), 80000)
  assert.equal(sumIndtaegter(medUdenfor), sumIndtaegter(rent))
  assert.equal(sumFradragsUdgifter(medUdenfor), sumFradragsUdgifter(rent))
  assert.deepEqual(gruppeOpgoerelse(medUdenfor, 'indtaegter'), gruppeOpgoerelse(rent, 'indtaegter'))
  assert.deepEqual(gruppeOpgoerelse(medUdenfor, 'udgifter'), gruppeOpgoerelse(rent, 'udgifter'))
})

test('en gruppeopgørelse ser kun summerbare poster', () => {
  // Værnet mod at nogen senere lægger en ikke-summerbar post i en summeret gruppe:
  // så ville den blive en linje i resultatet uden at nogen bad om det.
  for (const gruppe of ['indtaegter', 'udgifter']) {
    const opg = gruppeOpgoerelse(tomtSaet(), gruppe)
    assert.deepEqual(opg.poster.map(p => p.id), posterIGruppe(gruppe).map(p => p.id))
    assert.equal(opg.poster.every(p => findPostId(p.id).summerbar), true, gruppe)
  }
})

test('findPostId slår op på id og afviser ukendte id', () => {
  assert.equal(findPostId('udgifter.vedligeholdelse'), findPost('udgifter', 'vedligeholdelse'))
  assert.equal(findPostId('indtaegter.vand').label, 'Vand (opkrævet)')
  assert.equal(findPostId('udgifter.ejerforening'), undefined)
  assert.equal(findPostId(''), undefined)
  assert.equal(findPostId(null), undefined)
})

test('erKendtPost skelner mellem grupperne og afviser ukendte nøgler', () => {
  assert.equal(erKendtPost('udgifter', 'grundskyld'), true)
  assert.equal(erKendtPost('indtaegter', 'grundskyld'), false)   // findes kun som udgift
  assert.equal(erKendtPost('udgifter', 'ejerforening'), false)
  assert.equal(erKendtPost('renteudgifter', 'leje'), false)      // gruppen findes, nøglen gør ikke
  assert.equal(findPost('indtaegter', 'grundskyld'), undefined)
})

test('posterIGruppe returnerer kun den ønskede gruppe og aldrig noget for ukendte grupper', () => {
  assert.equal(posterIGruppe('udgifter').every(p => p.gruppe === 'udgifter'), true)
  assert.deepEqual(posterIGruppe('afskrivninger'), [])
})

test('tomtSaet bygges af kontoplanen, så de to ikke kan drive fra hinanden', () => {
  const t = tomtSaet()
  assert.deepEqual(Object.keys(t.indtaegter), posterIGruppe('indtaegter').map(p => p.noegle))
  assert.deepEqual(Object.keys(t.udgifter), posterIGruppe('udgifter').map(p => p.noegle))
  assert.equal(Object.values(t.indtaegter).every(v => v === 0), true)
  assert.equal(Object.values(t.udgifter).every(v => v === 0), true)
})
