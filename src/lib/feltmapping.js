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

import { udlejningsdage, udlejningsdage360, manglerPeriode, udlejetAndel } from './beregning.js'

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

// Hent feltmappingen for et år + doktype. Rækkefølge: overrides → default for året →
// nærmeste tidligere definerede år → ellers ældste definerede år (fallback opad).
//
// Svaret bærer felterne SAMMEN MED deres herkomst, og det er med vilje: der findes i dag
// kun defaults for ét år, så ethvert andet år arver dem. Returnerede funktionen bare
// rækkerne, kunne en flade vise en pæn liste feltnumre for 2027 uden at kunne skrive at
// de er 2026's — netop den tavse fejl på projektets højeste risikopunkt. Nu kan man ikke
// få fat i `felter` uden også at have `kildeAar` i hånden.
//
//   aar       — året der blev spurgt om
//   felter    — rækkerne der faktisk gælder
//   kildeAar  — det år rækkerne stammer fra (null hvis der slet ingen findes)
//   egetAar   — er kilden årets egen mapping? false ⇒ arvet og uverificeret for `aar`
//   rettet    — kommer rækkerne fra brugerens egne overrides i DB'en? ("rette feltnumre"
//               er editorens eget ord for det, se Indstillinger)
export function hentFeltmapping(aar, doktype, overrides = {}) {
  const medHerkomst = (felter, kildeAar, rettet) =>
    ({ aar, felter, kildeAar, egetAar: kildeAar != null && kildeAar === aar, rettet })

  const under = defaultFeltmapping(aar, doktype)   // hvad året ville arve uden rettelser

  const override = overrides[`${aar}-${doktype}`]
  if (override?.length) {
    // En override tæller først som ÅRETS EGEN kilde, når den faktisk afviger fra det
    // arvede. Editoren prefiller nemlig med de arvede rækker, så et enkelt klik på
    // "Gem feltnumre" ville ellers kunne slukke advarslen for et år, uden at ét eneste
    // feltnummer var verificeret mod skat.dk. `rettet` siger hvor bytesene kom fra;
    // `egetAar` siger om nogen har taget stilling til dem for netop dette år.
    const uaendret = under.kildeAar !== aar && sammeFelter(override, under.felter)
    return medHerkomst(override, uaendret ? under.kildeAar : aar, true)
  }
  return medHerkomst(under.felter, under.kildeAar, false)
}

// Defaults for året, ellers nærmeste tidligere definerede år, ellers det ældste.
// `kildeAar: null` er "ingen kilde overhovedet", ikke et år.
function defaultFeltmapping(aar, doktype) {
  if (DEFAULT_FELTMAPPING[aar]?.[doktype]) return { felter: DEFAULT_FELTMAPPING[aar][doktype], kildeAar: aar }
  const aarKeys = Object.keys(DEFAULT_FELTMAPPING).map(Number).sort((a, b) => a - b)
  const tidligere = aarKeys.filter(y => y <= aar).sort((a, b) => b - a)
  const kandidat = tidligere[0] ?? aarKeys[0]   // foretræk ≤ aar, ellers ældste definerede
  const arvet = kandidat != null ? DEFAULT_FELTMAPPING[kandidat]?.[doktype] : null
  return arvet ? { felter: arvet, kildeAar: kandidat } : { felter: [], kildeAar: null }
}

// Er to sæt feltrækker indholdsmæssigt ens? Nøglerækkefølge må ikke afgøre det —
// editoren kopierer rækkerne med spread, men en håndredigeret DB kan se anderledes ud.
function sammeFelter(a, b) {
  if (a.length !== b.length) return false
  const kanonisk = (r) => JSON.stringify(Object.keys(r).sort().map(k => [k, r[k]]))
  return a.every((r, i) => kanonisk(r) === kanonisk(b[i]))
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
    // Præcis den andel fradraget er regnet på (ADR-0003) — ikke det rå felt. Læses de to
    // hver for sig, kan man indberette 0 % i felt 744 (tomt felt) og samtidig fradrage
    // 100 %, eller indberette 150 % af en tastefejl mens fradraget er klemt til 100.
    case 'udlejet_andel_pct': return udlejetAndel(saet)
    case 'naertstaaende': return saet?.naertstaaende ? 'Ja' : 'Nej'
    case 'cpr': return person?.cpr || '(indtast CVR/SE eller CPR)'
    case 'moms_nul': return 0
    case 'regnskabsfritagelse': return 'Ja, fritaget efter virksomhedstype'
    default: return ''
  }
}
