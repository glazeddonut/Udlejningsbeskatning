import { useState } from 'react'
import { api } from '../lib/api.js'
import { TextField, SelectField } from './fields.jsx'

const ROLLER = [
  { value: 'udlejer', label: 'Udlejer (officiel)' },
  { value: 'medejer', label: 'Medejer' },
]

// Ægtefællerne. Typisk to personer: den ene "udlejer" (officiel), den anden "medejer".
export default function EjereManager({ persons, reload }) {
  const [ny, setNy] = useState({ navn: '', cpr: '', rolle: 'udlejer' })

  const tilfoej = async () => {
    if (!ny.navn.trim()) return
    await api.post('/persons', ny)
    setNy({ navn: '', cpr: '', rolle: 'medejer' })
    reload()
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Ejere</h2>
          <h3>Jer to ægtefæller. Bruges til fordeling af resultat og renter.</h3>
        </div>
      </div>

      {persons.length === 0 && <p className="empty-state">Ingen ejere tilføjet endnu.</p>}

      {persons.map(p => (
        <PersonRow key={p.id} person={p} reload={reload} />
      ))}

      {persons.length < 2 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <h3>Tilføj ejer</h3>
          <div className="grid">
            <TextField label="Navn" value={ny.navn} onChange={v => setNy({ ...ny, navn: v })} />
            <TextField label="CPR" hint="valgfrit" value={ny.cpr} onChange={v => setNy({ ...ny, cpr: v })} placeholder="ddmmåå-xxxx" />
            <SelectField label="Rolle" value={ny.rolle} onChange={v => setNy({ ...ny, rolle: v })} options={ROLLER} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={tilfoej} disabled={!ny.navn.trim()}>Tilføj ejer</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PersonRow({ person, reload }) {
  const [p, setP] = useState(person)
  const [dirty, setDirty] = useState(false)
  const upd = (patch) => { setP({ ...p, ...patch }); setDirty(true) }

  const gem = async () => { await api.put(`/persons/${p.id}`, p); setDirty(false); reload() }
  const slet = async () => { if (confirm(`Slet ${p.navn}?`)) { await api.del(`/persons/${p.id}`); reload() } }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="grid">
        <TextField label="Navn" value={p.navn} onChange={v => upd({ navn: v })} />
        <TextField label="CPR" hint="valgfrit" value={p.cpr} onChange={v => upd({ cpr: v })} placeholder="ddmmåå-xxxx" />
        <SelectField label="Rolle" value={p.rolle} onChange={v => upd({ rolle: v })} options={ROLLER} />
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={gem} disabled={!dirty}>Gem</button>
        <button className="btn danger" onClick={slet}>Slet</button>
      </div>
    </div>
  )
}
