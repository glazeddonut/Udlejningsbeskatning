// Genbrugelige formular-felter. Holder styling og markup ensartet på tværs af faner.
import { useState, useEffect } from 'react'
import { daNum } from '../lib/format.js'

export function TextField({ label, hint, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="field">
      {label && <label>{label} {hint && <span className="hint">· {hint}</span>}</label>}
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

// Talfelt med enhed-suffiks (fx "kr.", "%", "dage"). Holder rå tekst under redigering,
// så decimaler (fx "1250,50") kan tastes uden at blive normaliseret væk ved hvert tastetryk.
export function NumberField({ label, hint, value, onChange, suffix = 'kr.' }) {
  const [text, setText] = useState(() => daNum(value))
  const [focus, setFocus] = useState(false)
  // Synk fra prop når feltet ikke er i fokus (fanger eksterne ændringer, fx "Kopiér fra budget").
  useEffect(() => { if (!focus) setText(daNum(value)) }, [value, focus])
  return (
    <div className="field">
      {label && <label>{label} {hint && <span className="hint">· {hint}</span>}</label>}
      <div className="input-suffix">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={e => { setText(e.target.value); onChange(e.target.value) }}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{ paddingRight: `${Math.max(42, String(suffix).length * 9 + 22)}px` }}
        />
        <span className="suffix">{suffix}</span>
      </div>
    </div>
  )
}

export function SelectField({ label, hint, value, onChange, options }) {
  return (
    <div className="field">
      {label && <label>{label} {hint && <span className="hint">· {hint}</span>}</label>}
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
