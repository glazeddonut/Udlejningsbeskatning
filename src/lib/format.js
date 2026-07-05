// Danske formaterings- og parsing-hjælpere.

// Formatér et tal som danske kroner, fx 79200 → "79.200 kr."
export function kr(n) {
  const v = Number(n) || 0
  return v.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr.'
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
export function parseNum(s) {
  if (s === '' || s === null || s === undefined) return 0
  const cleaned = String(s).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}
