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
