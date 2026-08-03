// ── Bilag ──────────────────────────────────────────────────────────────────────
//
// Et bilag er et dokumenteret indtægts- eller udgiftsakt: dato, beløb, post og en fil
// på disk. Nummeret er derimod IKKE en egenskab ved det enkelte bilag — det er en
// egenskab ved årets samlede bilagsliste: fortløbende og gapfrit 1..n inden for året.
//
// Derfor beregnes nummeret ved hvert opslag i stedet for at blive gemt. Gemmes det,
// opstår der to sandheder: slettes et bilag efterlader det gemte nummer et hul, og
// næste bilag beregner sit nummer ud fra hullet, så driften akkumulerer (issue #1 —
// 2026-bilagene lå med 2 og 3 på disken, mens listen viste 1 og 2). Et eventuelt gemt
// `nummer` på inddata ignoreres derfor bevidst her.
//
// Rækkefølgen er oprettelsesrækkefølgen (stigende id), ikke bilagsdatoen: nummeret
// skal ligge fast, når et bilag først er nummereret, og en efterindtastet kvittering
// med gammel dato må ikke omnummerere de foregående bilag.
//
// Samme mønster som ADR-0004: db-formede data ind, domæneformede data ud. Både
// serverens GET /api/bilag, Bilag-fanen og regnskabs-PDF'en går denne ene vej.
//
// ── Posten (ADR-0005) ──
// Bilaget bar tidligere en fri kategoritekst valgt fra en liste i Bilag-fanen, uden
// kobling til kontoplanen. Et bilag på "Vedligeholdelse" og udgiftsposten
// `vedligeholdelse` var derfor to ubeslægtede ting, og en afstemning mellem dem var
// umulig. Bilaget bærer nu `post_id` — id'et på en post i kontoplanen.
//
// Oversættelsen af de gamle kategorier ligger her, ved seamet, så den kan testes rent.
// Den KALDES fra loadDb i server.js, af samme grund som lease→leases-migreringen og
// oprydningen i gemte bilagsnumre ligger dér: en migrering skal træde i kraft på
// disken, næste gang brugeren bruger appen, ikke udføres på ny ved hver visning.

import { findPostId } from './kontoplan.js'

// De kategorier vælgeren tilbød, oversat til poster. Alle kategorier på nær tre er
// entydige.
const POST_FOR_KATEGORI = Object.freeze({
  'husleje': 'indtaegter.leje',
  'anden indtægt': 'indtaegter.andet',
  'grundskyld': 'udgifter.grundskyld',
  'fællesudgifter': 'udgifter.faellesudgifter',
  'forsikring': 'udgifter.forsikring',
  'vedligeholdelse': 'udgifter.vedligeholdelse',
  'administration': 'udgifter.administration',
  'renovation': 'udgifter.renovation',
  'renteudgifter': 'renteudgifter.renteudgifter',
})

// Vand, varme og "andet" findes i BEGGE grupper — nøglen alene er ikke entydig.
// Bilagets egen type afgør, om det er den opkrævede eller den afholdte post.
const POST_FOR_KATEGORI_EFTER_TYPE = Object.freeze({
  'vand': { indtaegt: 'indtaegter.vand', udgift: 'udgifter.vand' },
  'varme': { indtaegt: 'indtaegter.varme', udgift: 'udgifter.varme' },
  'andet': { indtaegt: 'indtaegter.andet', udgift: 'udgifter.andet' },
})

// Postens id for en gammel kategoritekst — null hvis den ikke kan oversættes.
// Null er ikke et nederlag: kategorien bevares på bilaget og vises markeret, så
// oplysningen ikke går tavst tabt. At gætte en post ville være værre end at lade
// den stå åben. (Selve rettevejen i UI'et — at vælge posten på et eksisterende
// bilag — findes endnu ikke; bilaget kan kun slettes og lægges ind igen.)
export function postIdForKategori(kategori, type) {
  const k = String(kategori ?? '').trim().toLowerCase()
  if (!k) return null
  const efterType = POST_FOR_KATEGORI_EFTER_TYPE[k]
  if (efterType) return efterType[type === 'indtaegt' ? 'indtaegt' : 'udgift']
  return POST_FOR_KATEGORI[k] ?? null
}

// Bilag med posten på plads. Et bilag der allerede peger på en post røres ikke, og et
// bilag hvis kategori ikke kan oversættes beholder den (post_id = null) frem for at
// miste den. Ren funktion: inddata muteres ikke.
export function migrerBilag(alleBilag) {
  return (alleBilag ?? []).map(b => {
    if (b?.post_id) return b
    const post_id = postIdForKategori(b?.kategori, b?.type)
    if (!post_id) return { ...b, post_id: null }
    const { kategori, ...resten } = b        // oversat → den frie tekst skal væk
    return { ...resten, post_id }
  })
}

// Bilagets post til visning: den danske label, og om kontoplanen overhovedet kender
// posten. Kender den den ikke, vises den bevarede kategori (eller det gemte id)
// markeret som ukendt. Både teksten OG dommen kommer herfra, så en flade ikke kan
// vise labelen uden markeringen — eller markere noget andet end det, teksten siger.
// Uden både post og kategori er der intet at vise og intet at markere.
export function bilagPost(b) {
  const post = findPostId(b?.post_id)
  if (post) return { label: post.label, kendt: true }
  const bevaret = String(b?.kategori ?? '').trim() || String(b?.post_id ?? '').trim()
  return { label: bevaret ? `${bevaret} (ukendt post)` : '', kendt: false }
}

// Alle bilag, hvert år nummereret uafhængigt, sorteret efter id. Rene funktioner:
// hverken listen eller bilagene muteres — der kommer en ny liste ud.
export function medBilagsnumre(alleBilag) {
  const tael = {}
  return [...(alleBilag ?? [])]
    .sort((a, b) => a.id - b.id)
    .map(b => ({ ...b, nummer: (tael[b.aar] = (tael[b.aar] || 0) + 1) }))
}

// Årets bilag, nummereret gapfrit 1..n og sorteret. Året må gerne komme ind som tekst
// (query-parameter). Nummeret er uafhængigt af de øvrige år og af om der filtreres.
export function bilagForAar(alleBilag, aar) {
  return medBilagsnumre(alleBilag).filter(b => Number(b.aar) === Number(aar))
}
