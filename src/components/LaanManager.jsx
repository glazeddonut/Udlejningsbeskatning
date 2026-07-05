import { useState } from 'react'
import { api } from '../lib/api.js'
import { parseNum, kr, pct } from '../lib/format.js'
import { TextField, NumberField, SelectField } from './fields.jsx'

const TYPER = [
  { value: 'realkredit', label: 'Realkreditlån' },
  { value: 'bank', label: 'Banklån' },
]

function standardHaeftelse(persons) {
  const h = {}
  if (persons.length > 0) {
    const each = Math.round((100 / persons.length) * 100) / 100
    persons.forEach((p, i) => { h[p.id] = i === persons.length - 1 ? 100 - each * (persons.length - 1) : each })
  }
  return h
}

// Lån i lejligheden. Renter fordeles mellem ægtefællerne efter hæftelse.
export default function LaanManager({ loans, persons, reload }) {
  const [visNy, setVisNy] = useState(false)

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Lån</h2>
          <h3>Realkredit- og banklån i lejligheden. Hæftelse styrer rentefordelingen.</h3>
        </div>
        {!visNy && <button className="btn ghost" onClick={() => setVisNy(true)}>+ Tilføj lån</button>}
      </div>

      {loans.length === 0 && !visNy && <p className="empty-state">Ingen lån tilføjet endnu.</p>}

      {loans.map(l => (
        <LaanRow key={l.id} loan={l} persons={persons} reload={reload} />
      ))}

      {visNy && (
        <LaanForm
          persons={persons}
          onCancel={() => setVisNy(false)}
          onSave={async (data) => { await api.post('/loans', data); setVisNy(false); reload() }}
        />
      )}
    </div>
  )
}

function LaanRow({ loan, persons, reload }) {
  const [rediger, setRediger] = useState(false)
  const haefteTekst = persons.map(p => `${p.navn || 'Ejer'}: ${pct(loan.haeftelse?.[p.id] || 0)}`).join(' · ')

  if (rediger) {
    return (
      <LaanForm
        initial={loan}
        persons={persons}
        onCancel={() => setRediger(false)}
        onSave={async (data) => { await api.put(`/loans/${loan.id}`, data); setRediger(false); reload() }}
        onDelete={async () => { if (confirm('Slet lånet?')) { await api.del(`/loans/${loan.id}`); reload() } }}
      />
    )
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div>
        <strong>{loan.laangiver || (loan.type === 'realkredit' ? 'Realkreditlån' : 'Banklån')}</strong>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Restgæld {kr(loan.restgaeld)} · rente {pct(loan.rente_pct)} · {haefteTekst}
        </div>
      </div>
      <button className="btn ghost" onClick={() => setRediger(true)}>Rediger</button>
    </div>
  )
}

function LaanForm({ initial, persons, onSave, onCancel, onDelete }) {
  const [l, setL] = useState(initial || {
    type: 'realkredit', laangiver: '', hovedstol: 0, restgaeld: 0, rente_pct: 0,
    haeftelse: standardHaeftelse(persons),
  })
  const upd = (patch) => setL({ ...l, ...patch })
  const updHaefte = (pid, v) => setL({ ...l, haeftelse: { ...l.haeftelse, [pid]: parseNum(v) } })
  const haefteSum = persons.reduce((s, p) => s + (Number(l.haeftelse?.[p.id]) || 0), 0)
  const haefteOk = Math.abs(haefteSum - 100) < 0.01 || persons.length === 0

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="grid">
        <SelectField label="Type" value={l.type} onChange={v => upd({ type: v })} options={TYPER} />
        <TextField label="Långiver" value={l.laangiver} onChange={v => upd({ laangiver: v })} placeholder="fx Totalkredit / Nordea" />
        <NumberField label="Hovedstol" value={l.hovedstol} onChange={v => upd({ hovedstol: parseNum(v) })} />
        <NumberField label="Restgæld" hint="pr. 31.12" value={l.restgaeld} onChange={v => upd({ restgaeld: parseNum(v) })} />
        <NumberField label="Rente" value={l.rente_pct} onChange={v => upd({ rente_pct: parseNum(v) })} suffix="%" />
      </div>

      <div style={{ marginTop: 14 }}>
        <h3>Hæftelse</h3>
        <div className="grid">
          {persons.map(p => (
            <NumberField key={p.id} label={p.navn || 'Ejer'} value={l.haeftelse?.[p.id] ?? ''} onChange={v => updHaefte(p.id, v)} suffix="%" />
          ))}
        </div>
        {persons.length > 0 && !haefteOk && <p style={{ marginTop: 8 }}><span className="badge warn">Sum: {pct(haefteSum)} — skal give 100 %</span></p>}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={() => onSave(l)}>Gem lån</button>
        <button className="btn ghost" onClick={onCancel}>Annullér</button>
        {onDelete && <button className="btn danger" onClick={onDelete} style={{ marginLeft: 'auto' }}>Slet</button>}
      </div>
    </div>
  )
}
