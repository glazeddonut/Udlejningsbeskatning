import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api.js'
import { kr, parseNum } from '../lib/format.js'
import { TextField, NumberField, SelectField } from './fields.jsx'

const KATEGORIER = [
  { value: 'Husleje', label: 'Husleje' },
  { value: 'Vand', label: 'Vand' },
  { value: 'Varme', label: 'Varme' },
  { value: 'Anden indtægt', label: 'Anden indtægt' },
  { value: 'Grundskyld', label: 'Grundskyld' },
  { value: 'Fællesudgifter', label: 'Fællesudgifter' },
  { value: 'Forsikring', label: 'Forsikring' },
  { value: 'Vedligeholdelse', label: 'Vedligeholdelse' },
  { value: 'Administration', label: 'Administration' },
  { value: 'Renovation', label: 'Renovation' },
  { value: 'Renteudgifter', label: 'Renteudgifter' },
  { value: 'Andet', label: 'Andet' },
]
const TYPER = [
  { value: 'udgift', label: 'Udgift' },
  { value: 'indtaegt', label: 'Indtægt' },
]

// Læs en fil som base64 data-URL.
function laesFil(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function Bilag({ years }) {
  const sorterede = [...years].sort((a, b) => b.aar - a.aar)
  const [valgtAar, setValgtAar] = useState(sorterede[0]?.aar ?? null)
  const [bilag, setBilag] = useState([])

  const hent = useCallback(async () => {
    if (!valgtAar) { setBilag([]); return }
    setBilag(await api.get(`/bilag?aar=${valgtAar}`))
  }, [valgtAar])
  useEffect(() => { hent() }, [hent])

  const total = bilag.reduce((s, b) => s + (b.type === 'indtaegt' ? 1 : -1) * (Number(b.beloeb) || 0), 0)

  return (
    <>
      <div className="page-header">
        <h1>Bilag</h1>
        <p>Kvitteringer og dokumentation pr. år. Kommer med i regnskabs-PDF'en (liste + billeder).</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 140 }}>
            <label>År</label>
            <select value={valgtAar ?? ''} onChange={e => setValgtAar(Number(e.target.value))}>
              {sorterede.length === 0 && <option value="">— ingen —</option>}
              {sorterede.map(y => <option key={y.id} value={y.aar}>{y.aar}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!valgtAar && <div className="card"><p className="empty-state">Opret et år under “Årets tal” først.</p></div>}

      {valgtAar && <UploadForm aar={valgtAar} onDone={hent} />}

      {valgtAar && (
        <div className="card">
          <h2>Bilag {valgtAar}</h2>
          {bilag.length === 0 && <p className="empty-state">Ingen bilag endnu.</p>}
          {bilag.length > 0 && (
            <table className="data">
              <thead>
                <tr><th>Nr.</th><th>Dato</th><th>Tekst</th><th>Kategori</th><th className="num">Beløb</th><th>Fil</th><th></th></tr>
              </thead>
              <tbody>
                {[...bilag].sort((a, b) => a.nummer - b.nummer).map(b => (
                  <BilagRow key={b.id} b={b} onDone={hent} />
                ))}
                <tr className="total">
                  <td colSpan={4}>Netto (indtægt − udgift)</td>
                  <td className="num">{kr(total)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}

function UploadForm({ aar, onDone }) {
  const [file, setFile] = useState(null)
  const [meta, setMeta] = useState({ dato: '', tekst: '', beloeb: 0, kategori: 'Vedligeholdelse', type: 'udgift' })
  const [gemmer, setGemmer] = useState(false)
  const [fejl, setFejl] = useState('')

  const gem = async () => {
    if (!file) { setFejl('Vælg en fil.'); return }
    setGemmer(true); setFejl('')
    try {
      const data = await laesFil(file)
      await api.post('/bilag', {
        aar, ...meta,
        filnavn: file.name, mimetype: file.type || 'application/octet-stream', data,
      })
      setFile(null); setMeta({ dato: '', tekst: '', beloeb: 0, kategori: 'Vedligeholdelse', type: 'udgift' })
      // nulstil fil-input
      const input = document.getElementById('bilag-fil'); if (input) input.value = ''
      onDone()
    } catch (e) {
      setFejl(e.message || 'Upload fejlede (er filen for stor? maks ~25 MB).')
    } finally {
      setGemmer(false)
    }
  }

  return (
    <div className="card">
      <h2>Tilføj bilag</h2>
      <div className="grid">
        <div className="field">
          <label>Fil <span className="hint">· billede (JPG/PNG) eller PDF</span></label>
          <input id="bilag-fil" type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files[0] || null)} />
        </div>
        <SelectField label="Type" value={meta.type} onChange={v => setMeta({ ...meta, type: v })} options={TYPER} />
        <TextField label="Dato" type="date" value={meta.dato} onChange={v => setMeta({ ...meta, dato: v })} />
        <SelectField label="Kategori" value={meta.kategori} onChange={v => setMeta({ ...meta, kategori: v })} options={KATEGORIER} />
        <TextField label="Tekst / beskrivelse" value={meta.tekst} onChange={v => setMeta({ ...meta, tekst: v })} placeholder="fx VVS-reparation, faktura 1234" />
        <NumberField label="Beløb" value={meta.beloeb} onChange={v => setMeta({ ...meta, beloeb: parseNum(v) })} />
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn primary" onClick={gem} disabled={gemmer || !file}>{gemmer ? 'Uploader…' : 'Tilføj bilag'}</button>
        {fejl && <span className="badge warn">{fejl}</span>}
      </div>
    </div>
  )
}

function BilagRow({ b, onDone }) {
  const erBillede = (b.mimetype || '').startsWith('image/')
  const filUrl = `/api/bilag/${b.id}/fil`
  const slet = async () => { if (confirm(`Slet bilag ${b.nummer} (${b.tekst})?`)) { await api.del(`/bilag/${b.id}`); onDone() } }

  return (
    <tr>
      <td>{b.nummer}</td>
      <td>{b.dato}</td>
      <td>{b.tekst}</td>
      <td>{b.kategori}</td>
      <td className="num">{kr(b.beloeb)}</td>
      <td>
        {b.filsti ? (
          <a href={filUrl} target="_blank" rel="noreferrer" title={b.filnavn}>
            {erBillede
              ? <img src={filUrl} alt={b.tekst} style={{ height: 34, width: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
              : <span>📄 PDF</span>}
          </a>
        ) : <span className="muted">—</span>}
      </td>
      <td><button className="btn danger" style={{ padding: '4px 10px', fontSize: 13 }} onClick={slet}>Slet</button></td>
    </tr>
  )
}
