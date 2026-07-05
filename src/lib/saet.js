import { tomtSaet } from './beregning.js'

// Deep-merge et gemt talsæt med defaults, så alle felter altid findes.
export function normaliserSaet(saved) {
  const t = tomtSaet()
  if (!saved) return t
  return {
    ...t, ...saved,
    indtaegter: { ...t.indtaegter, ...(saved.indtaegter || {}) },
    udgifter: { ...t.udgifter, ...(saved.udgifter || {}) },
    renteudgifter: { ...(saved.renteudgifter || {}) },
  }
}
