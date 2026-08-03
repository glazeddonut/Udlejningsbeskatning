import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bilagForAar, medBilagsnumre, migrerBilag, postIdForKategori, bilagPost, bilagssummer } from './bilag.js'

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

// ── Bilaget peger på en post i kontoplanen (ADR-0005) ─────────────────────────
//
// Kategorien var en fri tekst valgt fra en liste i Bilag-fanen, uden nogen kobling til
// kontoplanen: et bilag på "Vedligeholdelse" og udgiftsposten `vedligeholdelse` var to
// ubeslægtede ting. Bilaget bærer nu postens id, og de gamle kategorier oversættes.

test('en entydig kategori oversættes til postens id, og den frie tekst ryddes', () => {
  const [ud] = migrerBilag([b(1, 2025, { kategori: 'Vedligeholdelse', type: 'udgift' })])
  assert.equal(ud.post_id, 'udgifter.vedligeholdelse')
  assert.equal('kategori' in ud, false, 'den frie tekst må ikke blive stående som anden sandhed')
})

test('kategorier der findes i begge grupper afgøres af bilagets type', () => {
  assert.equal(postIdForKategori('Vand', 'udgift'), 'udgifter.vand')
  assert.equal(postIdForKategori('Vand', 'indtaegt'), 'indtaegter.vand')
  assert.equal(postIdForKategori('Varme', 'udgift'), 'udgifter.varme')
  assert.equal(postIdForKategori('Varme', 'indtaegt'), 'indtaegter.varme')
  assert.equal(postIdForKategori('Andet', 'udgift'), 'udgifter.andet')
  assert.equal(postIdForKategori('Andet', 'indtaegt'), 'indtaegter.andet')
})

test('alle vælgerens gamle kategorier oversættes — ingen af dem bliver hjemløse', () => {
  const gamle = [
    ['Husleje', 'indtaegt', 'indtaegter.leje'],
    ['Anden indtægt', 'indtaegt', 'indtaegter.andet'],
    ['Grundskyld', 'udgift', 'udgifter.grundskyld'],
    ['Fællesudgifter', 'udgift', 'udgifter.faellesudgifter'],
    ['Forsikring', 'udgift', 'udgifter.forsikring'],
    ['Vedligeholdelse', 'udgift', 'udgifter.vedligeholdelse'],
    ['Administration', 'udgift', 'udgifter.administration'],
    ['Renovation', 'udgift', 'udgifter.renovation'],
    ['Renteudgifter', 'udgift', 'renteudgifter.renteudgifter'],
  ]
  for (const [kategori, type, forventet] of gamle) {
    assert.equal(postIdForKategori(kategori, type), forventet, kategori)
  }
})

test('en kategori kontoplanen ikke kender bevares og markeres — den går ikke tabt', () => {
  const [ud] = migrerBilag([b(1, 2025, { kategori: 'Ejerforening', type: 'udgift' })])
  assert.equal(ud.post_id, null)
  assert.equal(ud.kategori, 'Ejerforening', 'den oprindelige kategori skal bevares')
  assert.deepEqual(bilagPost(ud), { label: 'Ejerforening (ukendt post)', kendt: false })
})

test('migreringen er idempotent og lader et bilag der allerede peger på en post ligge', () => {
  const engang = migrerBilag([
    b(1, 2025, { kategori: 'Vedligeholdelse', type: 'udgift' }),
    b(2, 2025, { kategori: 'Ejerforening', type: 'udgift' }),
  ])
  assert.deepEqual(migrerBilag(engang), engang)
  assert.deepEqual(migrerBilag([b(3, 2025, { post_id: 'udgifter.andet' })]), [b(3, 2025, { post_id: 'udgifter.andet' })])
})

test('migreringen muterer ikke inddata og rører ikke bilagsnumrene', () => {
  const original = { id: 5, aar: 2026, tekst: 'Vindue', beloeb: 21608.75, kategori: 'Vedligeholdelse', type: 'udgift' }
  const alle = [original, { id: 6, aar: 2026, kategori: 'Andet', type: 'udgift' }]
  const migreret = migrerBilag(alle)
  assert.equal(original.kategori, 'Vedligeholdelse', 'inddata må ikke ændres')
  assert.equal(original.post_id, undefined)
  assert.equal(migreret[0].beloeb, 21608.75, 'øvrige felter bæres uændret med')
  assert.deepEqual(bilagForAar(migreret, 2026).map(x => [x.id, x.nummer]), bilagForAar(alle, 2026).map(x => [x.id, x.nummer]))
})

test('bilagPost viser postens danske label — også for de ikke-summerbare poster', () => {
  const label = (post_id) => bilagPost({ post_id }).label
  assert.equal(label('udgifter.vedligeholdelse'), 'Vedligeholdelse')
  assert.equal(label('indtaegter.leje'), 'Husleje')
  assert.equal(label('indtaegter.vand'), 'Vand (opkrævet)')
  assert.equal(label('udgifter.vand'), 'Vand (afholdt)')
  assert.equal(label('renteudgifter.renteudgifter'), 'Renteudgifter')
  assert.equal(label('forbedringer.forbedringer'), 'Forbedring')
  assert.equal(bilagPost({ post_id: 'udgifter.vedligeholdelse' }).kendt, true)
})

test('et bilag helt uden post og uden kategori viser ingenting frem for en falsk markering', () => {
  assert.deepEqual(bilagPost({ post_id: null, kategori: '' }), { label: '', kendt: false })
  assert.deepEqual(bilagPost({}), { label: '', kendt: false })
  assert.deepEqual(bilagPost(null), { label: '', kendt: false })
})

test('et post_id kontoplanen ikke kender markeres som ukendt frem for at blive vist råt', () => {
  assert.deepEqual(bilagPost({ post_id: 'udgifter.ejerforening' }),
    { label: 'udgifter.ejerforening (ukendt post)', kendt: false })
})

// ── Bilagssummen pr. post — den ene halvdel af afstemningen (ADR-0005) ────────
//
// Fortegnsreglen er afgjort i #9/#13: POSTEN bestemmer hvilken række bilaget hører
// til, TYPEN bestemmer fortegnet inden for den række. Uden den regel ville en
// kreditnota på husleje lande på udgiftssiden og dér ligne en driftsudgift.

test('et bilag med samme retning som sin post lægger til bilagssummen', () => {
  const { perPost } = bilagssummer([
    b(1, 2025, { post_id: 'udgifter.vedligeholdelse', type: 'udgift', beloeb: 5211 }),
    b(2, 2025, { post_id: 'indtaegter.leje', type: 'indtaegt', beloeb: 21774 }),
  ])
  assert.deepEqual(perPost['udgifter.vedligeholdelse'], { antal: 1, sum: 5211 })
  assert.deepEqual(perPost['indtaegter.leje'], { antal: 1, sum: 21774 })
})

test('et bilag med modsat retning trækker fra sin egen posts sum — det skifter ikke post', () => {
  const { perPost } = bilagssummer([
    b(1, 2025, { post_id: 'indtaegter.leje', type: 'indtaegt', beloeb: 22774 }),
    b(2, 2025, { post_id: 'indtaegter.leje', type: 'udgift', beloeb: 1000 }),      // kreditnota
    b(3, 2025, { post_id: 'udgifter.vedligeholdelse', type: 'indtaegt', beloeb: 789 }), // refusion
    b(4, 2025, { post_id: 'udgifter.vedligeholdelse', type: 'udgift', beloeb: 6000 }),
  ])
  assert.deepEqual(perPost['indtaegter.leje'], { antal: 2, sum: 21774 })
  assert.deepEqual(perPost['udgifter.vedligeholdelse'], { antal: 2, sum: 5211 })
})

test('de ikke-summerbare poster tæller som udgifter — de er betalte beløb', () => {
  const { perPost } = bilagssummer([
    b(1, 2025, { post_id: 'renteudgifter.renteudgifter', type: 'udgift', beloeb: 17849 }),
    b(2, 2025, { post_id: 'forbedringer.forbedringer', type: 'udgift', beloeb: 40000 }),
  ])
  assert.equal(perPost['renteudgifter.renteudgifter'].sum, 17849)
  assert.equal(perPost['forbedringer.forbedringer'].sum, 40000)
})

test('summen afrundes til øre, så flydende mellemresultater ikke giver falske differencer', () => {
  const { perPost } = bilagssummer([
    b(1, 2025, { post_id: 'udgifter.andet', type: 'udgift', beloeb: 0.1 }),
    b(2, 2025, { post_id: 'udgifter.andet', type: 'udgift', beloeb: 0.2 }),
  ])
  assert.equal(perPost['udgifter.andet'].sum, 0.3)
})

test('bilag hvis post kontoplanen ikke kender tælles for sig i stedet for at forsvinde', () => {
  const { perPost, ukendte } = bilagssummer([
    b(1, 2025, { post_id: null, kategori: 'Ejerforening', type: 'udgift', beloeb: 1200 }),
    b(2, 2025, { post_id: 'udgifter.ejerforening', type: 'udgift', beloeb: 800 }),
    b(3, 2025, { post_id: 'udgifter.vedligeholdelse', type: 'udgift', beloeb: 5211 }),
  ])
  assert.deepEqual(ukendte, { antal: 2 })
  assert.deepEqual(Object.keys(perPost), ['udgifter.vedligeholdelse'])
})

// Uden en post er der ingen gruppe at se fortegnet fra. Blev de ukendte bilag summet,
// ville en indtægt og en udgift på samme beløb udligne hinanden og vise 0 — altså
// præcis det tavse tab markeringen skal forhindre.
test('ukendte bilag summes ikke — to modsatrettede bilag udligner ikke hinanden væk', () => {
  const { ukendte } = bilagssummer([
    b(1, 2025, { post_id: null, kategori: 'Ejerforening', type: 'udgift', beloeb: 1200 }),
    b(2, 2025, { post_id: null, kategori: 'Ejerforening', type: 'indtaegt', beloeb: 1200 }),
  ])
  assert.deepEqual(ukendte, { antal: 2 })
})

test('ingen bilag giver ingen poster og ingen ukendte — ikke NaN', () => {
  assert.deepEqual(bilagssummer([]), { perPost: {}, ukendte: { antal: 0 } })
  assert.deepEqual(bilagssummer(undefined), { perPost: {}, ukendte: { antal: 0 } })
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
