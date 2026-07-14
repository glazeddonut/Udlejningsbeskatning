import { useState } from 'react'
import { api } from '../lib/api.js'
import { parseNum, kr } from '../lib/format.js'
import { TextField, NumberField } from './fields.jsx'

const tomLejekontrakt = () => ({
  lejer_navn: '', lejer_cpr: '', startdato: '', slutdato: '',
  maanedlig_leje: 0, forbrug_aconto: { vand: 0, varme: 0 },
  depositum: 0, forudbetalt_leje: 0, markedsleje_maanedlig_skoen: 0,
})

const periodeTekst = (l) => {
  const start = l.startdato || '—'
  const slut = l.slutdato || 'åben'
  return `${start} → ${slut}`
}

// Lejekontrakter til datteren. Flere versioner kan dække forskellige perioder;
// et års "Årets tal" prefiller automatisk fra den kontrakt der er aktiv i året.
// Markedsleje-skøn bruges til at advare mod for lav leje (gave).
export default function LejekontraktManager({ leases, reload }) {
  const [visNy, setVisNy] = useState(false)
  const sorterede = [...(leases || [])].sort((a, b) => (a.startdato || '').localeCompare(b.startdato || ''))

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Lejekontrakter</h2>
          <h3>Udlejning til datteren. Lav en version pr. periode — lejen skal svare til markedslejen.</h3>
        </div>
        {!visNy && <button className="btn ghost" onClick={() => setVisNy(true)}>+ Tilføj lejekontrakt</button>}
      </div>

      {sorterede.length === 0 && !visNy && <p className="empty-state">Ingen lejekontrakt tilføjet endnu.</p>}

      {sorterede.map(l => (
        <LejeRow key={l.id} lease={l} reload={reload} />
      ))}

      {visNy && (
        <LejeForm
          onCancel={() => setVisNy(false)}
          onSave={async (data) => { await api.post('/leases', data); setVisNy(false); reload() }}
        />
      )}
    </div>
  )
}

function LejeRow({ lease, reload }) {
  const [rediger, setRediger] = useState(false)

  if (rediger) {
    return (
      <LejeForm
        initial={lease}
        onCancel={() => setRediger(false)}
        onSave={async (data) => { await api.put(`/leases/${lease.id}`, data); setRediger(false); reload() }}
        onDelete={async () => { if (confirm('Slet lejekontrakten?')) { await api.del(`/leases/${lease.id}`); reload() } }}
      />
    )
  }

  const aarsleje = (Number(lease.maanedlig_leje) || 0) * 12
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div>
        <strong>{lease.lejer_navn || 'Lejekontrakt'}</strong>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {periodeTekst(lease)} · leje {kr(lease.maanedlig_leje)}/md ({kr(aarsleje)}/år)
        </div>
      </div>
      <button className="btn ghost" onClick={() => setRediger(true)}>Rediger</button>
    </div>
  )
}

function LejeForm({ initial, onSave, onCancel, onDelete }) {
  const [l, setL] = useState(initial || tomLejekontrakt())
  const upd = (patch) => setL({ ...l, ...patch })
  const updForbrug = (key, v) => setL({ ...l, forbrug_aconto: { ...l.forbrug_aconto, [key]: parseNum(v) } })

  const aarsleje = (Number(l.maanedlig_leje) || 0) * 12
  const markedsAarsleje = (Number(l.markedsleje_maanedlig_skoen) || 0) * 12

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="grid">
        <TextField label="Lejers navn" value={l.lejer_navn} onChange={v => upd({ lejer_navn: v })} />
        <TextField label="Lejers CPR" hint="valgfrit" value={l.lejer_cpr} onChange={v => upd({ lejer_cpr: v })} placeholder="ddmmåå-xxxx" />
        <TextField label="Startdato" type="date" value={l.startdato} onChange={v => upd({ startdato: v })} />
        <TextField label="Slutdato" hint="valgfrit — åben hvis tom" type="date" value={l.slutdato} onChange={v => upd({ slutdato: v })} />
        <NumberField label="Månedlig leje" hint="ekskl. forbrug" value={l.maanedlig_leje} onChange={v => upd({ maanedlig_leje: parseNum(v) })} />
        <NumberField label="Markedsleje pr. måned (skøn)" hint="til gave-/markedsleje-tjek" value={l.markedsleje_maanedlig_skoen} onChange={v => upd({ markedsleje_maanedlig_skoen: parseNum(v) })} />
        <NumberField label="Aconto vand pr. måned" value={l.forbrug_aconto?.vand} onChange={v => updForbrug('vand', v)} />
        <NumberField label="Aconto varme pr. måned" value={l.forbrug_aconto?.varme} onChange={v => updForbrug('varme', v)} />
        <NumberField label="Depositum" value={l.depositum} onChange={v => upd({ depositum: parseNum(v) })} />
        <NumberField label="Forudbetalt leje" value={l.forudbetalt_leje} onChange={v => upd({ forudbetalt_leje: parseNum(v) })} />
      </div>

      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
        Årsleje: <strong>{kr(aarsleje)}</strong>
        {markedsAarsleje > 0 && <> · Markedsleje (skøn): <strong>{kr(markedsAarsleje)}</strong></>}
      </p>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={() => onSave(l)}>Gem lejekontrakt</button>
        <button className="btn ghost" onClick={onCancel}>Annullér</button>
        {onDelete && <button className="btn danger" onClick={onDelete} style={{ marginLeft: 'auto' }}>Slet</button>}
      </div>
    </div>
  )
}
