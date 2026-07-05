import { useState } from 'react'
import { api } from '../lib/api.js'
import { parseNum, pct } from '../lib/format.js'
import { TextField, NumberField, SelectField } from './fields.jsx'

const TYPER = [
  { value: 'ejerlejlighed', label: 'Ejerlejlighed' },
  { value: 'hus', label: 'Hus' },
  { value: 'andet', label: 'Andet' },
]

const tomEjendom = (persons) => ({
  navn: '', adresse: '', type: 'ejerlejlighed', koebsdato: '',
  anskaffelsessum: 0, forbedringer_foer_udlejning: 0, grundskyld_aarlig: 0,
  ejerandele: standardAndele(persons),
})

// Standard: fordel 100 % ligeligt mellem ejerne (to ægtefæller → 50/50).
function standardAndele(persons) {
  const andele = {}
  if (persons.length > 0) {
    const each = Math.round((100 / persons.length) * 100) / 100
    persons.forEach((p, i) => { andele[p.id] = i === persons.length - 1 ? 100 - each * (persons.length - 1) : each })
  }
  return andele
}

export default function EjendomStamdata({ property, persons, reload }) {
  const [e, setE] = useState(property || tomEjendom(persons))
  const [dirty, setDirty] = useState(false)
  const upd = (patch) => { setE({ ...e, ...patch }); setDirty(true) }
  const updAndel = (pid, v) => { setE({ ...e, ejerandele: { ...e.ejerandele, [pid]: parseNum(v) } }); setDirty(true) }

  const gem = async () => { await api.put('/property', e); setDirty(false); reload() }

  const andelSum = persons.reduce((s, p) => s + (Number(e.ejerandele?.[p.id]) || 0), 0)
  const andelOk = Math.abs(andelSum - 100) < 0.01 || persons.length === 0

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Lejligheden</h2>
          <h3>Stamdata om ejendommen. Indtastes én gang.</h3>
        </div>
      </div>

      <div className="grid">
        <TextField label="Navn / kaldenavn" value={e.navn} onChange={v => upd({ navn: v })} placeholder="fx Dronning Margrethes Vej 3" />
        <TextField label="Adresse" value={e.adresse} onChange={v => upd({ adresse: v })} />
        <SelectField label="Type" value={e.type} onChange={v => upd({ type: v })} options={TYPER} />
        <TextField label="Købsdato" type="date" value={e.koebsdato} onChange={v => upd({ koebsdato: v })} />
        <NumberField label="Anskaffelsessum" hint="inkl. købsomkostninger" value={e.anskaffelsessum} onChange={v => upd({ anskaffelsessum: parseNum(v) })} />
        <NumberField label="Forbedringer før udlejning" hint="ikke fradrag — tillægges anskaffelsessum" value={e.forbedringer_foer_udlejning} onChange={v => upd({ forbedringer_foer_udlejning: parseNum(v) })} />
        <NumberField label="Grundskyld (ejendomsskat) pr. år" value={e.grundskyld_aarlig} onChange={v => upd({ grundskyld_aarlig: parseNum(v) })} />
      </div>

      <div style={{ marginTop: 18 }}>
        <h3>Ejerandele</h3>
        {persons.length === 0 && <p className="muted">Tilføj ejere først for at fordele ejerandele.</p>}
        <div className="grid">
          {persons.map(p => (
            <NumberField
              key={p.id}
              label={p.navn || 'Ejer'}
              value={e.ejerandele?.[p.id] ?? ''}
              onChange={v => updAndel(p.id, v)}
              suffix="%"
            />
          ))}
        </div>
        {persons.length > 0 && (
          <p style={{ marginTop: 8 }}>
            {andelOk
              ? <span className="badge ok">Sum: {pct(andelSum)}</span>
              : <span className="badge warn">Sum: {pct(andelSum)} — skal give 100 %</span>}
          </p>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={gem} disabled={!dirty}>Gem lejlighed</button>
      </div>
    </div>
  )
}
