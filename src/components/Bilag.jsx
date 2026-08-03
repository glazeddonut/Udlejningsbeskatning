import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api.js'
import { bilagForAar, bilagPost } from '../lib/bilag.js'
import { KONTOPLAN, posterIGruppe } from '../lib/kontoplan.js'
import { kr2, parseNum } from '../lib/format.js'
import { TextField, NumberField, SelectField } from './fields.jsx'

// Postvælgeren bygges af kontoplanen — ikke af en liste her i komponenten. Et bilag og
// en regnskabslinje skal være det samme begreb, ellers kan de to aldrig afstemmes
// (ADR-0005). De to sidste poster er ikke linjer i udlejningsresultatet, og står
// derfor for sig selv, så de ikke forveksles med de fradragsberettigede udgifter.
const valg = (p) => ({ value: p.id, label: p.label })
const POSTER = [
  { label: 'Indtægter', options: posterIGruppe('indtaegter').map(valg) },
  { label: 'Fradragsberettigede udgifter', options: posterIGruppe('udgifter').map(valg) },
  { label: 'Uden for udlejningsresultatet', options: KONTOPLAN.filter(p => !p.summerbar).map(valg) },
]
const STANDARD_POST = 'udgifter.vedligeholdelse'
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

  // Nummer og rækkefølge kommer fra ét sted (src/lib/bilag.js), ikke fra en sortering her.
  const aaretsBilag = bilagForAar(bilag, valgtAar)
  const total = aaretsBilag.reduce((s, b) => s + (b.type === 'indtaegt' ? 1 : -1) * (Number(b.beloeb) || 0), 0)

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
          {aaretsBilag.length === 0 && <p className="empty-state">Ingen bilag endnu.</p>}
          {aaretsBilag.length > 0 && (
            <table className="data">
              <thead>
                <tr><th>Nr.</th><th>Dato</th><th>Tekst</th><th>Post</th><th className="num">Beløb</th><th>Fil</th><th></th></tr>
              </thead>
              <tbody>
                {aaretsBilag.map(b => (
                  <BilagRow key={b.id} b={b} onDone={hent} />
                ))}
                <tr className="total">
                  <td colSpan={4}>Netto (indtægt − udgift)</td>
                  <td className="num">{kr2(total)}</td>
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
  const [meta, setMeta] = useState({ dato: '', tekst: '', beloeb: 0, post_id: STANDARD_POST, type: 'udgift' })
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
      setFile(null); setMeta({ dato: '', tekst: '', beloeb: 0, post_id: STANDARD_POST, type: 'udgift' })
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
        <SelectField label="Post" hint="posten i kontoplanen bilaget dokumenterer" value={meta.post_id} onChange={v => setMeta({ ...meta, post_id: v })} options={POSTER} />
        <TextField label="Tekst / beskrivelse" value={meta.tekst} onChange={v => setMeta({ ...meta, tekst: v })} placeholder="fx VVS-reparation, faktura 1234" />
        <NumberField label="Beløb" value={meta.beloeb || ''} onChange={v => setMeta({ ...meta, beloeb: parseNum(v) })} />
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
  // Kender kontoplanen ikke posten, vises den bevarede kategori markeret — den må
  // hverken forsvinde eller læses som en rigtig post. Tekst og markering kommer
  // samme sted fra, så de ikke kan komme til at sige hver sit.
  const post = bilagPost(b)
  const filUrl = `/api/bilag/${b.id}/fil`
  const slet = async () => { if (confirm(`Slet bilag ${b.nummer} (${b.tekst})?`)) { await api.del(`/bilag/${b.id}`); onDone() } }

  return (
    <tr>
      <td>{b.nummer}</td>
      <td>{b.dato}</td>
      <td>{b.tekst}</td>
      <td className={post.kendt ? undefined : 'ukendt-post'}>{post.label}</td>
      <td className="num">{kr2(b.beloeb)}</td>
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
