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
// Bemærk at opstillingen endnu ikke rummer AFSTEMNINGEN — bilagssummen pr. post
// holdt op mod det indtastede årsbeløb (CONTEXT.md, ADR-0005). Den forudsætter, at
// bilaget peger på en post i kontoplanen i stedet for at bære en fri kategoritekst,
// og bygges derfor sammen med den ændring. Her leveres bilagsOVERSIGTEN.

import { normaliserSaet } from './saet.js'
import { bilagForAar } from './bilag.js'
import { kr, kr2 } from './format.js'
import {
  gruppeOpgoerelse, resultatFoerRenter, sumRenter,
  personOpgoerelse, resolveFordeling,
  udlejningsdage, udlejningsdage360, prorataMaaneder,
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

const BILAGSKOLONNER = Object.freeze([
  Object.freeze({ id: 'nummer', label: 'Nr.' }),
  Object.freeze({ id: 'dato', label: 'Dato' }),
  Object.freeze({ id: 'tekst', label: 'Tekst' }),
  Object.freeze({ id: 'kategori', label: 'Kategori' }),
  Object.freeze({ id: 'beloeb', label: 'Beløb', num: true }),
])

// Én række i en sektion. `sum` markerer totalrækken, `hjemloes` en post kontoplanen
// ikke kender (ADR-0001), `prorata` at beløbet er ganget op fra et månedsbeløb.
const raekke = (id, label, beloeb, { sum = false, hjemloes = false, prorata = false } = {}) =>
  ({ id, label, beloeb, vaerdi: kr(beloeb), sum, hjemloes, prorata })

// Rækkerne for én af kontoplanens grupper. Poster uden beløb udelades — de fylder
// kun regnskabet. Hjemløse poster vises altid, også med nul: nøglen er selv den
// oplysning brugeren skal se.
function gruppeRaekker(opg) {
  return [
    ...opg.poster.filter(p => p.beloeb !== 0)
      .map(p => raekke(p.id, p.label, p.beloeb, { prorata: p.prorata })),
    ...opg.hjemloese
      .map(p => raekke(p.id, `${p.noegle} (hjemløs post)`, p.beloeb, { hjemloes: true, prorata: p.prorata })),
  ]
}

function byggOpstilling({ aar, grundlag, saet, dagstal, sum, personer, aaretsBilag, property, persons, indt, udg }) {
  const ejendom = `${property?.navn || 'Ejendom'}${property?.adresse ? ', ' + property.adresse : ''}`
  const ejere = 'Ejere: ' + (persons || []).map(p => `${p.navn} (${property?.ejerandele?.[p.id] ?? 0} %)`).join(' · ')
  const meta = `Grundlag: ${grundlag === 'faktisk' ? 'faktiske tal' : 'budget'}`
    + ` · Udlejet til nærtstående: ${saet.naertstaaende ? 'ja' : 'nej'}`
    + ` · ${dagstal.udlejningsdage} udlejningsdage`

  const sektioner = [
    {
      id: 'indtaegter',
      titel: 'Indtægter',
      raekker: [...gruppeRaekker(indt), raekke('indtaegter.sum', 'Indtægter i alt', indt.sum, { sum: true })],
    },
    {
      id: 'udgifter',
      titel: 'Fradragsberettigede udgifter',
      raekker: [...gruppeRaekker(udg), raekke('udgifter.sum', 'Udgifter i alt', udg.sum, { sum: true })],
    },
    {
      id: 'resultat',
      titel: 'Resultat',
      raekker: [raekke('resultat.udlejningsresultat', 'Udlejningsresultat før renter', sum.udlejningsresultat, { sum: true })],
    },
    {
      id: 'fordeling',
      titel: 'Fordeling pr. ejer',
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
          kategori: b.kategori || '',
          beloeb: (b.type === 'indtaegt' ? '' : '-') + kr2(b.beloeb),
        },
      })),
    },
    note: REGNSKABSNOTE,
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
  const periode = {
    fra_dato: saet.fra_dato,
    til_dato: saet.til_dato,
    mangler: !saet.fra_dato || !saet.til_dato,
  }

  const grundlagFraKontrakt = aarsgrundlag(leases, year.aar)
  const fordeling = resolveFordeling(settings, persons)
  const personer = personOpgoerelse(saet, { persons, property, loans, fordeling })
  const aaretsBilag = bilagForAar(bilag, year.aar)

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
    periodeafvigelse: periodeAfvigelse(saet, grundlagFraKontrakt),
    fordeling,
    personer,
    sum,
    bilag: aaretsBilag,
    opstilling: byggOpstilling({ aar: year.aar, grundlag, saet, dagstal, sum, personer, aaretsBilag, property, persons, indt, udg }),
  }
}
