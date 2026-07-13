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

// Formatér et tal uden enhed, fx 79200 → "79.200"
export function tal(n) {
  const v = Number(n) || 0
  return v.toLocaleString('da-DK', { maximumFractionDigits: 0 })
}

// Formatér procent, fx 50 → "50 %"
export function pct(n) {
  return (Number(n) || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 }) + ' %'
}

// Parse et indtastet felt til et tal (tåler tomme felter og danske tusindtalsseparatorer).
// Dansk konvention: komma = decimal, punktum = tusindtalsseparator.
export function parseNum(s) {
  if (s === '' || s === null || s === undefined) return 0
  const cleaned = String(s).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

// Tal → redigerbar tekst med dansk decimalkomma (uden tusindtalsseparator),
// så det kan re-parses korrekt af parseNum. Tomt/0-håndteres af kalderen.
export function daNum(v) {
  if (v === '' || v === null || v === undefined || isNaN(Number(v))) return ''
  return Number(v).toLocaleString('da-DK', { useGrouping: false, maximumFractionDigits: 2 })
}
