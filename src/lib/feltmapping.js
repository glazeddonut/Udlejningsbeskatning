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

import { udlejningsdage } from './beregning.js'

// `naar`: 'overskud' vises kun når personens resultat ≥ 0; 'underskud' kun når < 0.
// (Verificeret mod skat.dk juli 2026: forskud 221/435, 481, 699; oplysningsskema 111/112, 117, 42, 207, 699.)
export const DEFAULT_FELTMAPPING = {
  2026: {
    // Forskudsopgørelse (fremadrettet) → budget-talsættet.
    forskud: [
      { felt_nr: '221', label: 'Overskud af virksomhed/udlejning før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'overskud', usikker: false },
      { felt_nr: '435', label: 'Underskud af virksomhed/udlejning før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'underskud', usikker: false },
      { felt_nr: '481', label: 'Renteudgifter til banker m.v. reduceres med', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', note: 'Bankrenterne er auto-indberettet i felt 481 — reducér med dette beløb, da det flyttes til virksomheden (felt 488)', usikker: false },
      { felt_nr: '488', label: 'Renteudgifter i virksomhed', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', usikker: false },
      { felt_nr: '481', label: 'Renteudgifter til banker m.v. reduceres med (flyttes til ægtefælle)', kilde: 'renter_flyt', enhed: 'kr', rolle: 'ikke_beskattet', note: 'Reducér felt 481 med det beløb der flyttes til ægtefællen', usikker: false },
      { felt_nr: '748', label: 'Antal dage med udlejning', kilde: 'udlejningsdage', enhed: 'dage', rolle: 'begge', usikker: false },
      { felt_nr: '744', label: 'Erhvervsmæssig andel (udlejet andel)', kilde: 'udlejet_andel_pct', enhed: '%', rolle: 'begge', usikker: false },
      { felt_nr: '699', label: 'Udlejning til nærtstående', kilde: 'naertstaaende', enhed: '', rolle: 'begge', usikker: false },
    ],
    // Selvangivelse / oplysningsskema (bagudrettet) → faktisk-talsættet.
    selvangivelse: [
      // Dine oplysninger (renter)
      { felt_nr: '42', label: 'Renteudgifter til banker m.v. (flyttes til virksomhed)', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', usikker: false },
      { felt_nr: '42', label: 'Renteudgifter til banker m.v. (flyttes til ægtefælle)', kilde: 'renter_flyt', enhed: 'kr', rolle: 'ikke_beskattet', note: 'Flyt beløbet der vedrører boligen til ægtefællen', usikker: false },
      // Danske ejendomme
      { felt_nr: '207', label: 'Antal udlejningsdage', kilde: 'udlejningsdage', enhed: 'dage', rolle: 'begge', usikker: false },
      { felt_nr: '699', label: 'Udlejning til nærtstående', kilde: 'naertstaaende', enhed: '', rolle: 'begge', usikker: false },
      // Virksomhedsoplysninger
      { felt_nr: '71', label: 'Vælg virksomhedens aktivitet', kilde: 'virksomhedsaktivitet', enhed: '', rolle: 'begge', usikker: true },
      { felt_nr: '111', label: 'Overskud af virksomhed før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'overskud', usikker: false },
      { felt_nr: '112', label: 'Underskud af virksomhed før renter', kilde: 'resultat', enhed: 'kr', rolle: 'begge', naar: 'underskud', usikker: false },
      { felt_nr: '117', label: 'Renteudgifter i virksomhed', kilde: 'renter_beskattet', enhed: 'kr', rolle: 'beskattet', usikker: false },
      { felt_nr: '—', label: 'Vælg beskatningsform', kilde: 'beskatningsform', enhed: '', rolle: 'begge', usikker: true },
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
    case 'udlejningsdage': return udlejningsdage(saet)
    case 'udlejet_andel_pct': return Math.round(Number(saet?.udlejet_andel_pct) || 0)
    case 'naertstaaende': return saet?.naertstaaende ? 'Ja' : 'Nej'
    case 'virksomhedsaktivitet': return 'Aktiv erhvervsmæssig virksomhed'
    case 'beskatningsform': return 'Beskatning efter de almindelige regler'
    case 'cpr': return person?.cpr || '(indtast CVR/SE eller CPR)'
    case 'moms_nul': return 0
    case 'regnskabsfritagelse': return 'Ja, fritaget efter virksomhedstype'
    default: return ''
  }
}
