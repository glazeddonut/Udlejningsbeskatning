// ── skat.dk-feltmapping (rolle-afhængig) ───────────────────────────────────────
//
// ⚠️ HØJESTE RISIKOPUNKT. Feltnumrene er et BEDSTE BUD baseret på observation
// (Reportability) og skal VERIFICERES mod skat.dk / Den juridiske vejledning for
// det relevante år. Alle poster er markeret `usikker: true` og kan rettes i
// Indstillinger (gemmes i DB og vinder over disse defaults).
//
// Gælder ALMINDELIGE REGLER. Udlejning er selvstændig erhvervsvirksomhed, så
// resultatet indberettes i virksomhedsrubrikker (71/111-112/117), og renter kan
// placeres i virksomheden eller flyttes mellem ægtefæller.
//
// Hver post har en `rolle`:
//   'begge'          → vises for begge ægtefæller
//   'beskattet'      → kun den ægtefælle der beskattes af resultatet
//   'ikke_beskattet' → kun den anden ægtefælle (kun relevant ved 'alt på den ene')
//
// "kilde" evalueres pr. person i evalKilde nedenfor.

import { udlejningsdage, udlejningsdage360, manglerPeriode } from './beregning.js'

// `naar`: 'overskud' vises kun når personens resultat ≥ 0; 'underskud' kun når < 0.
// (Verificeret mod skat.dk juli 2026: forskud 221/435, 481, 699; oplysningsskema 111/112, 117, 42, 699.)
// 748 (forskud) og 207 (årsopgørelse) verificeret aug 2026 ved direkte observation i TastSelv.
// Begge bærer fodnoten "kalendermåned = 30 dage, indkomstår = 360 dage" → udlejningsdage360.
// Se docs/research/skat-felt-71-og-beskatningsform.md (m. rettelse) og CLAUDE.md's tre faldgruber.
export const DEFAULT_FELTMAPPING = {
  2026: {
    // Forskudsopgørelse (fremadrettet) → budget-talsættet.
    forskud: [
      { felt_nr: '221', label: 'Overskud af virksomhed/udlejning før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'overskud', usikker: false },
      { felt_nr: '435', label: 'Underskud af virksomhed/udlejning før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'underskud', usikker: false },
      { felt_nr: '481', label: 'Renteudgifter til banker m.v. reduceres med', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', note: 'Bankrenterne er auto-indberettet i felt 481 — reducér med dette beløb, da det flyttes til virksomheden (felt 488)', usikker: false },
      { felt_nr: '488', label: 'Renteudgifter i virksomhed', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', usikker: false },
      { felt_nr: '481', label: 'Renteudgifter til banker m.v. reduceres med (flyttes til ægtefælle)', kilde: 'renter_flyt', enhed: 'kr', rolle: 'ikke_beskattet', note: 'Reducér felt 481 med det beløb der flyttes til ægtefællen', usikker: false },
      { felt_nr: '748', label: 'Erhvervsmæssig andel uden vurderingsfordeling, anfør antal dage', kilde: 'udlejningsdage360', enhed: 'dage', rolle: 'begge', note: 'Skemaets egen konvention: 30 dage pr. måned, 360 dage pr. år (helt år = 360, ikke 365). Faktiske kalenderdage vises i Årets tal.', usikker: false },
      { felt_nr: '744', label: 'Erhvervsmæssig andel (udlejet andel)', kilde: 'udlejet_andel_pct', enhed: '%', rolle: 'begge', usikker: false },
      { felt_nr: '699', label: 'Udlejning til nærtstående', kilde: 'naertstaaende', enhed: '', rolle: 'begge', usikker: false },
    ],
    // Selvangivelse / oplysningsskema (bagudrettet) → faktisk-talsættet.
    selvangivelse: [
      // Dine oplysninger (renter)
      { felt_nr: '42', label: 'Renteudgifter til banker m.v. (flyttes til virksomhed)', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', usikker: false },
      { felt_nr: '42', label: 'Renteudgifter til banker m.v. (flyttes til ægtefælle)', kilde: 'renter_flyt', enhed: 'kr', rolle: 'ikke_beskattet', note: 'Flyt beløbet der vedrører boligen til ægtefællen', usikker: false },
      // Danske ejendomme
      { felt_nr: '207', label: 'Flerårig erhvervsmæssig udlejning, anfør antal dage', kilde: 'udlejningsdage360', enhed: 'dage', rolle: 'begge', note: 'Skemaets egen konvention: 30 dage pr. måned, 360 dage pr. år (helt år = 360, ikke 365). Faktiske kalenderdage vises i Årets tal.', usikker: false },
      { felt_nr: '699', label: 'Udlejning til nærtstående', kilde: 'naertstaaende', enhed: '', rolle: 'begge', usikker: false },
      // Virksomhedsoplysninger
      // BEMÆRK: her stod tidligere rubrik 71 "Vælg virksomhedens aktivitet". Den post var forkert
      // og er fjernet: rubrik 71 hedder "Er du ophørt med selvstændig virksomhed?" — et hak dér
      // afmelder virksomheden (nulstiller ligningsart, felt 134). Der findes intet felt hvor man
      // vælger virksomhedens aktivitet; at udlejningen er erhvervsmæssig kommer i stedet til udtryk
      // ved at resultatet oplyses i rubrik 111/112. Genindsæt den ikke.
      { felt_nr: '111', label: 'Overskud af virksomhed før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'overskud', usikker: false },
      { felt_nr: '112', label: 'Underskud af virksomhed før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'underskud', usikker: false },
      { felt_nr: '117', label: 'Renteudgifter i virksomhed', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', usikker: false },
      // BEMÆRK: her stod tidligere en "Vælg beskatningsform"-post (og kortvarigt rubrik 141/147).
      // Den er fjernet: der findes intet felt hvor man vælger de almindelige regler. VSO og
      // kapitalafkastordningen TIL-vælges i rubrik 141/147 (begge → felt 184, Virksomhedskode);
      // lader man dem stå tomme, beskattes der efter personskattelovens regler, hvilket er det
      // rigtige her. Rubrikkerne findes kun på papirblanket 04.003 og dukker ikke op i TastSelv
      // når man ikke bruger ordningerne — derfor er de ikke en indtastningspost. Genindsæt dem ikke.
      // Regnskabsoplysninger
      { felt_nr: '300', label: 'CVR/SE-nummer (CPR hvis privat uden CVR)', kilde: 'cpr', enhed: '', rolle: 'begge', usikker: false },
      { felt_nr: '638', label: 'Skyldig eller tilgodehavende moms', kilde: 'moms_nul', enhed: 'kr', rolle: 'begge', usikker: false },
      { felt_nr: '301/302', label: 'Fritaget for regnskabsoplysninger (efter virksomhedstype)', kilde: 'regnskabsfritagelse', enhed: '', rolle: 'begge', usikker: false },
    ],
  },
}

// Hent feltmapping for et år + doktype. Rækkefølge: overrides → default for året →
// nærmeste tidligere definerede år → ellers ældste definerede år (fallback opad).
export function hentFeltmapping(aar, doktype, overrides = {}) {
  const key = `${aar}-${doktype}`
  if (overrides[key]?.length) return overrides[key]
  if (DEFAULT_FELTMAPPING[aar]?.[doktype]) return DEFAULT_FELTMAPPING[aar][doktype]
  const aarKeys = Object.keys(DEFAULT_FELTMAPPING).map(Number).sort((a, b) => a - b)
  const tidligere = aarKeys.filter(y => y <= aar).sort((a, b) => b - a)
  const kandidat = tidligere[0] ?? aarKeys[0]   // foretræk ≤ aar, ellers ældste definerede
  return (kandidat != null && DEFAULT_FELTMAPPING[kandidat]?.[doktype]) || []
}

// Personens rolle i feltmappingen: den beskattede får 'beskattet'-felter, den anden
// (kun ved 'alt på den ene') får 'ikke_beskattet'. Ved 'del' er begge 'beskattet'.
export function feltRolle(personOpg, fordeling) {
  if (fordeling?.mode === 'alt_paa_en' && !personOpg.erBeskattet) return 'ikke_beskattet'
  return 'beskattet'
}

// Filtrér felter til en persons rolle og resultatets fortegn.
// erOverskud: personens resultat ≥ 0 → vis 'overskud'-felter, ellers 'underskud'-felter.
export function felterForRolle(felter, rolle, erOverskud = true) {
  return felter.filter(f => {
    if (!(f.rolle === 'begge' || f.rolle === rolle)) return false
    if (f.naar === 'overskud' && !erOverskud) return false
    if (f.naar === 'underskud' && erOverskud) return false
    return true
  })
}

// Evaluér en kilde til en visningsværdi for en given person + talsæt.
export function evalKilde(kilde, { personOpg, saet, person }) {
  switch (kilde) {
    case 'resultat': return Math.round(personOpg?.resultatAndel || 0)
    case 'renter_beskattet': return Math.round(personOpg?.renter || 0)
    case 'renter_flyt': return Math.round(personOpg?.renterFysisk || 0)
    // Uden udlejningsperiode findes der ingen værdi at indberette (ADR-0002). null
    // betyder "ingen værdi" og adskiller sig fra 0, som ville være et tal brugeren
    // kunne komme til at taste ind i felt 748 / rubrik 207. Fladen skriver flaget.
    case 'udlejningsdage': return manglerPeriode(saet) ? null : udlejningsdage(saet)
    case 'udlejningsdage360': return manglerPeriode(saet) ? null : udlejningsdage360(saet)
    case 'udlejet_andel_pct': return Math.round(Number(saet?.udlejet_andel_pct) || 0)
    case 'naertstaaende': return saet?.naertstaaende ? 'Ja' : 'Nej'
    case 'cpr': return person?.cpr || '(indtast CVR/SE eller CPR)'
    case 'moms_nul': return 0
    case 'regnskabsfritagelse': return 'Ja, fritaget efter virksomhedstype'
    default: return ''
  }
}
