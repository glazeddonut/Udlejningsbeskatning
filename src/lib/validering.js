// ── Validering af det der skrives ─────────────────────────────────────────────
//
// Rene funktioner, så reglerne kan testes uden at starte en HTTP-server. server.js
// kalder dem ved hvert skriveendepunkt; svaret har samme form som maaAarOprettes:
// `{ ok, begrundelse }`, hvor begrundelsen er den danske tekst brugeren får at se.

import { findPost, findPostId, erKendtPost } from './kontoplan.js'

const ja = { ok: true, begrundelse: '' }
// Begrundelserne bygges af feltnavne i små bogstaver ("restgælden er ikke et tal"), så
// de kan sættes efter et præfiks ("Budget (forskud): …"). Står en begrundelse alene,
// er den en sætning til brugeren og begynder med stort.
const nej = (begrundelse) => ({ ok: false, begrundelse: begrundelse.charAt(0).toUpperCase() + begrundelse.slice(1) })

// Et beløb er oplyst når det hverken er tomt, null eller fraværende. Et uoplyst
// beløb er ikke en fejl — talsættet må godt have et tomt felt.
const uoplyst = (v) => v === '' || v === null || v === undefined

// Kan værdien læses som et beløb? Kun tal og talstrenge; en boolean, et objekt eller
// "fem tusind" er ikke et beløb, og `Number(v) || 0` ville tavst gøre dem til 0.
function erTal(v) {
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'string') return v.trim() !== '' && Number.isFinite(Number(v.trim()))
  return false
}

// Er værdien en gyldig ISO-dato (YYYY-MM-DD)? Datoerne i appen gemmes som ISO —
// både udlejningsperioden, lejekontraktens datoer, købsdatoen og lånets peildato —
// og sammenlignes leksikalsk (fx i periodeForAar), så formen selv er en regel.
// En dato der ikke findes i kalenderen (2025-02-30) er heller ikke en dato.
function erDato(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [aar, maaned, dag] = v.split('-').map(Number)
  const d = new Date(Date.UTC(aar, maaned - 1, dag))
  return d.getUTCFullYear() === aar && d.getUTCMonth() === maaned - 1 && d.getUTCDate() === dag
}

// Er værdien et objekt med navngivne felter — altså den form et endepunkt skriver?
// En streng eller en liste er det ikke, og gemmes den alligevel, får man noget der
// ligner et objekt uden at være et: en lejekontrakt som { 0: 'h', 1: 'e', 2: 'j' }.
const erObjekt = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

// Kroppen skal være et objekt, hvis den overhovedet er der. Fravær er ikke en fejl —
// `null` rydder fx ejendommen — men noget der ikke kan bære felter, er det.
const tjekObjekt = (v, navn) => (v === null || v === undefined || erObjekt(v)) ? '' : `${navn} har ikke domænets form: “${v}”`

// De to grupper der ligger som objekter i talsættet, med en post pr. nøgle.
// Kontoplanens to øvrige grupper — renteudgifter og forbedringer — har ikke den form:
// forbedringer er ét tal, og renteudgifter er nøglet på lånets id (se kontoplan.js).
const TALSAET_GRUPPER = ['indtaegter', 'udgifter']

// Postens danske navn til fejlteksten. Kender kontoplanen ikke nøglen, nævnes den
// som den står i talsættet — så brugeren kan finde den igen i JSON-filen.
const postNavn = (gruppe, noegle) => findPost(gruppe, noegle)?.label ?? `${gruppe}.${noegle}`

// De tre tjek. Hver giver en tom streng når feltet er i orden, ellers begrundelsen.
// Et uoplyst felt er altid i orden: et tomt beløb er 0, og en tom dato er en
// oplysning der mangler — den udfyldes, den afvises ikke (ADR-0002).
const tjekTal = (v, navn) => (uoplyst(v) || erTal(v)) ? '' : `${navn} er ikke et tal: “${v}”`
const tjekDato = (v, navn) =>
  (uoplyst(v) || erDato(v)) ? '' : `${navn} er ikke en gyldig dato (ÅÅÅÅ-MM-DD): “${v}”`
const tjekPct = (v, navn) => {
  const fejl = tjekTal(v, navn)
  if (fejl || uoplyst(v)) return fejl
  const n = Number(v)
  return (n < 0 || n > 100) ? `${navn} skal være mellem 0 og 100 %: “${v}”` : ''
}
// Et årstal må gerne komme som tekst (fx en query-parameter), men skal være et helt
// år i en tænkelig størrelsesorden — samme grænser som maaAarOprettes bruger.
const tjekAarstal = (v, navn) => {
  if (uoplyst(v)) return ''
  const n = Number(v)
  return (!erTal(v) || !Number.isInteger(n) || n < 1900 || n > 2200)
    ? `${navn} er ikke et gyldigt årstal: “${v}”` : ''
}

// Svaret på en række tjek: den første begrundelse der ikke er tom — ellers `ja`.
// Ét svar ad gangen: brugeren retter én ting og skriver igen, og fejlteksten kan
// pege præcist på den.
const svarPaa = (...begrundelser) => {
  const f = begrundelser.find(b => b)
  return f ? nej(f) : ja
}

// De hjemløse poster i et GEMT talsæt: nøgler kontoplanen ikke kender, på postens
// egen id-form ("gruppe.nøgle"). Det er dem en ny skrivning må bære med sig.
export function hjemloeseNoegler(saet) {
  const ud = new Set()
  for (const gruppe of TALSAET_GRUPPER) {
    for (const noegle of Object.keys(saet?.[gruppe] ?? {})) {
      if (!erKendtPost(gruppe, noegle)) ud.add(`${gruppe}.${noegle}`)
    }
  }
  return ud
}

// Ét talsæt (ét grundlag i ét år). `grundlag` er 'budget' eller 'faktisk' og bruges
// kun til at sige hvilket af årets to talsæt fejlen står i.
//
// `kendteHjemloese` er de hjemløse poster der ALLEREDE står gemt på året. De slipper
// igennem, så et år med en legacy-nøgle fortsat kan gemmes (ADR-0001) — mens en post
// kontoplanen ikke kender, og som ingen har gemt før, afvises.
export function validerTalsaet(saet, grundlag, kendteHjemloese = new Set()) {
  const hvor = grundlag === 'faktisk' ? 'Faktisk (selvangivelse)' : 'Budget (forskud)'
  const med = (b) => b ? `${hvor}: ${b}` : ''
  if (!erObjekt(saet)) return nej(med(`talsættet har ikke domænets form: “${saet}”`))
  for (const gruppe of TALSAET_GRUPPER) {
    for (const [noegle, v] of Object.entries(saet?.[gruppe] ?? {})) {
      const id = `${gruppe}.${noegle}`
      if (!erKendtPost(gruppe, noegle) && !kendteHjemloese.has(id))
        return nej(med(`“${id}” findes ikke i kontoplanen`))
      const fejl = tjekTal(v, `beløbet for ${postNavn(gruppe, noegle)}`)
      if (fejl) return nej(med(fejl))
    }
  }
  for (const [laanId, v] of Object.entries(saet?.renteudgifter ?? {})) {
    const fejl = tjekTal(v, `renteudgiften på lån ${laanId}`)
    if (fejl) return nej(med(fejl))
  }
  return svarPaa(
    med(tjekDato(saet?.fra_dato, 'udlejningsperiodens fra-dato')),
    med(tjekDato(saet?.til_dato, 'udlejningsperiodens til-dato')),
    med(tjekTal(saet?.forbedringer, 'forbedringer')),
    med(tjekPct(saet?.udlejet_andel_pct, 'den udlejede andel')),
  )
}

// Andelene i en fordeling — { personId: pct } — som ejendommens ejerandele og lånets
// hæftelse. Summen tjekkes IKKE: at to andele ikke giver 100 % er en oplysning
// brugerfladen viser undervejs, ikke noget der skal spærre for at gemme en halvfærdig
// indtastning. En enkelt andel uden for 0–100 % er derimod utvetydigt forkert.
function tjekAndele(andele, navn) {
  for (const [pid, v] of Object.entries(andele ?? {})) {
    const fejl = tjekPct(v, `${navn} for person ${pid}`)
    if (fejl) return fejl
  }
  return ''
}

// Ejendommen (PUT /api/property). `null` rydder ejendommen og er derfor gyldigt.
export function validerEjendom(ejendom) {
  if (ejendom === null || ejendom === undefined) return ja
  if (!erObjekt(ejendom)) return nej(tjekObjekt(ejendom, 'ejendommen'))
  return svarPaa(
    tjekDato(ejendom.koebsdato, 'købsdatoen'),
    tjekTal(ejendom.anskaffelsessum, 'anskaffelsessummen'),
    tjekTal(ejendom.forbedringer_foer_udlejning, 'forbedringer før udlejning'),
    tjekTal(ejendom.grundskyld_aarlig, 'grundskylden pr. år'),
    tjekAndele(ejendom.ejerandele, 'ejerandelen'),
  )
}

// Lånet (POST og PUT /api/loans). Renten bindes ikke til 0–100: en rentesats er ikke
// en andel af noget, og negative satser har været en realitet. Restgælden har en
// peildato — den er en saldo målt på en dag, ikke stamdata (CONTEXT.md) — og en
// peildato der ikke er en dato gør saldoen umulig at datere.
export function validerLaan(laan) {
  if (laan === null || laan === undefined) return ja
  if (!erObjekt(laan)) return nej(tjekObjekt(laan, 'lånet'))
  return svarPaa(
    tjekTal(laan.hovedstol, 'hovedstolen'),
    tjekTal(laan.restgaeld, 'restgælden'),
    tjekDato(laan.restgaeld_dato, 'restgældens peildato'),
    tjekTal(laan.rente_pct, 'renten'),
    tjekAndele(laan.haeftelse, 'hæftelsen'),
  )
}

// Lejekontrakten (POST og PUT /api/leases). En tom slutdato er en ÅBEN kontrakt, ikke
// en manglende oplysning, og skal derfor slippe igennem. At slutdatoen ligger før
// startdatoen tjekkes ikke her: kontrakterne afgør hvilke år der kan oprettes
// (maaAarOprettes), og den regel bor ét sted.
export function validerLejekontrakt(lejekontrakt) {
  const k = lejekontrakt
  if (k === null || k === undefined) return ja
  if (!erObjekt(k)) return nej(tjekObjekt(k, 'lejekontrakten'))
  return svarPaa(
    tjekDato(k.startdato, 'lejekontraktens startdato'),
    tjekDato(k.slutdato, 'lejekontraktens slutdato'),
    tjekTal(k.maanedlig_leje, 'den månedlige leje'),
    tjekTal(k.markedsleje_maanedlig_skoen, 'markedslejen pr. måned'),
    tjekTal(k.forbrug_aconto?.vand, 'aconto vand'),
    tjekTal(k.forbrug_aconto?.varme, 'aconto varme'),
    tjekTal(k.depositum, 'depositummet'),
    tjekTal(k.forudbetalt_leje, 'den forudbetalte leje'),
  )
}

// Bilaget (POST og PUT /api/bilag). `gemtBilag` er bilaget som det står i databasen
// (fraværende ved oprettelse).
//
// Posten er en reference til kontoplanen, ikke en fri tekst (ADR-0005). Et bilag hvis
// gemte post kontoplanen ikke kender — en gammel kategoritekst der ikke kunne
// oversættes — bevares og vises markeret; det skal derfor stadig kunne gemmes. Samme
// skel som for de hjemløse poster: den gemte slipper igennem, en ny gør ikke.
// `post_id: null` er lovligt: det er præcis det en uoversættelig kategori efterlader.
export function validerBilag(bilag, gemtBilag) {
  if (bilag === null || bilag === undefined) return ja
  if (!erObjekt(bilag)) return nej(tjekObjekt(bilag, 'bilaget'))
  const post = bilag.post_id
  if (!uoplyst(post) && !findPostId(post) && post !== gemtBilag?.post_id)
    return nej(`bilagets post “${post}” findes ikke i kontoplanen`)
  return svarPaa(
    tjekAarstal(bilag.aar, 'bilagets år'),
    tjekDato(bilag.dato, 'bilagets dato'),
    tjekTal(bilag.beloeb, 'bilagets beløb'),
  )
}

// Indstillinger (PUT /api/settings). Kun de tal der bæres — valgene (skatteordning,
// fordeling) har hver sin sikre default i beregningslaget og røres ikke her.
export function validerIndstillinger(settings) {
  if (settings === null || settings === undefined) return ja
  if (!erObjekt(settings)) return nej(tjekObjekt(settings, 'indstillingerne'))
  return svarPaa(
    tjekAarstal(settings.feltmapping_aar, 'feltmapping-året'),
    tjekTal(settings.gaveafgift_bundgraense, 'gaveafgiftens bundgrænse'),
    tjekPct(settings.markedsleje_advarsel_pct, 'markedsleje-advarslen'),
    tjekTal(settings.beskattet_person_id, 'id på den beskattede ægtefælle'),
  )
}

// Feltmappingen (PUT /api/field-mappings). Overrides slås op på nøglen
// "<år>-<doktype>" (hentFeltmapping), så et årstal der ikke er et årstal gemmer en
// override der aldrig findes igen — den står i filen, men er usynlig i skemaet.
//
// Selve feltnumrene tjekkes bevidst IKKE: de er fri tekst, fordi det er brugeren der
// verificerer dem mod skat.dk, og hvor de kommer fra har sin egen ticket. Her sikres
// kun at kortet kan slås op i, og at hver nøgle bærer en liste af rækker.
export function validerFeltmappinger(mappinger) {
  if (mappinger === null || mappinger === undefined) return ja
  if (!erObjekt(mappinger)) return nej(tjekObjekt(mappinger, 'feltmappingen'))
  for (const [noegle, raekker] of Object.entries(mappinger)) {
    const fejl = tjekAarstal(String(noegle).split('-')[0], `året i feltmappingens nøgle “${noegle}”`)
    if (fejl) return nej(fejl)
    if (!Array.isArray(raekker)) return nej(`feltmappingen for “${noegle}” er ikke en liste af rækker`)
  }
  return ja
}

// Et helt år, som det skrives på POST og PUT /api/years. `gemtAar` er året som det
// står i databasen (fraværende ved oprettelse) og er det eneste sted de hjemløse
// poster kan komme fra: kun en post der ALLEREDE er gemt på året slipper igennem.
//
// Tolerancen er årets, ikke det enkelte grundlags. "Kopiér fra budget" flytter
// budgettets tal over i de faktiske, og en hjemløs post i budgettet ville ellers være
// ny i `faktisk` og spærre for at året kunne gemmes.
//
// Årstallet tjekkes kun som årstal. Om året MÅ oprettes er en anden regel, som bor i
// maaAarOprettes og kun stilles ved oprettelsen: et eksisterende år kan blive et
// hul-år, hvis lejekontrakten rettes bagefter, og de tal skal stadig kunne gemmes.
export function validerAar(body, gemtAar) {
  if (body === null || body === undefined) return ja
  if (!erObjekt(body)) return nej(tjekObjekt(body, 'året'))
  const kendte = new Set([
    ...hjemloeseNoegler(gemtAar?.budget),
    ...hjemloeseNoegler(gemtAar?.faktisk),
  ])
  const fejl = tjekAarstal(body?.aar, 'året')
  if (fejl) return nej(fejl)
  for (const grundlag of ['budget', 'faktisk']) {
    if (body?.[grundlag] === undefined) continue
    const svar = validerTalsaet(body[grundlag], grundlag, kendte)
    if (!svar.ok) return svar
  }
  return ja
}
