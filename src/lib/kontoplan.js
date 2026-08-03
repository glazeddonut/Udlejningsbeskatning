// ── Kontoplanen ────────────────────────────────────────────────────────────────
//
// Den samlede liste over hvilke indtægts- og udgiftsposter der findes, hvad de
// hedder, hvilken gruppe de hører til, og om de vedrører hele ejendommen eller kun
// det udlejede. Målet er ÉN kilde til sandhed, så rækkerne i et regnskab altid summer
// til totalen (ADR-0001).
//
// Indtastningen (Årets tal) og summeringen læser herfra i dag. Årsregnskabet, PDF'en
// og bilagene har stadig hver deres egen liste — de flyttes over når opstillingen og
// bilagsafstemningen bygges, netop for ikke at skrive dem om to gange.
//
// Gruppenavnene er talsættets egne nøgler ('indtaegter' / 'udgifter'), så en post kan
// bruges direkte i effektivBeloeb(saet, gruppe, noegle) uden oversættelse undervejs.
// Nøglen alene er ikke entydig — vand, varme og andet findes i begge grupper — så
// postens identitet er `id` = "gruppe.nøgle", samme form som pro rata-nøglerne.
//
// Ejendomspost = posten vedrører hele ejendommen (grundskyld, fællesudgifter,
// forsikring, renovation) og er derfor kun fradragsberettiget med den udlejede andel.
// Flaget bæres her nu; den udlejede andel begynder først at virke i et senere trin.
// Ingen indtægt er en ejendomspost — andelen må aldrig ramme indtægtssiden.
//
// Summerbar = posten er en linje i udlejningsresultatet. De to ikke-summerbare poster
// findes, fordi et bilag skal kunne dokumentere ALT hvad der er betalt — også det der
// ikke er en linje i resultatet: renteudgifter er personlige (kapitalindkomst), og
// forbedringer er ikke fradrag, men tillægges anskaffelsessummen. Begge dele er
// ufravigelige skatteregler her, så flaget alene er ikke værn nok: posterne ligger i
// hver sin gruppe uden for 'indtaegter' og 'udgifter', og kan derfor slet ikke ses af
// en summering, der løber en af de to grupper igennem.
//
// NB: for de to nye grupper holder konventionen "nøglen slår op i saet[gruppe]" IKKE.
// Beløbet ligger på gruppeniveau i talsættet — `saet.forbedringer` er ét tal, og
// `saet.renteudgifter` er nøglet på lånets id, ikke på postens nøgle. Gruppen er
// altså stedet, beløbet skal hentes; nøglen gentager kun gruppen, fordi id'et er
// `gruppe.nøgle`, og gruppen har præcis én post. `effektivBeloeb` må derfor ikke
// bruges på dem — den ville svare 0. Det er også derfor `posterIGruppe` aldrig
// kaldes med dem: kun 'indtaegter' og 'udgifter' er talsæt-grupper med poster i.

const post = (gruppe, noegle, label, hint = '', ejendomspost = false, summerbar = true) =>
  Object.freeze({ id: `${gruppe}.${noegle}`, gruppe, noegle, label, hint, ejendomspost, summerbar })

export const KONTOPLAN = Object.freeze([
  post('indtaegter', 'leje', 'Husleje', 'ekskl. forbrug'),
  post('indtaegter', 'vand', 'Vand (opkrævet)'),
  post('indtaegter', 'varme', 'Varme (opkrævet)'),
  post('indtaegter', 'andet', 'Anden indtægt'),

  post('udgifter', 'grundskyld', 'Grundskyld (ejendomsskat)', '', true),
  post('udgifter', 'faellesudgifter', 'Fællesudgifter (drift)', 'ikke henlæggelser til forbedring', true),
  post('udgifter', 'forsikring', 'Forsikring', '', true),
  post('udgifter', 'vedligeholdelse', 'Vedligeholdelse', 'ikke forbedring'),
  post('udgifter', 'vand', 'Vand (afholdt)'),
  post('udgifter', 'varme', 'Varme (afholdt)'),
  post('udgifter', 'administration', 'Administration'),
  post('udgifter', 'renovation', 'Renovation', '', true),
  post('udgifter', 'andet', 'Andet'),

  post('renteudgifter', 'renteudgifter', 'Renteudgifter', 'personlige — uden for udlejningsresultatet', false, false),
  post('forbedringer', 'forbedringer', 'Forbedring', 'ikke fradrag — tillægges anskaffelsessummen', false, false),
])

// Posterne i én gruppe, i kontoplanens rækkefølge. Ukendt gruppe → tom liste.
export function posterIGruppe(gruppe) {
  return KONTOPLAN.filter(p => p.gruppe === gruppe)
}

// Posten bag en (gruppe, nøgle) — undefined hvis kontoplanen ikke kender den.
export function findPost(gruppe, noegle) {
  return KONTOPLAN.find(p => p.gruppe === gruppe && p.noegle === noegle)
}

// Posten med dette id ("gruppe.nøgle") — undefined hvis kontoplanen ikke kender det.
// Det er den vej et bilag går: bilaget bærer postens id, ikke en fri kategoritekst.
export function findPostId(id) {
  return id ? KONTOPLAN.find(p => p.id === id) : undefined
}

// Kender kontoplanen denne nøgle i denne gruppe? Er svaret nej, er værdien hjemløs.
export function erKendtPost(gruppe, noegle) {
  return !!findPost(gruppe, noegle)
}
