import { useState } from 'react'
import { api } from '../lib/api.js'
import { parseNum, kr } from '../lib/format.js'
import { TextField, NumberField } from './fields.jsx'

const tomLejekontrakt = () => ({
  lejer_navn: '', lejer_cpr: '', startdato: '', slutdato: '',
  maanedlig_leje: 0, forbrug_aconto: { vand: 0, varme: 0 },
  depositum: 0, forudbetalt_leje: 0, markedsleje_maanedlig_skoen: 0,
})

// Lejekontrakt til datteren. Markedsleje-skøn bruges til at advare mod for lav leje (gave).
export default function LejekontraktManager({ lease, reload }) {
  const [l, setL] = useState(lease || tomLejekontrakt())
  const [dirty, setDirty] = useState(false)
  const upd = (patch) => { setL({ ...l, ...patch }); setDirty(true) }
  const updForbrug = (key, v) => { setL({ ...l, forbrug_aconto: { ...l.forbrug_aconto, [key]: parseNum(v) } }); setDirty(true) }

  const gem = async () => { await api.put('/lease', l); setDirty(false); reload() }

  const aarsleje = (Number(l.maanedlig_leje) || 0) * 12
  const markedsAarsleje = (Number(l.markedsleje_maanedlig_skoen) || 0) * 12

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Lejekontrakt</h2>
          <h3>Udlejning til datteren. Lejen skal svare til markedslejen.</h3>
        </div>
      </div>

      <div className="grid">
        <TextField label="Lejers navn" value={l.lejer_navn} onChange={v => upd({ lejer_navn: v })} />
        <TextField label="Lejers CPR" hint="valgfrit" value={l.lejer_cpr} onChange={v => upd({ lejer_cpr: v })} placeholder="ddmmåå-xxxx" />
        <TextField label="Startdato" type="date" value={l.startdato} onChange={v => upd({ startdato: v })} />
        <TextField label="Slutdato" hint="valgfrit" type="date" value={l.slutdato} onChange={v => upd({ slutdato: v })} />
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

      <div style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={gem} disabled={!dirty}>Gem lejekontrakt</button>
      </div>
    </div>
  )
}
