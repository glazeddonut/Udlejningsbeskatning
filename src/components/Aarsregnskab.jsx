import { useState } from 'react'
import { api } from '../lib/api.js'
import { kr } from '../lib/format.js'
import { normaliserSaet } from '../lib/saet.js'
import { genererRegnskabPdf } from '../lib/pdf.js'
import {
  sumIndtaegter, sumFradragsUdgifter, resultatFoerRenter, sumRenter, personOpgoerelse, resolveFordeling,
} from '../lib/beregning.js'

const INDTAEGT_RAEKKER = [
  ['leje', 'Husleje (ekskl. forbrug)'],
  ['vand', 'Vand (opkrævet)'],
  ['varme', 'Varme (opkrævet)'],
  ['andet', 'Anden indtægt'],
]
const UDGIFT_RAEKKER = [
  ['grundskyld', 'Grundskyld (ejendomsskat)'],
  ['faellesudgifter', 'Fællesudgifter (drift)'],
  ['forsikring', 'Forsikring'],
  ['vedligeholdelse', 'Vedligeholdelse'],
  ['vand', 'Vand (afholdt)'],
  ['varme', 'Varme (afholdt)'],
  ['administration', 'Administration'],
  ['renovation', 'Renovation'],
  ['andet', 'Andet'],
]

export default function Aarsregnskab({ years, persons, property, loans, settings }) {
  const sorterede = [...years].sort((a, b) => b.aar - a.aar)
  const [valgtAar, setValgtAar] = useState(sorterede[0]?.aar ?? null)
  const [grundlag, setGrundlag] = useState('faktisk')  // regnskab bygger normalt på faktiske tal

  const [genererer, setGenererer] = useState(false)
  const year = years.find(y => y.aar === valgtAar)
  const saet = year ? normaliserSaet(year[grundlag]) : null

  const downloadPdf = async () => {
    if (!year || !saet) return
    setGenererer(true)
    try {
      const bilag = await api.get(`/bilag?aar=${year.aar}`)
      const bytes = await genererRegnskabPdf({ year, saet, grundlag, persons, property, loans, settings, bilag })
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `regnskab-${year.aar}.pdf`; a.click()
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => window.print()} disabled={!year}>🖨 Print</button>
            <button className="btn primary" onClick={downloadPdf} disabled={!year || genererer}>{genererer ? 'Genererer…' : '⬇ Download PDF (med bilag)'}</button>
          </div>
        </div>
      </div>

      {!year && <div className="card no-print"><p className="empty-state">Opret et år under “Årets tal” først.</p></div>}

      {year && saet && (
        <Regnskab saet={saet} year={year} grundlag={grundlag} persons={persons} property={property} loans={loans} settings={settings} />
      )}
    </>
  )
}

function Regnskab({ saet, year, grundlag, persons, property, loans, settings }) {
  const indt = sumIndtaegter(saet)
  const udg = sumFradragsUdgifter(saet)
  const resultat = resultatFoerRenter(saet)
  const renter = sumRenter(saet)
  const opg = personOpgoerelse(saet, { persons, property, loans, fordeling: resolveFordeling(settings, persons) })

  return (
    <div className="regnskab">
      <div className="rg-head">
        <h2>Regnskab for udlejning · {year.aar}</h2>
        <div className="rg-meta">
          {property?.navn || 'Ejendom'}{property?.adresse ? `, ${property.adresse}` : ''}<br />
          Ejere: {persons.map(p => `${p.navn} (${property?.ejerandele?.[p.id] ?? 0} %)`).join(' · ')}<br />
          Grundlag: {grundlag === 'faktisk' ? 'faktiske tal' : 'budget'} · Udlejet til nærtstående: {saet.naertstaaende ? 'ja' : 'nej'} · {saet.udlejningsdage} udlejningsdage
        </div>
      </div>

      <h3 className="rg-sektion">Indtægter</h3>
      <table className="rg">
        <tbody>
          {INDTAEGT_RAEKKER.filter(([k]) => saet.indtaegter[k]).map(([k, label]) => (
            <tr key={k}><td>{label}</td><td className="num">{kr(saet.indtaegter[k])}</td></tr>
          ))}
          <tr className="sum"><td>Indtægter i alt</td><td className="num">{kr(indt)}</td></tr>
        </tbody>
      </table>

      <h3 className="rg-sektion">Fradragsberettigede udgifter</h3>
      <table className="rg">
        <tbody>
          {UDGIFT_RAEKKER.filter(([k]) => saet.udgifter[k]).map(([k, label]) => (
            <tr key={k}><td>{label}</td><td className="num">{kr(saet.udgifter[k])}</td></tr>
          ))}
          <tr className="sum"><td>Udgifter i alt</td><td className="num">{kr(udg)}</td></tr>
        </tbody>
      </table>

      <h3 className="rg-sektion">Resultat</h3>
      <table className="rg">
        <tbody>
          <tr className="sum"><td>Udlejningsresultat før renter</td><td className="num">{kr(resultat)}</td></tr>
        </tbody>
      </table>

      <h3 className="rg-sektion">Fordeling pr. ejer</h3>
      <table className="rg">
        <tbody>
          {opg.map(o => (
            <tr key={o.personId}>
              <td>
                {o.navn}{o.erBeskattet ? '' : ' (beskattes ikke)'} — resultat {kr(o.resultatAndel)}, renter {kr(o.renter)}
              </td>
              <td className="num">{kr(o.nettoKapitalindkomst)}</td>
            </tr>
          ))}
          <tr className="sum"><td>Renteudgifter i alt (personlige, kapitalindkomst)</td><td className="num">{kr(renter)}</td></tr>
        </tbody>
      </table>

      {saet.forbedringer > 0 && (
        <>
          <h3 className="rg-sektion">Forbedringer (ikke fradrag)</h3>
          <table className="rg">
            <tbody>
              <tr><td>Forbedringer i året — tillægges anskaffelsessummen</td><td className="num">{kr(saet.forbedringer)}</td></tr>
            </tbody>
          </table>
        </>
      )}

      <p className="rg-note">
        Regnskabet er udarbejdet efter de almindelige skatteregler for udlejning til nærtstående
        (forældrekøb). Renteudgifter er personlige (kapitalindkomst) og indgår ikke i
        udlejningsresultatet. Forbedringsudgifter er ikke fradragsberettigede.
        Beløb er baseret på de indtastede tal og skal verificeres mod bilag og skat.dk.
      </p>
    </div>
  )
}
