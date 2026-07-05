// Genbrugelige formular-felter. Holder styling og markup ensartet på tværs af faner.

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

// Talfelt med enhed-suffiks (fx "kr.", "%", "dage"). Værdien holdes som streng under redigering.
export function NumberField({ label, hint, value, onChange, suffix = 'kr.' }) {
  return (
    <div className="field">
      {label && <label>{label} {hint && <span className="hint">· {hint}</span>}</label>}
      <div className="input-suffix">
        <input
          type="text"
          inputMode="decimal"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
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
