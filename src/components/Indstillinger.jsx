import { useState } from 'react'
import { api } from '../lib/api.js'
import { NumberField } from './fields.jsx'
import { DEFAULT_FELTMAPPING, hentFeltmapping } from '../lib/feltmapping.js'

const ROLLE_TEKST = {
  begge: 'Begge',
  beskattet: 'Beskattet',
  ikke_beskattet: 'Ikke beskattet',
}

export default function Indstillinger({ settings, fieldMappings, years, reload }) {
  const [s, setS] = useState(settings)
  const [dirty, setDirty] = useState(false)
  const upd = (patch) => { setS({ ...s, ...patch }); setDirty(true) }
  const [fejl, setFejl] = useState('')
  // Markedsleje-advarslen er en procent og bundgrænsen et beløb. Afviser serveren
  // dem, skal det ses frem for at knappen bare ikke gør noget.
  const gem = async () => {
    try { await api.put('/settings', s) } catch (e) { setFejl(e.message); return }
    setFejl(''); setDirty(false); reload()
  }

  return (
    <>
      <div className="page-header">
        <h1>Indstillinger</h1>
        <p>Satser, beløbsgrænser og verifikation af skat.dk-feltnumre.</p>
      </div>

      <div className="card">
        <h2>Skatteordning</h2>
        <h3>Denne app er bygget til de almindelige regler (forældrekøb, kun nærtstående).</h3>
        <div className="grid">
          {/* Her stod tidligere "Feltmapping-år". Den er fjernet: året er allerede sandheden —
              Skatteindberetningen slår altid op på det valgte år og skriver selv hvilket års
              feltnumre tallene blev oversat med. Indstillingen kunne kun komme til at pege et
              andet sted hen end det der faktisk blev brugt. Genindsæt den ikke. */}
          <NumberField label="Gaveafgift, bundgrænse pr. giver" hint="VERIFICÉR pr. år" value={s.gaveafgift_bundgraense} onChange={v => upd({ gaveafgift_bundgraense: v })} />
          <NumberField label="Markedsleje-advarsel" hint="advar hvis leje er mere end X % under markedsleje" value={s.markedsleje_advarsel_pct} onChange={v => upd({ markedsleje_advarsel_pct: v })} suffix="%" />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={gem} disabled={!dirty}>Gem indstillinger</button>
          {fejl && <span className="badge warn" style={{ marginLeft: 8 }}>{fejl}</span>}
        </div>
      </div>

      <FeltmappingEditor fieldMappings={fieldMappings} years={years} reload={reload} />
    </>
  )
}

function FeltmappingEditor({ fieldMappings, years, reload }) {
  // Tilgængelige år: dem der findes i data, default-årene, og de år der allerede er
  // rettet i DB'en. (Årslisten hentede tidligere også indstillingen `feltmapping_aar`;
  // den findes ikke længere — overrides-nøglerne dækker samme behov og er ægte data.)
  const aarSet = new Set([
    ...years.map(y => y.aar),
    ...Object.keys(DEFAULT_FELTMAPPING).map(Number),
    ...Object.keys(fieldMappings || {}).map(k => Number(String(k).split('-')[0])),
  ].filter(a => Number.isFinite(a)))
  const aarListe = [...aarSet].sort((a, b) => b - a)

  const [aar, setAar] = useState(aarListe[0])
  const [doktype, setDoktype] = useState('forskud')
  const [raekker, setRaekker] = useState(() => hentFeltmapping(aarListe[0], 'forskud', fieldMappings).felter.map(r => ({ ...r })))
  const [dirty, setDirty] = useState(false)

  const skift = (nyAar, nyDoktype) => {
    setAar(nyAar); setDoktype(nyDoktype)
    setRaekker(hentFeltmapping(nyAar, nyDoktype, fieldMappings).felter.map(r => ({ ...r })))
    setDirty(false)
  }

  const setFeltNr = (i, v) => {
    setRaekker(prev => prev.map((r, idx) => idx === i ? { ...r, felt_nr: v, usikker: false } : r))
    setDirty(true)
  }

  const gem = async () => {
    const key = `${aar}-${doktype}`
    await api.put('/field-mappings', { ...fieldMappings, [key]: raekker })
    setDirty(false)
    reload()
  }
  const nulstil = async () => {
    const key = `${aar}-${doktype}`
    const { [key]: _fjernet, ...resten } = fieldMappings
    await api.put('/field-mappings', resten)
    setRaekker(hentFeltmapping(aar, doktype, resten).felter.map(r => ({ ...r })))
    setDirty(false)
    reload()
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>skat.dk-feltnumre</h2>
          <h3>Ret og verificér feltnumrene mod skat.dk. Ændringer gemmes pr. år og doktype.</h3>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="field" style={{ minWidth: 120 }}>
          <label>År</label>
          <select value={aar} onChange={e => skift(Number(e.target.value), doktype)}>
            {aarListe.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn ${doktype === 'forskud' ? 'primary' : 'ghost'}`} onClick={() => skift(aar, 'forskud')}>Forskud</button>
          <button className={`btn ${doktype === 'selvangivelse' ? 'primary' : 'ghost'}`} onClick={() => skift(aar, 'selvangivelse')}>Selvangivelse</button>
        </div>
      </div>

      <table className="data">
        <thead>
          <tr><th style={{ width: 120 }}>Feltnr.</th><th>Betegnelse</th><th style={{ width: 120 }}>Gælder</th><th style={{ width: 90 }}>Status</th></tr>
        </thead>
        <tbody>
          {raekker.map((r, i) => (
            <tr key={i}>
              <td><input value={r.felt_nr} onChange={e => setFeltNr(i, e.target.value)} style={{ maxWidth: 100 }} /></td>
              <td>{r.label}</td>
              <td className="muted" style={{ fontSize: 13 }}>{ROLLE_TEKST[r.rolle] || 'Begge'}</td>
              <td>{r.usikker ? <span className="badge warn">verificér</span> : <span className="badge ok">bekræftet</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={gem} disabled={!dirty}>Gem feltnumre</button>
        <button className="btn ghost" onClick={nulstil}>Nulstil til standard</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Når du retter et feltnummer, markeres rækken som “bekræftet”. Standardværdierne er kun et bedste bud.
      </p>
    </div>
  )
}
