// Danske formaterings- og parsing-hjælpere.

// Formatér et tal som danske kroner, fx 79200 → "79.200 kr."
export function kr(n) {
  const v = Number(n) || 0
  return v.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr.'
}

// Formatér med to decimaler (øre), fx 1250.5 → "1.250,50 kr." — til bilag/kvitteringer.
export function kr2(n) {
  const v = Number(n) || 0
  return v.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr.'
}

// Afrund til øre — den mindste enhed et beløb kan bære. Bruges hvor flydende
// mellemresultater ellers ville give en difference der ikke findes (0,1 + 0,2).
export function oere(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Formatér et tal uden enhed, fx 79200 → "79.200"
export function tal(n) {
  const v = Number(n) || 0
  return v.toLocaleString('da-DK', { maximumFractionDigits: 0 })
}

// Formatér procent, fx 50 → "50 %"
export function pct(n) {
  return (Number(n) || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 }) + ' %'
}

// En indtastning som VÆRDI: tallet der står i den, eller `null` når indtastningen ikke
// bærer et tal — hverken tom eller tegn der ikke danner et tal ("-", ",", "fem tusind").
// Dansk konvention: komma = decimal, punktum = tusindtalsseparator.
//
// (Navnet siger "indtastet", ikke "felt": et felt er i dette projekt et NUMMERERET felt
// på skat.dk, og de to må ikke kunne forveksles — se CONTEXT.md, Feltmapping.)
//
// TOMT ER IKKE NUL. En tom indtastning er uoplyst, og de to er ikke det samme overalt: en
// tom udlejet andel læses som fuld udlejning (udlejetAndel), mens 0 % er en rigtig andel
// der nulstiller ejendomsposternes fradrag. Leverede et tomt felt 0, ville det at rydde
// det tavst skære hvert ejendomsfradrag væk — og den andel indberettes til SKAT (ADR-0008).
// For beløb ændrer valget intet: beregningslaget læser gennemgående `Number(v) || 0`,
// så et uoplyst beløb fortsat er 0 kr. Valideringen (validering.js) behandler ligeledes
// `null` som uoplyst, ikke som en fejl.
//
// Det er talfeltet (NumberField) der kalder den, ét sted — kaldestederne parser ikke selv.
export function indtastetTal(s) {
  if (s === '' || s === null || s === undefined) return null
  const renset = String(s).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const n = parseFloat(renset)
  return Number.isFinite(n) ? n : null
}

// Tal → redigerbar tekst med dansk decimalkomma (uden tusindtalsseparator),
// så det kan re-parses korrekt af indtastetTal. Tomt/0-håndteres af kalderen.
export function daNum(v) {
  if (v === '' || v === null || v === undefined || isNaN(Number(v))) return ''
  return Number(v).toLocaleString('da-DK', { useGrouping: false, maximumFractionDigits: 2 })
}
