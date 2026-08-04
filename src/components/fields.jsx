// Genbrugelige formular-felter. Holder styling og markup ensartet på tværs af faner.
import { useState, useEffect } from 'react'
import { daNum, indtastetTal } from '../lib/format.js'

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

// Talfelt med enhed-suffiks (fx "kr.", "%", "dage").
//
// Feltet holder den rå tekst i sin EGEN state, så decimaler ("1250,50") og halvt tastede
// tal ("1250,") kan stå i feltet uden at blive normaliseret væk ved hvert tastetryk — men
// det leverer et TAL ud (indtastetTal). Teksten er feltets egen sag; tallet er kaldestedets.
// Ellers skulle hvert eneste kaldested huske at parse, og ét glemt kald ville gemme en
// streng i databasen. Et tomt felt leverer `null` (uoplyst), ikke 0 — se indtastetTal.
//
// `labelExtra` er indhold i labelens højre side, og `children` er linjer under feltet.
// De to slots er grunden til at beløbsfeltet med pro rata-afkrydsning i Årets tal kan
// være en VARIANT af dette felt frem for en kopi af det.
export function NumberField({ label, hint, value, onChange, suffix = 'kr.', labelExtra, children }) {
  const [text, setText] = useState(() => daNum(value))
  const [focus, setFocus] = useState(false)
  // Synk fra prop når feltet ikke er i fokus (fanger eksterne ændringer, fx "Kopiér fra budget").
  useEffect(() => { if (!focus) setText(daNum(value)) }, [value, focus])
  // Teksten bliver stående ordret som den er tastet; kun tallet gives videre.
  const skriv = (raa) => { setText(raa); onChange(indtastetTal(raa)) }
  const etiket = <>{label} {hint && <span className="hint">· {hint}</span>}</>
  return (
    <div className="field">
      {(label || labelExtra) && (labelExtra
        ? (
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{etiket}</span>
            {labelExtra}
          </label>
        )
        : <label>{etiket}</label>)}
      <div className="input-suffix">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={e => skriv(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{ paddingRight: `${Math.max(42, String(suffix).length * 9 + 22)}px` }}
        />
        <span className="suffix">{suffix}</span>
      </div>
      {children}
    </div>
  )
}

// En valgmulighed er enten { value, label } eller en gruppe { label, options: [...] },
// som bliver til en <optgroup>. Grupperne bruges af bilagenes postvælger, hvor
// indtægter, fradragsberettigede udgifter og posterne uden for udlejningsresultatet
// ikke må kunne forveksles.
//
// Selve valgmulighederne står for sig, fordi de samme poster også skal kunne vises i en
// vælger der IKKE er et formularfelt — rettevejen for et bilag med ukendt post bor i en
// tabelcelle (#19). Grupperingen hører til valgmulighederne, ikke til feltet omkring dem.
export function Valgmuligheder({ options }) {
  const valg = (o) => <option key={o.value} value={o.value}>{o.label}</option>
  return options.map(o => (o.options
    ? <optgroup key={o.label} label={o.label}>{o.options.map(valg)}</optgroup>
    : valg(o)))
}

export function SelectField({ label, hint, value, onChange, options }) {
  return (
    <div className="field">
      {label && <label>{label} {hint && <span className="hint">· {hint}</span>}</label>}
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <Valgmuligheder options={options} />
      </select>
    </div>
  )
}
