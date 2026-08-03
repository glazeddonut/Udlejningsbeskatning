// ── Årsopgørelsen: én indgang fra db-data til domænedata ──────────────────────
//
// Rå db-former ind — år, lejekontrakter, personer, ejendom, lån, indstillinger,
// bilag — domæneformede data ud: opstillingen, personopgørelsen, dagstallene og
// periodeflagene. Talsættet normaliseres ÉN gang, her.
//
// Baggrunden er ADR-0004: alle beregninger forudsatte et normaliseret talsæt, men
// hver kalder skulle selv huske det, og PDF-generatoren huskede det ikke — den
// arvede et normaliseret talsæt fra skærmkomponenten. Invarianten var ren konvention
// på tværs af et seam. Nu er der ét sted at gå ind, og ingen af fladerne normaliserer
// selv.
//
// NB om navnet: "opgørelse" bruges her i regnskabsmæssig forstand, som i
// gruppeOpgoerelse og personOpgoerelse. Det er IKKE skat.dk's årsopgørelse — den
// hører til i feltmapping.js, hvor forskudsopgørelse og selvangivelse holdes skarpt
// adskilt.
//
// ── Opstillingen ──
// Årsregnskabet som ren data: hoved, sektioner med rækker, bilagsoversigt og note,
// uden viden om hverken React eller pdf-lib. Skærmen renderer den som tabel, PDF'en
// som PDF. Den eneste tilladte forskel er de vedhæftede bilagsfiler, som kun kan
// være i PDF'en. Rækkerne bærer derfor både `beloeb` (tallet, til test og videre
// regning) og `vaerdi` (den færdige danske tekst begge flader skriver), så de to
// ikke kan formatere det samme tal forskelligt.
//
// Opstillingen rummer to forskellige ting om bilagene, og de må ikke forveksles:
// bilagsOVERSIGTEN er listen over årets bilag, mens AFSTEMNINGEN er bilagssummen pr.
// post holdt op mod det indtastede årsbeløb for samme post (CONTEXT.md, ADR-0005).
// Afstemningen gælder kun grundlaget FAKTISK — bilag dokumenterer det der er sket,
// ikke det der er budgetteret — og er derfor `null` ved budget.

import { normaliserSaet } from './saet.js'
import { bilagForAar, bilagPost, bilagssummer, migrerBilag } from './bilag.js'
import { KONTOPLAN } from './kontoplan.js'
import { kr, kr2, oere, pct } from './format.js'
import {
  gruppeOpgoerelse, resultatFoerRenter, sumRenter,
  personOpgoerelse, resolveFordeling,
  udlejningsdage, udlejningsdage360, prorataMaaneder, manglerPeriode,
  aarsgrundlag, periodeAfvigelse,
} from './beregning.js'

// Noten står ét sted. Den fulgte tidligere med i to ordrette kopier — én i
// skærmkomponenten og én i PDF-generatoren — og var dermed to tekster der kunne
// drive fra hinanden.
export const REGNSKABSNOTE =
  'Regnskabet er udarbejdet efter de almindelige skatteregler for udlejning til nærtstående ' +
  '(forældrekøb). Renteudgifter er personlige (kapitalindkomst) og indgår ikke i ' +
  'udlejningsresultatet. Forbedringsudgifter er ikke fradragsberettigede. ' +
  'Beløb er baseret på de indtastede tal og skal verificeres mod bilag og skat.dk.'

// En KVITTERET periodeafvigelse hører hjemme i noten. Regnskabet indberetter et dagstal
// (felt 748 / rubrik 207) der ikke stemmer med lejekontrakten, og forklaringen på det
// skal stå samme sted som tallet — over for SKAT er en uforklaret forskel netop det der
// giver spørgsmål. En UKVITTERET afvigelse står derimod ikke her: den er stadig en
// advarsel i Årets tal, ikke en forklaring regnskabet kan stå inde for.
//
// Noten er én streng, så skærmen og PDF'en skriver den ordret ens. Datoerne skrives som
// ISO ligesom i Årets tal, og dagstallene med, fordi det er dem der indberettes.
const visDato = (d) => d || '—'
function periodenote(afvigelse) {
  if (!afvigelse?.kvitteret) return ''
  const { gemt, afledt, begrundelse } = afvigelse
  return ' Udlejningsperioden afviger bevidst fra lejekontrakten: '
    + `${visDato(gemt.fra_dato)} – ${visDato(gemt.til_dato)} mod lejekontraktens `
    + `${visDato(afledt.fra_dato)} – ${visDato(afledt.til_dato)} `
    + `(${gemt.dage360} mod ${afledt.dage360} dage til skat.dk). Begrundelse: ${begrundelse}`
}

const BILAGSKOLONNER = Object.freeze([
  Object.freeze({ id: 'nummer', label: 'Nr.' }),
  Object.freeze({ id: 'dato', label: 'Dato' }),
  Object.freeze({ id: 'tekst', label: 'Tekst' }),
  Object.freeze({ id: 'post', label: 'Post' }),
  Object.freeze({ id: 'beloeb', label: 'Beløb', num: true }),
])

// Én række i en sektion. `sum` markerer totalrækken, `hjemloes` en post kontoplanen
// ikke kender (ADR-0001), `prorata` at beløbet er ganget op fra et månedsbeløb, og
// `andel` at beløbet er skrevet ned med den udlejede andel (ADR-0003).
const raekke = (id, label, beloeb, { sum = false, hjemloes = false, prorata = false, andel = false, beloebFoerAndel = beloeb } = {}) =>
  ({ id, label, beloeb, beloebFoerAndel, vaerdi: kr(beloeb), sum, hjemloes, prorata, andel })

// Rækkens navn når den udlejede andel har skrevet beløbet ned. Forklaringen står i
// LABELLEN og ikke i en ekstra kolonne, fordi labellen er den ene kanal både skærmen og
// PDF'en skriver — de to kan derfor ikke komme til at forklare det samme tal hver sin
// måde. Uden nedskrivning er navnet kontoplanens label, ordret som før.
const andelsLabel = (linje, andelPct) =>
  `${linje.label} — ${pct(andelPct)} af ${kr(linje.beloebFoerAndel)}`

// Rækkerne for én af kontoplanens grupper. Poster uden beløb udelades — de fylder
// kun regnskabet. Hjemløse poster vises altid, også med nul: nøglen er selv den
// oplysning brugeren skal se.
//
// En ejendomspost der er skrevet HELT ned (0 % udlejet) beholder derimod sin række.
// Filteret spørger derfor til det AFHOLDTE beløb, ikke til fradraget: et fradrag der
// forsvinder sporløst er præcis den black box andelen ikke må være. Ved fuld udlejning
// er de to tal ens, og filteret opfører sig præcis som før.
function gruppeRaekker(opg) {
  return [
    ...opg.poster.filter(p => p.beloebFoerAndel !== 0)
      .map(p => raekke(p.id, p.andel ? andelsLabel(p, opg.andelPct) : p.label, p.beloeb,
        { prorata: p.prorata, andel: p.andel, beloebFoerAndel: p.beloebFoerAndel })),
    ...opg.hjemloese
      .map(p => raekke(p.id, `${p.noegle} (hjemløs post)`, p.beloeb, { hjemloes: true, prorata: p.prorata })),
  ]
}

// Udgiftssektionens forklaring: hvilke poster andelen rammer, sagt med posternes egne
// navne. Uden den ville en bruger se to nedskrevne tal uden at kunne se hvorfor netop
// de to. Tom ved fuld udlejning — der er intet at forklare, og regnskabet skal være
// ordret som før. Hvilke poster der er ramt, spørges der ikke om her: linjen bærer selv
// svaret (`andel`), så forklaringen ikke kan komme til at nævne andre poster end dem
// rækkerne rent faktisk har skrevet ned.
function andelsForklaring(udg) {
  const ramte = udg.poster.filter(p => p.andel).map(p => p.label)
  if (!ramte.length) return ''
  return `Den udlejede andel er ${pct(udg.andelPct)}. Ejendomsposter vedrører hele ejendommen og er `
    + `kun fradragsberettigede med den andel: ${ramte.join(', ')}. `
    + 'Øvrige udgifter vedrører udelukkende det udlejede og indgår fuldt ud.'
}

const AFSTEMNINGSKOLONNER = Object.freeze([
  Object.freeze({ id: 'post', label: 'Post' }),
  Object.freeze({ id: 'indtastet', label: 'Indtastet', num: true }),
  Object.freeze({ id: 'bilagssum', label: 'Bilag', num: true }),
  Object.freeze({ id: 'difference', label: 'Difference', num: true }),
  Object.freeze({ id: 'status', label: 'Afstemning' }),
])

const AFSTEMNINGSFORKLARING =
  'Kun poster med mindst ét bilag afstemmes. En post uden bilag er ikke en fejl — '
  + 'fx prefilles grundskyld fra stamdata, og husleje tastes som månedsbeløb med pro rata.'

// Afstemningen: bilagssummen pr. post holdt op mod det indtastede årsbeløb for samme
// post (CONTEXT.md, ADR-0005). Den bor i opstillingen, så skærmen og PDF'en viser den
// samme afstemning — den er en del af regnskabet, ikke en visning oven på det.
//
// Kun poster der HAR mindst ét bilag afstemmes. En post uden bilag får sin række, men
// neutralt: "ingen bilag" er ikke en fejl (ADR-0005). Alternativet ville lyse rødt på
// næsten alt, og en advarsel der altid lyser, læres der at ignorere.
//
// Det indtastede beløb er det EFFEKTIVE årsbeløb — efter pro rata, ikke det rå
// månedsbeløb. For de summerbare poster tages tallet direkte fra gruppeopgørelserne, så
// rækken her og rækken i indtægts-/udgiftssektionen bygger på samme optælling.
//
// Men det er beløbet FØR den udlejede andel. Andelen er en fradragsbegrænsning, ikke et
// andet betalt beløb: bilaget dokumenterer hvad der ER afholdt, og afstemningen er en
// kontrol af indtastningen mod bilagene (ADR-0005). Afstemtes der mod det nedskrevne
// fradrag, ville hver eneste ejendomspost lyse "difference" for evigt ved delvis
// udlejning — og en advarsel der altid lyser, lærer man at ignorere. Ved fuld udlejning
// er de to tal ens, så afstemningen er uændret for de faktiske data.
//
// De to ikke-summerbare poster er med: et bilag skal kunne dokumentere alt hvad der er
// betalt. Deres beløb ligger på GRUPPEniveau i talsættet (`saet.forbedringer` er en
// skalar, `saet.renteudgifter` er nøglet på lånets id), så de hentes fra de allerede
// beregnede summer — `effektivBeloeb` ville svare 0 på dem (se kontoplan.js). De slås
// op på postens id og ikke på gruppen: får en af de to grupper nogensinde en post mere,
// giver opslaget 0 i stedet for tavst at vise hele gruppesummen på hver eneste række.
//
// Hjemløse poster afstemmes ikke: et bilag kan kun pege på en post kontoplanen kender,
// så en hjemløs post kan pr. konstruktion ikke have bilag. Modstykket — et bilag hvis
// post kontoplanen ikke kender — vises som sin egen markerede række nederst.
function byggAfstemning({ sum, aaretsBilag, indt, udg }) {
  const titel = 'Afstemning mod bilag'
  if (aaretsBilag.length === 0) {
    return {
      titel,
      forklaring: AFSTEMNINGSFORKLARING,
      kolonner: AFSTEMNINGSKOLONNER,
      raekker: [],
      tom_tekst: 'Ingen bilag registreret — der er intet at afstemme.',
    }
  }

  const { perPost, ukendte } = bilagssummer(aaretsBilag)
  const indtastet = new Map([
    ...[...indt.poster, ...udg.poster].map(l => [l.id, l.beloebFoerAndel]),
    ['renteudgifter.renteudgifter', sum.renter],
    ['forbedringer.forbedringer', sum.forbedringer],
  ])

  const raekker = []
  for (const post of KONTOPLAN) {
    const bs = perPost[post.id]
    const tastet = indtastet.get(post.id) ?? 0
    if (!bs && !tastet) continue           // hverken tal eller bilag — intet at vise
    const difference = bs ? oere(bs.sum - tastet) : null
    const status = !bs ? 'ingen_bilag' : (difference === 0 ? 'stemmer' : 'difference')
    raekker.push({
      id: post.id,
      post_id: post.id,
      label: post.label,
      antal: bs ? bs.antal : 0,
      indtastet: tastet,
      bilagssum: bs ? bs.sum : null,
      difference,
      status,
      celler: {
        post: post.label,
        indtastet: kr2(tastet),
        bilagssum: bs ? kr2(bs.sum) : '—',
        difference: bs ? `${difference > 0 ? '+' : ''}${kr2(difference)}` : '—',
        status: status === 'ingen_bilag' ? 'Ingen bilag' : status === 'stemmer' ? 'Stemmer' : 'Difference',
      },
    })
  }

  // Bilag med ukendt post kan ikke afstemmes mod nogen post. De vises samlet og
  // markeret — ligesom en hjemløs post i opstillingen — frem for at forsvinde tavst.
  //
  // Rækken bærer med vilje ANTALLET og ikke en sum. Uden en post er der ingen gruppe at
  // se fortegnet fra, og en sum måtte enten låne bilagsoversigtens fortegn — hvorved
  // samme kolonne ville bære to forskellige konventioner — eller lægge indtægter og
  // udgifter oven i hinanden, så to bilag på 1.200 kr. hver vej gav 0,00 kr. og dermed
  // så ud som om der intet var. Beløbene står bilag for bilag i bilagsoversigten.
  if (ukendte.antal > 0) {
    const label = `Bilag med ukendt post (${ukendte.antal})`
    raekker.push({
      id: 'afstemning.ukendte',
      post_id: null,
      label,
      antal: ukendte.antal,
      indtastet: null,
      bilagssum: null,
      difference: null,
      status: 'ukendt_post',
      celler: { post: label, indtastet: '—', bilagssum: '—', difference: '—', status: 'Kan ikke afstemmes' },
    })
  }

  return { titel, forklaring: AFSTEMNINGSFORKLARING, kolonner: AFSTEMNINGSKOLONNER, raekker, tom_tekst: '' }
}

function byggOpstilling({ aar, grundlag, saet, dagstal, periode, afvigelse, sum, personer, aaretsBilag, property, persons, indt, udg }) {
  const ejendom = `${property?.navn || 'Ejendom'}${property?.adresse ? ', ' + property.adresse : ''}`
  const ejere = 'Ejere: ' + (persons || []).map(p => `${p.navn} (${property?.ejerandele?.[p.id] ?? 0} %)`).join(' · ')
  // Uden udlejningsperiode skriver hovedet flaget frem for et tal (ADR-0002). "0
  // udlejningsdage" ville være et lige så tavst svar som det 360 vi lige har fjernet.
  // Andelen står i hovedet SAMMEN med de øvrige indberetningstal — det er den samme
  // andel der indberettes til skat.dk (felt 744) og regnes fradrag på (ADR-0003). Ved
  // fuld udlejning nævnes den ikke: der er ingen begrænsning at oplyse om, og hovedet
  // skal være ordret som før.
  const meta = `Grundlag: ${grundlag === 'faktisk' ? 'faktiske tal' : 'budget'}`
    + ` · Udlejet til nærtstående: ${saet.naertstaaende ? 'ja' : 'nej'}`
    + (periode.mangler ? ' · udlejningsperiode mangler' : ` · ${dagstal.udlejningsdage} udlejningsdage`)
    + (udg.andelPct === 100 ? '' : ` · Udlejet andel: ${pct(udg.andelPct)}`)

  const sektioner = [
    {
      id: 'indtaegter',
      titel: 'Indtægter',
      forklaring: '',
      raekker: [...gruppeRaekker(indt), raekke('indtaegter.sum', 'Indtægter i alt', indt.sum, { sum: true })],
    },
    {
      id: 'udgifter',
      titel: 'Fradragsberettigede udgifter',
      forklaring: andelsForklaring(udg),
      raekker: [...gruppeRaekker(udg), raekke('udgifter.sum', 'Udgifter i alt', udg.sum, { sum: true })],
    },
    {
      id: 'resultat',
      titel: 'Resultat',
      forklaring: '',
      raekker: [raekke('resultat.udlejningsresultat', 'Udlejningsresultat før renter', sum.udlejningsresultat, { sum: true })],
    },
    {
      id: 'fordeling',
      titel: 'Fordeling pr. ejer',
      forklaring: '',
      raekker: [
        ...personer.map(o => raekke(
          `fordeling.${o.personId}`,
          `${o.navn}${o.erBeskattet ? '' : ' (beskattes ikke)'} — resultat ${kr(o.resultatAndel)}, renter ${kr(o.renter)}`,
          o.nettoKapitalindkomst,
        )),
        raekke('fordeling.renter', 'Renteudgifter i alt (personlige, kapitalindkomst)', sum.renter, { sum: true }),
      ],
    },
  ]

  // Forbedringer er ikke fradrag — de tillægges anskaffelsessummen og står derfor
  // uden for udlejningsresultatet. Uden beløb er der intet at vise.
  if (sum.forbedringer > 0) {
    sektioner.push({
      id: 'forbedringer',
      titel: 'Forbedringer (ikke fradrag)',
      forklaring: '',
      raekker: [raekke('forbedringer', 'Forbedringer i året — tillægges anskaffelsessummen', sum.forbedringer)],
    })
  }

  return {
    hoved: {
      aar,
      overskrift: `Regnskab for udlejning · ${aar}`,
      linjer: [ejendom, ejere, meta],
    },
    sektioner,
    // Kun mod grundlaget FAKTISK: bilag dokumenterer det der er sket, ikke det der er
    // budgetteret. Ved budget er afstemningen fraværende, ikke tom — der er intet at
    // afstemme, og en tom tabel ville se ud som en manglende dokumentation.
    afstemning: grundlag === 'faktisk' ? byggAfstemning({ sum, aaretsBilag, indt, udg }) : null,
    bilagsoversigt: {
      titel: `Bilagsoversigt (${aaretsBilag.length})`,
      antal: aaretsBilag.length,
      tom_tekst: 'Ingen bilag registreret.',
      kolonner: BILAGSKOLONNER,
      raekker: aaretsBilag.map(b => ({
        id: b.id,
        nummer: b.nummer,
        beloeb: Number(b.beloeb) || 0,
        celler: {
          nummer: String(b.nummer),
          dato: b.dato || '',
          tekst: b.tekst || '',
          post: bilagPost(b).label,
          beloeb: (b.type === 'indtaegt' ? '' : '-') + kr2(b.beloeb),
        },
      })),
    },
    note: REGNSKABSNOTE + periodenote(afvigelse),
  }
}

// Alt hvad de visende flader har brug for om ét år i ét grundlag.
// Inddata er db-former, præcis som de ligger i udlejning-data.json.
// Returnerer null hvis året ikke findes — kalderen skal ikke gætte et årsregnskab.
export function aarsopgoerelse({ aar, grundlag = 'faktisk', years, leases, persons, property, loans, settings, bilag }) {
  const year = (years || []).find(y => Number(y.aar) === Number(aar))
  if (!year) return null

  // Normaliseringen — ét sted, én gang. Alt herunder arbejder på `saet`.
  const saet = normaliserSaet(year[grundlag])

  const dagstal = {
    udlejningsdage: udlejningsdage(saet),
    indberetningsdage: udlejningsdage360(saet),
    prorataMaaneder: prorataMaaneder(saet),
  }
  // Flaget stiller samme spørgsmål som dagstallene gør indeni, og stiller det ét sted:
  // svarer optællingerne 0 fordi perioden mangler, SKAL flaget være sat (ADR-0002).
  const periode = {
    fra_dato: saet.fra_dato,
    til_dato: saet.til_dato,
    mangler: manglerPeriode(saet),
  }

  const grundlagFraKontrakt = aarsgrundlag(leases, year.aar)
  const afvigelse = periodeAfvigelse(saet, grundlagFraKontrakt)
  const fordeling = resolveFordeling(settings, persons)
  const personer = personOpgoerelse(saet, { persons, property, loans, fordeling })
  // Bilagene migreres her, ikke kun i serverens loadDb. Indgangen lover db-formede
  // data ind (ADR-0004), og en DB fra disken kan stadig bære den gamle frie kategori.
  // Uden migreringen ville hvert af de bilag tavst blive til en "ukendt post" — et
  // svar der ser plausibelt ud, netop når oplysningen mangler. migrerBilag er
  // idempotent, så et allerede migreret bilag er uberørt.
  const aaretsBilag = bilagForAar(migrerBilag(bilag), year.aar)

  // Grupperne gøres op ét sted og genbruges til både totalerne og rækkerne, så de
  // to ikke kan komme til at bygge på hver sin optælling.
  const indt = gruppeOpgoerelse(saet, 'indtaegter')
  const udg = gruppeOpgoerelse(saet, 'udgifter')
  const sum = {
    indtaegter: indt.sum,
    udgifter: udg.sum,
    udlejningsresultat: resultatFoerRenter(saet),   // regnereglen bor i beregning.js
    renter: sumRenter(saet),
    forbedringer: Number(saet.forbedringer) || 0,
  }

  return {
    aar: year.aar,
    grundlag,
    saet,
    dagstal,
    periode,
    aarsgrundlag: grundlagFraKontrakt,
    periodeafvigelse: afvigelse,
    fordeling,
    personer,
    sum,
    bilag: aaretsBilag,
    opstilling: byggOpstilling({ aar: year.aar, grundlag, saet, dagstal, periode, afvigelse, sum, personer, aaretsBilag, property, persons, indt, udg }),
  }
}
