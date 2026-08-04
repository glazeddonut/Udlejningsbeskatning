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

import { posterIGruppe, erKendtPost, findPost } from './kontoplan.js'

// Nulstillede beløb for én af kontoplanens grupper, i kontoplanens rækkefølge.
const nulPoster = (gruppe) =>
  Object.fromEntries(posterIGruppe(gruppe).map(p => [p.noegle, 0]))

// Tomt talsæt (budget = forskud, faktisk = selvangivelse). Posterne kommer fra
// kontoplanen, så et tomt talsæt aldrig kan drive fra den.
export function tomtSaet() {
  return {
    fra_dato: '',             // udlejningsperiode (ISO YYYY-MM-DD); udledes fra lejekontrakt
    til_dato: '',
    indtaegter: nulPoster('indtaegter'),
    udgifter: nulPoster('udgifter'),
    prorata: {},              // { "indtaegter.leje": true } — true = beløbet er PR. MÅNED
    forbedringer: 0,
    renteudgifter: {},        // { loanId: beløb } (aldrig pro rata — faktiske renter)
    udlejet_andel_pct: 100,
    naertstaaende: true,
    periode_kvittering: null, // kvittering på en periodeafvigelse (se periodeKvittering)
  }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)))
const sumValues = (obj) =>
  Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0)

function parseDato(s) {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

// Vælger den lejekontrakt der er aktiv i et givet år (én aktiv pr. år). Ved
// overlap vælges den kontrakt der dækker flest af årets dage. null hvis ingen.
export function leaseForAar(leases, aar) {
  const liste = Array.isArray(leases) ? leases : (leases ? [leases] : [])
  const ys = `${aar}-01-01`, ye = `${aar}-12-31`
  let bedst = null, bedstDage = -1
  for (const l of liste) {
    const ls = l?.startdato || ys, le = l?.slutdato || ye
    const fra = ls > ys ? ls : ys, til = le < ye ? le : ye
    if (fra > til) continue                     // ingen overlap med året
    const dage = udlejningsdage({ fra_dato: fra, til_dato: til })
    if (dage > bedstDage) { bedst = l; bedstDage = dage }
  }
  return bedst
}

// Det årsinterval lejekontrakterne spænder over: tidligste start → seneste slut.
// `null` i en ende betyder INGEN grænse — enten fordi ingen kontrakt har en dato i den
// ende, eller (i den øvre) fordi mindst én kontrakt er åben og altså løber videre.
// Bruges til at afgøre hvilke år der må oprettes, og til at vise intervallet ved
// indtastningen.
export function aarsinterval(leases) {
  const liste = Array.isArray(leases) ? leases : (leases ? [leases] : [])
  const aarstal = (d) => Number(String(d).slice(0, 4))
  const starter = liste.map(l => l?.startdato).filter(Boolean).map(aarstal)
  const slutter = liste.map(l => l?.slutdato).filter(Boolean).map(aarstal)
  const aabenSlut = liste.length > 0 && slutter.length < liste.length
  return {
    foerste: starter.length ? Math.min(...starter) : null,
    sidste: aabenSlut || !slutter.length ? null : Math.max(...slutter),
  }
}

// Udlejningsperioden for et år, klippet til året, udledt af lejekontrakten.
// Returnerer [fra_dato, til_dato] som ISO-strenge.
//
// Uden lejekontrakt er der ingen periode at udlede — ['', ''] (ADR-0002). Her blev
// hele kalenderåret tidligere tildelt, så et hul-år fik 360 indberetningsdage uden at
// nogen havde lejet ud. En åben SLUTdato er noget andet: kontrakten løber videre, og
// perioden klippes så til årets udgang.
export function periodeForAar(lease, aar) {
  if (!lease) return ['', '']
  const ys = `${aar}-01-01`, ye = `${aar}-12-31`
  const ls = lease.startdato || ys
  const le = lease.slutdato || ye
  return [ls > ys ? ls : ys, le < ye ? le : ye]   // ISO-datoer sorterer leksikalsk
}

// Må året oprettes? Ét svar til både serveren og klienten: `{ ok, begrundelse }`.
// Reglen stod tidligere ordret to steder — i Årets tal og i POST /api/years — med hver
// sin fejltekst, og ingen af de to kopier var testet.
export function maaAarOprettes(leases, aar) {
  const aarN = Number(aar)
  const nej = (begrundelse) => ({ ok: false, begrundelse })
  if (!Number.isInteger(aarN) || aarN < 1900 || aarN > 2200) return nej('Angiv et gyldigt årstal')
  const { foerste, sidste } = aarsinterval(leases)
  if (foerste !== null && aarN < foerste)
    return nej(`Lejekontrakterne starter i ${foerste} — ${aarN} kan ikke oprettes`)
  if (sidste !== null && aarN > sidste)
    return nej(`Lejekontrakterne slutter i ${sidste} — ${aarN} kan ikke oprettes`)
  // Hul-året: inden for intervallet, men ingen kontrakt dækker det (CONTEXT.md). Det
  // blev tidligere accepteret tavst og fik hele kalenderåret som udlejningsperiode —
  // altså 360 indberetningsdage uden at nogen havde lejet ud (ADR-0002). Spørgsmålet
  // stilles til leaseForAar, så "må året oprettes" og "hvilken kontrakt gælder i året"
  // ikke kan svare hver sit. Uden lejekontrakter overhovedet rammer samme regel: der
  // er ingen periode at udlede, og året ville fødes uden en.
  if (!leaseForAar(leases, aarN))
    return nej(`Ingen lejekontrakt dækker ${aarN} — opret lejekontrakten, eller vælg et andet år`)
  return { ok: true, begrundelse: '' }
}

// Hvad lejekontrakterne siger om et år — den AFLEDTE sandhed, beregnet ved hvert
// opslag. Modstykket til det gemte talsæt, som er et øjebliksbillede fra dengang
// året blev oprettet. Bruges til prefill og til at opdage drift (periodeAfvigelse).
export function aarsgrundlag(leases, aar) {
  const lease = leaseForAar(leases, aar)
  const [fra_dato, til_dato] = periodeForAar(lease, aar)
  const periode = { fra_dato, til_dato }
  return {
    aar, lease, fra_dato, til_dato,
    maanedlig_leje: Number(lease?.maanedlig_leje) || 0,
    vand: Number(lease?.forbrug_aconto?.vand) || 0,
    varme: Number(lease?.forbrug_aconto?.varme) || 0,
    dage: udlejningsdage(periode),
    dage360: udlejningsdage360(periode),
    mangler: manglerPeriode(periode),   // hul-år: ingen kontrakt → ingen periode
  }
}

// Talsættet et NYT år fødes med: udlejningsperiode og leje fra den lejekontrakt der
// gælder i året, grundskyld fra ejendommen og et renteskøn fra lånene.
//
// Funktionen lå i skærmkomponenten, hvor kun klienten kunne nå den. Serveren tog derfor
// imod `budget ?? {}` og lod et år oprettet direkte mod API'et fødes uden periode —
// præcis den kilde ADR-0002 lukker. Den bor her, så begge veje giver samme talsæt.
//
// De løbende poster forudfyldes som MÅNEDSBELØB med pro rata slået til, så
// udlejningsperioden selv styrer årets beløb. Grundskyld er derimod et årsbeløb.
export function prefillSaet({ leases, property, loans, aar }) {
  const s = tomtSaet()
  const g = aarsgrundlag(leases, aar)
  s.fra_dato = g.fra_dato
  s.til_dato = g.til_dato
  // Renteskønnet er ÅRETS, ikke et helt års: et lån optaget i august skal ikke føde
  // året med tolv måneders rente (renteskoen).
  for (const l of loans || []) s.renteudgifter[l.id] = renteskoen(l, aar).beloeb
  if (g.lease) {
    s.indtaegter.leje = g.maanedlig_leje
    s.indtaegter.vand = g.vand
    s.indtaegter.varme = g.varme
    s.udgifter.vand = g.vand
    s.udgifter.varme = g.varme
    s.prorata = {
      'indtaegter.leje': true, 'indtaegter.vand': true, 'indtaegter.varme': true,
      'udgifter.vand': true, 'udgifter.varme': true,
    }
  }
  if (property) s.udgifter.grundskyld = Number(property.grundskyld_aarlig) || 0
  return s
}

// Talsættet et nyt år FØDES med, givet det talsæt kalderen måtte have sendt med.
//
// Uden et indsendt talsæt er svaret prefillet. Med et indsendt talsæt respekteres det
// — det er kalderens tal — men en manglende dato udfyldes fra lejekontrakten, så et år
// aldrig fødes uden udlejningsperiode (ADR-0002). At spørge `budget ?? prefill` var
// ikke nok: et indsendt `{}` er ikke et fraværende talsæt, og året kom igennem uden
// periode ad præcis den vej. Kun de datoer der MANGLER udfyldes — har kalderen sagt
// noget, står det.
export function saetTilNytAar({ leases, property, loans, aar }, indsendt) {
  const prefill = prefillSaet({ leases, property, loans, aar })
  if (!indsendt) return prefill
  return {
    ...indsendt,
    fra_dato: indsendt.fra_dato || prefill.fra_dato,
    til_dato: indsendt.til_dato || prefill.til_dato,
  }
}

const sammePeriode = (a, b) =>
  (a?.fra_dato || '') === (b?.fra_dato || '') && (a?.til_dato || '') === (b?.til_dato || '')

// En kvittering på en periodeafvigelse: brugerens begrundelse, bundet til præcis de to
// perioder den blev givet for. Gemmes på årets talsæt som `periode_kvittering`.
//
// Bindingen er hele pointen. En ren boolean ("afvigelsen er accepteret") ville blive
// stående når lejekontrakten eller talsættet blev rettet bagefter, og dermed dække over
// en helt ny afvigelse med en gammel forklaring — netop det en kvittering ikke må kunne.
// Derfor gemmes begge perioder med, og kvitteringen gælder kun så længe de holder.
//
// Returnerer null når der intet er at kvittere for, når begrundelsen er tom — en
// kvittering uden ord forklarer ingenting og ville kun slukke advarslen — og når den
// gemte periode MANGLER: et fravær forklares ikke, det udfyldes (ADR-0002). Noten ville
// ellers skrive "— – — (0 dage til skat.dk)" som en bevidst afvigelse, altså præcis den
// slags svar der ser legitimt ud, netop når oplysningen mangler.
export function periodeKvittering(afvigelse, begrundelse) {
  const tekst = String(begrundelse ?? '').trim()
  if (!afvigelse || !tekst || manglerPeriode(afvigelse.gemt)) return null
  return {
    begrundelse: tekst,
    gemt: { fra_dato: afvigelse.gemt.fra_dato, til_dato: afvigelse.gemt.til_dato },
    afledt: { fra_dato: afvigelse.afledt.fra_dato, til_dato: afvigelse.afledt.til_dato },
  }
}

// Afviger det gemte talsæts periode fra lejekontrakten? Returnerer null når de er
// enige (eller der ingen kontrakt er at afstemme mod), ellers begge sæt tal.
// En afvigelse er IKKE nødvendigvis en fejl — brugeren kan have overstyret bevidst
// (fx faktisk indflytning en dag efter kontraktens start). Derfor rapporteres den,
// den rettes ikke automatisk.
//
// Er afvigelsen kvitteret, rapporteres den stadig — men som en neutral note med
// begrundelsen frem for som en advarsel. En advarsel der aldrig kan gå væk på et
// korrekt år, lærer brugeren at ignorere advarsler, og appens øvrige advarsler handler
// om markedsleje og gaveelement.
//
// `begrundelse` er tom med mindre kvitteringen faktisk dækker DENNE afvigelse. Den
// gamle tekst går ikke tabt — den står i `foraeldet_begrundelse`, så en visende flade
// kan vise hvad der engang blev kvitteret for, uden at kunne komme til at fremstille
// den som gældende.
export function periodeAfvigelse(saet, grundlag) {
  if (!grundlag?.lease) return null
  const fra = saet?.fra_dato || '', til = saet?.til_dato || ''
  if (fra === grundlag.fra_dato && til === grundlag.til_dato) return null
  const gemtPeriode = { fra_dato: fra, til_dato: til }
  const afledtPeriode = { fra_dato: grundlag.fra_dato, til_dato: grundlag.til_dato }

  const k = saet?.periode_kvittering
  const tekst = String(k?.begrundelse ?? '').trim()
  // En manglende gemt periode kan ikke være kvitteret (ADR-0002), heller ikke selvom
  // talsættet bærer en kvittering fra dengang den fandtes.
  const daekker = !!tekst && !manglerPeriode(gemtPeriode)
    && sammePeriode(k.gemt, gemtPeriode) && sammePeriode(k.afledt, afledtPeriode)
  const foraeldet = !!tekst && !daekker

  return {
    gemt: { ...gemtPeriode, dage: udlejningsdage(gemtPeriode), dage360: udlejningsdage360(gemtPeriode) },
    afledt: { ...afledtPeriode, dage: grundlag.dage, dage360: grundlag.dage360 },
    kvitteret: daekker,
    begrundelse: daekker ? tekst : '',
    foraeldet,
    foraeldet_begrundelse: foraeldet ? tekst : '',
  }
}

// Antal kalendermåneder perioden berører (til pro rata). Datobaseret; falder tilbage
// til gammelt måneds-format hvis datoer mangler.
export function antalMaaneder(saet) {
  const f = parseDato(saet?.fra_dato), t = parseDato(saet?.til_dato)
  if (f && t) {
    const m = (t.getFullYear() * 12 + t.getMonth()) - (f.getFullYear() * 12 + f.getMonth()) + 1
    return Math.max(0, m)
  }
  const fra = clamp(saet?.fra_maaned ?? 1, 1, 12)
  const til = clamp(saet?.til_maaned ?? 12, 1, 12)
  return Math.max(0, til - fra + 1)
}

// Mangler talsættet en hel udlejningsperiode? Kun to gyldige datoer tæller som oplyst
// — én dato er lige så uoplyst som ingen. Flaget er det svar dagsoptællingerne giver i
// stedet for et tal, så en visende flade kan skrive "periode mangler" (ADR-0002).
export function manglerPeriode(saet) {
  return !parseDato(saet?.fra_dato) || !parseDato(saet?.til_dato)
}

// Regnes mindst ét månedsbeløb op som et helt år, fordi udlejningsperioden mangler?
//
// `prorataMaaneder` falder med vilje tilbage til hele året uden periode — modsat
// dagstallene, som svarer 0 (ADR-0002). Forskellen er, at et dagstal ER den værdi der
// indberettes og derfor kan erstattes af tekst, mens pro rata er en faktor på et beløb
// brugeren selv har tastet: svarede den 0, forsvandt huslejen tavst ud af resultatet —
// samme plausible fejl, blot i kroner i stedet for dage.
//
// Prisen er en antagelse ingen har sagt højt: at månedsbeløbene løb hele året. Den er
// sand for regnestykket og som regel forkert i virkeligheden. Derfor dette flag: de
// resultatfelter der bygger på antagelsen markeres, og deres kopiér-knap fjernes, så
// tallet ikke kan gå ét klik til skat.dk uden at antagelsen er set (issue #16).
//
// Er INTET markeret pro rata, ændrer den manglende periode ikke et eneste beløb, og så
// skal der heller ikke advares — en advarsel der lyser uden grund, læres der at ignorere.
export function proRataUdenPeriode(saet) {
  if (!manglerPeriode(saet)) return false
  return Object.values(saet?.prorata || {}).some(Boolean)
}

// Antal udlejningsdage efter SKATs 30/360-konvention: en kalendermåned regnes som
// 30 dage og indkomståret som 360 dage. Det er den konvention fodnoten på felt 748
// (forskud) og rubrik 207 (årsopgørelse) foreskriver — se CLAUDE.md.
// Bruges KUN til indberetning; pro rata af beløb er dagsproportional (prorataMaaneder).
//
// Uden en udlejningsperiode er svaret 0, ikke et skøn (ADR-0002). Her stod tidligere
// `antalMaaneder(saet) * 30`, som uden datoer gav 360 — præcis SKATs egen værdi for et
// helt udlejningsår. Gættet producerede derfor ikke et åbenlyst forkert tal, men et der
// så fuldstændig legitimt ud, netop når oplysningen manglede, og som kunne indberettes
// ubemærket i felt 748 / rubrik 207. Kalderen spørger manglerPeriode og skriver
// "periode mangler" frem for et tal.
export function udlejningsdage360(saet) {
  if (manglerPeriode(saet)) return 0
  const f = parseDato(saet.fra_dato), t = parseDato(saet.til_dato)
  const d1 = Math.min(f.getDate(), 30), d2 = Math.min(t.getDate(), 30)
  const dage = (t.getFullYear() - f.getFullYear()) * 360
    + (t.getMonth() - f.getMonth()) * 30 + (d2 - d1) + 1
  return Math.max(0, dage)
}

// Faktiske kalenderdage mellem to ISO-datoer, inklusive begge ender. Ren dato-aritmetik
// uden noget domænebegreb — den bærer hverken en udlejningsperiode eller en løbetid, så
// to forskellige spørgsmål kan tælle dage med samme regnestykke uden at låne betydning
// af hinanden. Negativt interval giver 0.
const dageMellem = (fraISO, tilISO) => {
  const f = parseDato(fraISO), t = parseDato(tilISO)
  if (!f || !t) return 0
  return Math.max(0, Math.round((t - f) / 86400000) + 1)
}

// Antal udlejningsdage (faktiske kalenderdage, inklusiv start og slut).
// Uden periode: 0 — se udlejningsdage360 for hvorfor der ikke gættes.
export function udlejningsdage(saet) {
  if (manglerPeriode(saet)) return 0
  return dageMellem(saet.fra_dato, saet.til_dato)
}

// Forholdsmæssige måneder til pro rata (dansk lejeret): summen af aktive dage / dage i
// hver berørt måned. Delmåneder tæller forholdsmæssigt (fx 5.–31. aug = 27/31). Datobaseret;
// falder tilbage til hele måneder (antalMaaneder) hvis datoer mangler.
//
// Bemærk den bevidste asymmetri til dagstallene, som svarer 0 ved manglende periode
// (ADR-0002): et dagstal ER den værdi der indberettes og kan derfor erstattes af teksten
// "periode mangler", mens pro rata er en faktor på et beløb der skal ende som et tal i en
// sum. Svarede den 0, forsvandt den indtastede husleje tavst ud af udlejningsresultatet.
// Manglende periode markeres derfor med flaget, ikke ved at nulstille beløbene.
export function prorataMaaneder(saet) {
  const f = parseDato(saet?.fra_dato), t = parseDato(saet?.til_dato)
  if (!f || !t || t < f) return antalMaaneder(saet)
  let sum = 0
  let y = f.getFullYear(), m = f.getMonth()
  const endY = t.getFullYear(), endM = t.getMonth()
  while (y < endY || (y === endY && m <= endM)) {
    const dageIMaaned = new Date(y, m + 1, 0).getDate()
    const mStart = new Date(y, m, 1), mEnd = new Date(y, m, dageIMaaned)
    const aStart = f > mStart ? f : mStart
    const aEnd = t < mEnd ? t : mEnd
    sum += (Math.round((aEnd - aStart) / 86400000) + 1) / dageIMaaned
    m++; if (m > 11) { m = 0; y++ }
  }
  return sum
}

export function erProrata(saet, gruppe, key) {
  return !!saet?.prorata?.[`${gruppe}.${key}`]
}

// ── Den udlejede andel ─────────────────────────────────────────────────────────
//
// Hvor stor en del af ejendommen der er udlejet erhvervsmæssigt. Den indberettes til
// skat.dk (felt 744, "erhvervsmæssig andel"), og fra ADR-0003 er den også den andel
// fradraget REGNES på — ellers kunne man indberette 60 % og fradrage 100 %.
//
// Den rammer KUN ejendomsposter (se fradragsBeloeb). Det er ikke en tilfældig
// afgrænsning: "erhvervsmæssig andel" findes for delvis udlejning — fx et værelse i
// egen bolig — hvor kun den udlejede del af EJENDOMMENS fælles omkostninger er
// fradragsberettiget. Lejen er den leje der faktisk er modtaget, og vedligeholdelse
// af det udlejede er afholdt fuldt ud, uanset hvor stor en del af boligen der lejes ud.
//
// Andelen læses som et tal, ikke som en sandhedsværdi: 0 % er en rigtig andel (intet
// er udlejet erhvervsmæssigt) og må ikke stiltiende blive til 100. Er feltet derimod
// slet ikke oplyst — tomt, fraværende eller ulæseligt — er svaret fuld udlejning,
// samme default som tomtSaet, så ældre talsæt uden feltet regnes præcis som før.
//
// Værdien klemmes til 0–100. Grænsen opad er ikke kosmetik: uden den ville en tastefejl
// på 600 gange et fradrag op med seks, og et for STORT fradrag er den ene fejl der
// koster over for SKAT. Selve indtastningsfeltets validering hører til i UI'et.
export function udlejetAndel(saet) {
  const raa = saet?.udlejet_andel_pct
  if (raa === '' || raa === null || raa === undefined) return 100
  const v = Number(raa)
  if (!Number.isFinite(v)) return 100
  return Math.min(100, Math.max(0, v))
}

// Rammer den udlejede andel denne post? Kun en post kontoplanen KENDER og har markeret
// som ejendomspost. En hjemløs post — en værdi under en nøgle kontoplanen ikke kender —
// har intet flag, og fraværet af en oplysning er ikke det samme som et "ja". At skære
// et fradrag ned på et gæt ville ændre et tal der indberettes til SKAT, uden at nogen
// havde taget stilling. Den hjemløse post står i forvejen som sin egen synlige række
// (ADR-0001), så brugeren kan flytte den til en rigtig post, hvis den hører til der.
const erEjendomspost = (gruppe, noegle) => !!findPost(gruppe, noegle)?.ejendomspost

// Det FRADRAGSBERETTIGEDE beløb for én post: det effektive årsbeløb, nedskrevet med den
// udlejede andel hvis posten er en ejendomspost (ADR-0003).
//
// De to faktorer regnes i en bevidst rækkefølge: pro rata FØRST, andelen derefter.
// Pro rata svarer på hvad der er afholdt i årets udlejningsperiode — en kendsgerning om
// året — og andelen på hvor meget af det, der er fradragsberettiget. Faktorerne er kun
// ombyttelige indtil afrundingen, og forskellen kan blive hele kroner: 33 % af 12 × 1.041
// er 4.122, mens 12 × 33 % af 1.041 er 4.128.
//
// Der afrundes PR. POST og til HELE KRONER — samme konvention som effektivBeloeb bruger
// på pro rata. Andelen må ikke kunne tilføje ører til et regnskab, for rækkerne skrives
// med kr() uden decimaler: 60 % af 3.121 er 1.872,60, som ville stå som 1.873 i sin
// række, men tælle 1.872,60 med i totalen. Så ville delene ikke længere give totalen
// (ADR-0001). Alle ører i et regnskab skal komme fra noget brugeren selv har tastet.
export function fradragsBeloeb(saet, gruppe, noegle) {
  const beloeb = effektivBeloeb(saet, gruppe, noegle)
  if (!erEjendomspost(gruppe, noegle)) return beloeb
  return Math.round(beloeb * udlejetAndel(saet) / 100)
}

// Effektivt årsbeløb for et felt: pro rata → månedsbeløb × forholdsmæssige måneder; ellers rå værdi.
export function effektivBeloeb(saet, gruppe, key) {
  const raw = Number(saet?.[gruppe]?.[key]) || 0
  return erProrata(saet, gruppe, key) ? Math.round(raw * prorataMaaneder(saet)) : raw
}

// Opgørelsen af én gruppe ('indtaegter' | 'udgifter'): kontoplanens poster med deres
// effektive årsbeløb, PLUS de hjemløse poster — værdier gemt under nøgler kontoplanen
// ikke kender (fx en legacy-nøgle i JSON-filen).
//
// Summeringen løber kontoplanen igennem, ikke talsættets nøgler, så indtastning,
// regnskab og PDF bygger på samme liste. Hjemløse poster tælles MED i summen og
// rapporteres eksplicit, så en visende flade kan give dem hver sin række. Invarianten
// er, at poster + hjemløse altid summer til `sum` — et regnskab hvor delene ikke giver
// totalen er værdiløst som dokumentation over for SKAT (ADR-0001).
//
// Hver linje bærer to beløb, og forskellen på dem er hele den udlejede andel (ADR-0003):
//  - `beloebFoerAndel` er det AFHOLDTE beløb for perioden (efter pro rata). Det er det
//    tal der er tastet, og det tal et bilag kan dokumentere — derfor afstemmes der mod
//    dette, ikke mod fradraget.
//  - `beloeb` er det FRADRAGSBERETTIGEDE beløb: samme tal, nedskrevet med den udlejede
//    andel hvis linjen er en ejendomspost. Det er dette der summer til `sum` og videre
//    til udlejningsresultatet.
// Ved fuld udlejning er de to identiske, og gruppen er tal for tal som før.
export function gruppeOpgoerelse(saet, gruppe) {
  const andelPct = udlejetAndel(saet)
  const linje = (noegle, post) => {
    const beloebFoerAndel = effektivBeloeb(saet, gruppe, noegle)
    const beloeb = fradragsBeloeb(saet, gruppe, noegle)
    return {
      id: `${gruppe}.${noegle}`,
      gruppe,
      noegle,
      label: post?.label ?? '',
      hint: post?.hint ?? '',
      ejendomspost: post?.ejendomspost ?? false,
      prorata: erProrata(saet, gruppe, noegle),
      // `andel` er svaret på "har den udlejede andel skrevet netop DENNE linje ned?".
      // Det er ikke det samme spørgsmål som `ejendomspost`: ved fuld udlejning, og på en
      // post uden beløb, er der intet skåret fra og intet at forklare. Flaget bor her, så
      // indtastningen, opstillingen og forklaringen læser ét svar i stedet for hver at
      // stille spørgsmålet på sin egen måde.
      andel: beloeb !== beloebFoerAndel,
      beloebFoerAndel,
      beloeb,
    }
  }
  const poster = posterIGruppe(gruppe).map(p => linje(p.noegle, p))
  const hjemloese = Object.keys(saet?.[gruppe] || {})
    .filter(k => !erKendtPost(gruppe, k))
    .map(k => linje(k, null))
  const alle = [...poster, ...hjemloese]
  return {
    poster,
    hjemloese,
    sum: alle.reduce((s, l) => s + l.beloeb, 0),
    sumFoerAndel: alle.reduce((s, l) => s + l.beloebFoerAndel, 0),
    andelPct,
  }
}

export function sumIndtaegter(saet) {
  return gruppeOpgoerelse(saet, 'indtaegter').sum
}

// Fradragsberettigede driftsudgifter. Forbedringer indgår bevidst IKKE.
export function sumFradragsUdgifter(saet) {
  return gruppeOpgoerelse(saet, 'udgifter').sum
}

// Udlejningsresultat før renter (kan være negativt = underskud).
export function resultatFoerRenter(saet) {
  return sumIndtaegter(saet) - sumFradragsUdgifter(saet)
}

// Samlede renteudgifter i året (på tværs af alle lån).
export function sumRenter(saet) {
  return sumValues(saet?.renteudgifter)
}

// Estimeret årlig renteudgift for et lån (restgæld × rente). Svaret på "hvad koster
// lånet på et HELT år" — årsuafhængigt og uden hensyn til hvornår lånet blev optaget.
// Renteskønnet for ét bestemt år er et andet spørgsmål; det stiller man til renteskoen.
export function estimeretAarligRente(loan) {
  return Math.round((Number(loan?.restgaeld) || 0) * (Number(loan?.rente_pct) || 0) / 100)
}

// Antal dage i et kalenderår (365, eller 366 i skudår). Året skal være et TAL —
// `'2025' + 1` er "20251", og et skøn regnet på år 20251 ville være tavst forkert.
const dageIKalenderaar = (aarN) => dageMellem(`${aarN}-01-01`, `${aarN}-12-31`)

// Renteskønnet for ÉT år: hvad lånet kostede i renter i netop det år.
//
// DAGSKONVENTION — et bevidst valg (CLAUDE.md har tre, og de må ikke blandes sammen):
// her tælles FAKTISKE kalenderdage, inklusive lånets startdag, delt med årets faktiske
// længde (365/366). Ikke 30/360: det er indberetningsdage til felt 748 / rubrik 207 og
// hører kun til et dagstal der indberettes — dette er et beløb. Og ikke pro rata-måneder:
// de ganger et MÅNEDSbeløb op til et årsbeløb, mens renten allerede ER et årsbeløb der
// skal skæres ned. Renter tilskrives desuden pr. dag på en saldo, så dage/år er den
// konvention der svarer til det lånet faktisk gør.
//
// Dette er lånets løbetid i året — ikke udlejningsperioden. De to spørgsmål er
// forskellige og må ikke låne tal af hinanden.
//
// MANGLENDE STARTDATO dækker HELE året, markeret med et flag. ADR-0002 gætter ikke en
// manglende udlejningsperiode, men dét er et dagstal der INDBERETTES, hvor 0 er det
// ærlige svar. Her er svaret et beløb: et skøn på 0 ville læses som "ingen rente" — et
// forkert tal der ser legitimt ud — mens et helt års rente er præcis det feltet spørger
// om. De lån der allerede står i databasen har ingen startdato og får samme skøn som før.
//
// DER FREMSKRIVES INGEN SALDO. Lånet har hverken løbetid eller afdragsform, så restgælden
// på peildatoen bruges som den står. Er den målt langt fra året, siges det (peildatoAdvarsel)
// frem for at blive regnet om på et gæt.
export function renteskoen(loan, aar) {
  const helAar = estimeretAarligRente(loan)
  // Startdatoen læses ÉT sted, og en dato der ikke er en dato er lige så uoplyst som
  // ingen dato — ellers kunne to grene svare hver sit om samme lån.
  const startdato = parseDato(loan?.startdato) ? loan.startdato : ''
  const manglerStartdato = !startdato

  // Året læses som et tal. Er det slet ikke et årstal, er der intet år at skære
  // skønnet til, og svaret er det uforkortede årsskøn — dagstallene siges at være
  // ukendte (0/0) frem for at blive gættet.
  const aarN = Number(aar)
  if (!Number.isInteger(aarN))
    return { beloeb: helAar, helAar, dage: 0, dageIAar: 0, foerOptagelse: false, manglerStartdato, peildatoAdvarsel: '' }

  const iAar = dageIKalenderaar(aarN)
  // Lånets løbetid i året, klippet til året — ISO-datoer sorterer leksikalsk, samme
  // greb som periodeForAar bruger. Startdagen tæller med.
  const aarStart = `${aarN}-01-01`, aarSlut = `${aarN}-12-31`
  const dage = dageMellem(startdato > aarStart ? startdato : aarStart, aarSlut)
  const foerOptagelse = !manglerStartdato && startdato > aarSlut
  return {
    beloeb: Math.round(helAar * dage / iAar),
    helAar,
    dage,
    dageIAar: iAar,
    // Året ligger helt før lånet blev optaget: der er ingen rente at skønne, og
    // fladen skal kunne sige hvorfor frem for at vise et tomt felt uden grund.
    foerOptagelse,
    // Uden startdato dækker skønnet HELE året — se kommentaren over funktionen.
    // Flaget er der, så antagelsen kan stå på skærmen i stedet for at være tavs.
    manglerStartdato,
    // Uden et skøn er der intet at advare om.
    peildatoAdvarsel: foerOptagelse ? '' : peildatoAdvarsel(loan?.restgaeld_dato, aarN),
  }
}

// Hvor langt fra året må restgældens peildato ligge, før skønnet kaldes svagt? Målt i
// dage FRA årets nærmeste kant — 0 når saldoen er målt inde i selve året.
//
// Et halvt år. Grænsen er symmetrisk, fordi fejlen er det: en saldo målt lige før og en
// målt lige efter året er begge tæt på årets egen. Bankens opgørelse pr. det seneste
// årsskifte ligger 1 dag fra og er det bedste der findes — den må ikke advare. Omvendt
// har en saldo et helt år på den anden side haft fire terminer til at flytte sig, og uden
// en afdragsprofil kan skønnet ikke rette op på det. Det er den afstand peildatoen
// 31.12.2026 har til 2025 — netop den der gav et helt års rente som skøn for 2025.
const PEILDATO_TOLERANCE_DAGE = 183

// Ligger restgældens peildato langt fra det år der regnes på? Tom streng = nej, ellers
// den danske begrundelse brugeren får at se.
//
// En uoplyst peildato advares der ikke om: et uoplyst felt er ikke en fejl, og en
// udateret saldo er ikke det samme som en saldo målt et forkert sted.
function peildatoAdvarsel(peildato, aarN) {
  if (!parseDato(peildato)) return ''
  const aarStart = `${aarN}-01-01`, aarSlut = `${aarN}-12-31`
  // dageMellem tæller begge ender med, så en dato 1 dag uden for året giver 2 — derfor −1.
  if (peildato > aarSlut && dageMellem(aarSlut, peildato) - 1 > PEILDATO_TOLERANCE_DAGE)
    return `Restgælden er målt pr. ${peildato} — længe efter udgangen af ${aarN}. `
      + `Skønnet bygger på en saldo året ikke havde; brug bankens rentetal for ${aarN}.`
  if (peildato < aarStart && dageMellem(peildato, aarStart) - 1 > PEILDATO_TOLERANCE_DAGE)
    return `Restgælden er målt pr. ${peildato} — længe før ${aarN} begyndte. `
      + `Saldoen er afdraget siden, så skønnet er for højt; brug bankens rentetal for ${aarN}.`
  return ''
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
