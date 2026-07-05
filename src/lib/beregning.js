// ── Beregningsmotor for udlejningsbeskatning (almindelige regler) ──────────────
//
// Rene funktioner uden side-effekter, så de kan testes isoleret med `node --test`.
//
// Skattemodel (almindelige regler, forældrekøb):
//  - Udlejningsresultat FØR renter = indtægter − fradragsberettigede driftsudgifter.
//    Beskattes som kapitalindkomst, fordeles efter EJERANDEL.
//  - Forbedringer er IKKE fradrag (tillægges anskaffelsessum) — indgår ikke her.
//  - Renteudgifter er personlige (negativ kapitalindkomst), IKKE en del af
//    udlejningsresultatet. Fordeles efter HÆFTELSE på det enkelte lån.

// Tomt talsæt (budget = forskud, faktisk = selvangivelse).
export function tomtSaet() {
  return {
    fra_maaned: 1,            // udlejningsperiode: 1–12
    til_maaned: 12,
    indtaegter: { leje: 0, vand: 0, varme: 0, andet: 0 },
    udgifter: {
      grundskyld: 0, faellesudgifter: 0, forsikring: 0, vedligeholdelse: 0,
      vand: 0, varme: 0, administration: 0, renovation: 0, andet: 0,
    },
    prorata: {},              // { "indtaegter.leje": true } — true = beløbet er PR. MÅNED
    forbedringer: 0,
    renteudgifter: {},        // { loanId: beløb } (aldrig pro rata — faktiske renter)
    udlejet_andel_pct: 100,
    naertstaaende: true,
  }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)))
const sumValues = (obj) =>
  Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0)

// Antal aktive udlejningsmåneder i året (1–12).
export function antalMaaneder(saet) {
  const fra = clamp(saet?.fra_maaned ?? 1, 1, 12)
  const til = clamp(saet?.til_maaned ?? 12, 1, 12)
  return Math.max(0, til - fra + 1)
}

// Udlejningsdage udledt af perioden (30-dages-måneder; fuldt år = 360, jf. skat.dk-praksis).
export function udlejningsdage(saet) {
  return antalMaaneder(saet) * 30
}

export function erProrata(saet, gruppe, key) {
  return !!saet?.prorata?.[`${gruppe}.${key}`]
}

// Effektivt årsbeløb for et felt: pro rata → månedsbeløb × antal måneder; ellers rå værdi.
export function effektivBeloeb(saet, gruppe, key) {
  const raw = Number(saet?.[gruppe]?.[key]) || 0
  return erProrata(saet, gruppe, key) ? raw * antalMaaneder(saet) : raw
}

// Alle effektive årsbeløb i en gruppe ('indtaegter' | 'udgifter').
export function effektivGruppe(saet, gruppe) {
  const out = {}
  for (const k of Object.keys(saet?.[gruppe] || {})) out[k] = effektivBeloeb(saet, gruppe, k)
  return out
}

export function sumIndtaegter(saet) {
  return sumValues(effektivGruppe(saet, 'indtaegter'))
}

// Fradragsberettigede driftsudgifter. Forbedringer indgår bevidst IKKE.
export function sumFradragsUdgifter(saet) {
  return sumValues(effektivGruppe(saet, 'udgifter'))
}

// Udlejningsresultat før renter (kan være negativt = underskud).
export function resultatFoerRenter(saet) {
  return sumIndtaegter(saet) - sumFradragsUdgifter(saet)
}

// Samlede renteudgifter i året (på tværs af alle lån).
export function sumRenter(saet) {
  return sumValues(saet?.renteudgifter)
}

// Estimeret årlig renteudgift for et lån (restgæld × rente). Bruges som budget-skøn.
export function estimeretAarligRente(loan) {
  return Math.round((Number(loan?.restgaeld) || 0) * (Number(loan?.rente_pct) || 0) / 100)
}

// Fordel et beløb efter andele { personId: pct }. Returnerer { personId: beløb }.
export function fordelPrPerson(beloeb, andele) {
  const res = {}
  for (const [pid, pct] of Object.entries(andele || {})) {
    res[pid] = beloeb * (Number(pct) || 0) / 100
  }
  return res
}

// Renteudgifter fordelt pr. person efter hvert låns hæftelse. Returnerer { personId: beløb }.
export function renterPrPerson(saet, loans) {
  const res = {}
  for (const loan of loans || []) {
    const rente = Number(saet?.renteudgifter?.[loan.id]) || 0
    if (!rente) continue
    for (const [pid, pct] of Object.entries(loan.haeftelse || {})) {
      res[pid] = (res[pid] || 0) + rente * (Number(pct) || 0) / 100
    }
  }
  return res
}

// Afgør fordelingsmodellen ud fra indstillinger.
//  - mode 'alt_paa_en': hele resultatet + alle renter beskattes hos ÉN ægtefælle
//    (den der driver udlejningen, jf. kildeskattelovens §25 A). Default = den med
//    rollen 'udlejer'. Den anden ægtefælle "flytter" sine renter over (renterFysisk).
//  - mode 'del': resultat fordeles efter ejerandel, renter efter hæftelse (§25 A stk. 8).
export function resolveFordeling(settings, persons) {
  const mode = settings?.fordeling_mode === 'del' ? 'del' : 'alt_paa_en'
  let beskattetPersonId = settings?.beskattet_person_id ?? null
  if (beskattetPersonId == null) {
    const udlejer = (persons || []).find(p => p.rolle === 'udlejer')
    beskattetPersonId = udlejer?.id ?? (persons?.[0]?.id ?? null)
  }
  return { mode, beskattetPersonId }
}

// Samlet opgørelse pr. person for et talsæt, givet en fordeling.
// Returnerer pr. person:
//  - resultatAndel: den del af udlejningsresultatet personen beskattes af
//  - renter: de renter personen beskattes af (efter fordeling)
//  - renterFysisk: personens fysiske andel af renterne efter hæftelse (bruges til
//    "flyt til ægtefælle"-feltet for den ikke-beskattede)
//  - erBeskattet: om personen beskattes af resultatet
//  - nettoKapitalindkomst: resultatAndel − renter
export function personOpgoerelse(saet, { persons, property, loans, fordeling }) {
  const resultat = resultatFoerRenter(saet)
  const totalRenter = sumRenter(saet)
  const renterFysiskMap = renterPrPerson(saet, loans)
  const f = fordeling || { mode: 'del', beskattetPersonId: null }

  return (persons || []).map(p => {
    const andelPct = Number(property?.ejerandele?.[p.id]) || 0
    const renterFysisk = renterFysiskMap[p.id] || 0
    let resultatAndel, renter, erBeskattet
    if (f.mode === 'alt_paa_en') {
      erBeskattet = p.id === f.beskattetPersonId
      resultatAndel = erBeskattet ? resultat : 0
      renter = erBeskattet ? totalRenter : 0
    } else {
      erBeskattet = true                                  // begge beskattes af deres andel
      resultatAndel = resultat * andelPct / 100
      renter = renterFysisk
    }
    return {
      personId: p.id,
      navn: p.navn,
      rolle: p.rolle,
      andelPct,
      erBeskattet,
      resultatAndel,
      renter,
      renterFysisk,
      nettoKapitalindkomst: resultatAndel - renter,
    }
  })
}

// Markedsleje-/gave-tjek: sammenligner aftalt årsleje med markedsleje-skøn.
// advarselPct = hvor mange % under markedsleje der udløser en advarsel.
export function markedslejeTjek(lease, advarselPct = 5) {
  const aftaltAarsleje = (Number(lease?.maanedlig_leje) || 0) * 12
  const markedsAarsleje = (Number(lease?.markedsleje_maanedlig_skoen) || 0) * 12
  if (markedsAarsleje <= 0) {
    return { harSkoen: false, aftaltAarsleje, markedsAarsleje: 0, difference: 0, underPct: 0, advarsel: false }
  }
  const difference = markedsAarsleje - aftaltAarsleje         // positiv = leje under markedsleje (muligt gave-element)
  const underPct = (difference / markedsAarsleje) * 100
  return {
    harSkoen: true,
    aftaltAarsleje,
    markedsAarsleje,
    difference,
    underPct,
    advarsel: underPct > advarselPct,                          // leje ligger mere end X % under markedsleje
  }
}
