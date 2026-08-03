import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bilagForAar, medBilagsnumre } from './bilag.js'

// Bilagsnummeret er ikke stamdata — det er en egenskab ved årets samlede bilagsliste,
// og det udledes derfor ved hvert opslag. Testene her fastholder de tre ting der
// tidligere kunne drive fra hinanden: rækkefølgen, gapfriheden og uafhængigheden
// mellem årene. De fastholder også at et gemt (og dermed muligvis forkert) nummer
// på et bilag aldrig får lov at påvirke resultatet.

// Kortform: kun de felter nummereringen ser på. Resten af bilaget bæres uændret med.
const b = (id, aar, ekstra = {}) => ({ id, aar, tekst: `bilag ${id}`, ...ekstra })

test('årets bilag nummereres fortløbende 1..n i oprettelsesrækkefølge', () => {
  const alle = [b(1, 2026), b(2, 2026), b(3, 2026)]
  assert.deepEqual(bilagForAar(alle, 2026).map(x => x.nummer), [1, 2, 3])
})

test('sletning af bilag 1 af 3 giver numrene 1, 2 — ikke 2, 3', () => {
  const alle = [b(2, 2026), b(3, 2026)]   // id 1 er slettet
  const aaret = bilagForAar(alle, 2026)
  assert.deepEqual(aaret.map(x => x.nummer), [1, 2])
  assert.deepEqual(aaret.map(x => x.id), [2, 3])
})

test('bilag på tværs af år nummereres uafhængigt', () => {
  const alle = [b(1, 2025), b(2, 2026), b(3, 2025), b(4, 2026)]
  assert.deepEqual(bilagForAar(alle, 2025).map(x => [x.id, x.nummer]), [[1, 1], [3, 2]])
  assert.deepEqual(bilagForAar(alle, 2026).map(x => [x.id, x.nummer]), [[2, 1], [4, 2]])
})

test('år-filtrering ændrer ikke numrene — samme bilag, samme nummer med og uden filter', () => {
  const alle = [b(1, 2025), b(2, 2026), b(3, 2025), b(4, 2026)]
  const fraSamlet = medBilagsnumre(alle).filter(x => x.aar === 2026)
  assert.deepEqual(fraSamlet.map(x => [x.id, x.nummer]), bilagForAar(alle, 2026).map(x => [x.id, x.nummer]))
})

test('et gemt nummer på bilaget ignoreres — listen er eneste sandhed', () => {
  // Formen fra den faktiske DB: 2026-bilagene bærer 2 og 3, men skal serveres som 1 og 2.
  const alle = [
    b(2, 2025, { nummer: 1 }), b(4, 2025, { nummer: 2 }),
    b(5, 2026, { nummer: 2 }), b(6, 2026, { nummer: 3 }),
  ]
  assert.deepEqual(bilagForAar(alle, 2026).map(x => [x.id, x.nummer]), [[5, 1], [6, 2]])
  assert.deepEqual(bilagForAar(alle, 2025).map(x => [x.id, x.nummer]), [[2, 1], [4, 2]])
})

test('rækkefølgen er oprettelsesrækkefølgen (id), uanset hvordan listen kommer ind', () => {
  const alle = [b(9, 2026, { dato: '2026-01-02' }), b(3, 2026, { dato: '2026-11-30' }), b(7, 2026, { dato: '2026-05-05' })]
  assert.deepEqual(bilagForAar(alle, 2026).map(x => x.id), [3, 7, 9])
  assert.deepEqual(bilagForAar(alle, 2026).map(x => x.nummer), [1, 2, 3])
})

test('nummereringen er idempotent — et allerede nummereret svar kan nummereres igen', () => {
  const alle = [b(2, 2026), b(5, 2026), b(8, 2026)]
  const engang = bilagForAar(alle, 2026)
  assert.deepEqual(bilagForAar(engang, 2026), engang)
})

test('året må gerne komme ind som tekst (query-parameter) og matcher stadig', () => {
  const alle = [b(1, 2025), b(2, 2026)]
  assert.deepEqual(bilagForAar(alle, '2026').map(x => x.id), [2])
})

test('år uden bilag, tom liste og manglende liste giver tom liste', () => {
  assert.deepEqual(bilagForAar([b(1, 2025)], 2027), [])
  assert.deepEqual(bilagForAar([], 2026), [])
  assert.deepEqual(bilagForAar(undefined, 2026), [])
  assert.deepEqual(medBilagsnumre(undefined), [])
})

test('uden år nummereres alle bilag, hvert år for sig, sorteret efter id', () => {
  const alle = [b(4, 2026), b(1, 2025), b(3, 2026), b(2, 2025)]
  assert.deepEqual(medBilagsnumre(alle).map(x => [x.id, x.aar, x.nummer]), [
    [1, 2025, 1], [2, 2025, 2], [3, 2026, 1], [4, 2026, 2],
  ])
})

test('bilagets øvrige felter bæres uændret med, og inddata muteres ikke', () => {
  const original = { id: 5, aar: 2026, nummer: 2, dato: '2026-03-17', tekst: 'Vindue', beloeb: 21608.75, filsti: '5.pdf' }
  const alle = [original]
  const [ud] = bilagForAar(alle, 2026)
  assert.equal(ud.nummer, 1)
  assert.equal(ud.tekst, 'Vindue')
  assert.equal(ud.beloeb, 21608.75)
  assert.equal(ud.filsti, '5.pdf')
  assert.equal(original.nummer, 2, 'inddata må ikke ændres')
  assert.deepEqual(alle, [original], 'listen må ikke sorteres på plads')
})
