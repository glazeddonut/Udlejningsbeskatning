import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { genererRegnskabPdf } from '../lib/pdf.js'
import { aarsopgoerelse } from '../lib/aarsopgoerelse.js'

// Årsregnskabet er en ren tabelrenderer af opstillingen fra aarsopgoerelse.js.
// Alt indhold — hoved, sektioner, rækker, bilagsoversigt og note — kommer derfra,
// så skærmen og PDF'en viser det samme regnskab og ikke kan drive fra hinanden.
// Den eneste forskel er de vedhæftede bilagsfiler, som kun PDF'en kan bære.

export default function Aarsregnskab({ years, persons, property, loans, leases, settings }) {
  const sorterede = [...years].sort((a, b) => b.aar - a.aar)
  const [valgtAar, setValgtAar] = useState(sorterede[0]?.aar ?? null)
  const [grundlag, setGrundlag] = useState('faktisk')  // regnskab bygger normalt på faktiske tal
  const [bilag, setBilag] = useState([])
  const [genererer, setGenererer] = useState(false)

  // Bilagene hentes rå (alle år) — årsopgørelsen filtrerer og nummererer dem selv,
  // så bilagsoversigten på skærmen og i PDF'en kommer samme sted fra.
  useEffect(() => {
    let aktiv = true
    api.get('/bilag').then(b => { if (aktiv) setBilag(b) }).catch(() => { if (aktiv) setBilag([]) })
    return () => { aktiv = false }
  }, [])

  const opgoerelse = aarsopgoerelse({
    aar: valgtAar, grundlag, years, leases, persons, property, loans, settings, bilag,
  })

  const hentPdf = async () => {
    if (!opgoerelse) return
    setGenererer(true)
    try {
      const bytes = await genererRegnskabPdf(opgoerelse)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `regnskab-${opgoerelse.aar}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Kunne ikke generere PDF: ' + (e.message || e))
    } finally {
      setGenererer(false)
    }
  }

  return (
    <>
      <div className="page-header no-print">
        <h1>Årsregnskab</h1>
        <p>Print-venligt regnskab for udlejningen pr. år (lovkrav ved forældrekøb).</p>
      </div>

      <div className="card no-print">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 140 }}>
            <label>År</label>
            <select value={valgtAar ?? ''} onChange={e => setValgtAar(Number(e.target.value))}>
              {sorterede.length === 0 && <option value="">— ingen —</option>}
              {sorterede.map(y => <option key={y.id} value={y.aar}>{y.aar}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label>Grundlag</label>
            <select value={grundlag} onChange={e => setGrundlag(e.target.value)}>
              <option value="faktisk">Faktiske tal (selvangivelse)</option>
              <option value="budget">Budget (forskud)</option>
            </select>
          </div>
          {/* Ét regnskab, to måder at få det ud af skærmen på — knapperne må ikke
              antyde to forskellige dokumenter. */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => window.print()} disabled={!opgoerelse}>🖨 Print regnskabet</button>
            <button className="btn primary" onClick={hentPdf} disabled={!opgoerelse || genererer}>
              {genererer ? 'Genererer…' : '⬇ Gem som PDF (med bilagsfiler)'}
            </button>
          </div>
        </div>
      </div>

      {!opgoerelse && <div className="card no-print"><p className="empty-state">Opret et år under “Årets tal” først.</p></div>}

      {opgoerelse && <Opstilling opstilling={opgoerelse.opstilling} />}
    </>
  )
}

function Opstilling({ opstilling }) {
  const { hoved, sektioner, bilagsoversigt, note } = opstilling
  return (
    <div className="regnskab">
      <div className="rg-head">
        <h2>{hoved.overskrift}</h2>
        <div className="rg-meta">
          {hoved.linjer.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>

      {sektioner.map(s => (
        <section key={s.id}>
          <h3 className="rg-sektion">{s.titel}</h3>
          <table className="rg">
            <tbody>
              {s.raekker.map(r => (
                <tr key={r.id} className={[r.sum ? 'sum' : '', r.hjemloes ? 'hjemloes' : ''].filter(Boolean).join(' ')}>
                  <td>{r.label}</td>
                  <td className="num">{r.vaerdi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h3 className="rg-sektion">{bilagsoversigt.titel}</h3>
      {bilagsoversigt.antal === 0 ? (
        <table className="rg"><tbody><tr><td>{bilagsoversigt.tom_tekst}</td><td className="num" /></tr></tbody></table>
      ) : (
        <table className="rg">
          <thead>
            <tr>
              {bilagsoversigt.kolonner.map(k => (
                <th key={k.id} className={k.num ? 'num' : undefined}>{k.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bilagsoversigt.raekker.map(r => (
              <tr key={r.id}>
                {bilagsoversigt.kolonner.map(k => (
                  <td key={k.id} className={k.num ? 'num' : undefined}>{r.celler[k.id]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="rg-note">{note}</p>
    </div>
  )
}
