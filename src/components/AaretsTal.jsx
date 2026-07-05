import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { parseNum, kr } from '../lib/format.js'
import { NumberField, SelectField } from './fields.jsx'
import {
  tomtSaet, sumIndtaegter, sumFradragsUdgifter, resultatFoerRenter,
  sumRenter, personOpgoerelse, resolveFordeling,
  antalMaaneder, udlejningsdage, erProrata, effektivBeloeb, estimeretAarligRente,
} from '../lib/beregning.js'
import { normaliserSaet } from '../lib/saet.js'

const MAANEDER = [
  ['1', 'Januar'], ['2', 'Februar'], ['3', 'Marts'], ['4', 'April'], ['5', 'Maj'], ['6', 'Juni'],
  ['7', 'Juli'], ['8', 'August'], ['9', 'September'], ['10', 'Oktober'], ['11', 'November'], ['12', 'December'],
].map(([value, label]) => ({ value, label }))

// Nyt talsæt med fornuftige defaults fra stamdata (leje, forbrug, grundskyld).
function prefillSaet({ lease, property, loans }) {
  const s = tomtSaet()
  // Renter estimeres fra lånenes restgæld × rente (budget-skøn; rettes med faktiske tal).
  ;(loans || []).forEach(l => { s.renteudgifter[l.id] = estimeretAarligRente(l) })
  if (lease) {
    // Løbende poster forudfyldes som MÅNEDSBELØB med pro rata slået til,
    // så udlejningsperioden automatisk styrer årets beløb.
    s.indtaegter.leje = Number(lease.maanedlig_leje) || 0
    s.indtaegter.vand = Number(lease.forbrug_aconto?.vand) || 0
    s.indtaegter.varme = Number(lease.forbrug_aconto?.varme) || 0
    s.udgifter.vand = Number(lease.forbrug_aconto?.vand) || 0
    s.udgifter.varme = Number(lease.forbrug_aconto?.varme) || 0
    s.prorata = {
      'indtaegter.leje': true, 'indtaegter.vand': true, 'indtaegter.varme': true,
      'udgifter.vand': true, 'udgifter.varme': true,
    }
  }
  if (property) s.udgifter.grundskyld = Number(property.grundskyld_aarlig) || 0  // årsbeløb
  return s
}

const INDTAEGT_FELTER = [
  ['leje', 'Husleje', 'ekskl. forbrug'],
  ['vand', 'Vand (opkrævet)', ''],
  ['varme', 'Varme (opkrævet)', ''],
  ['andet', 'Anden indtægt', ''],
]
const UDGIFT_FELTER = [
  ['grundskyld', 'Grundskyld (ejendomsskat)', ''],
  ['faellesudgifter', 'Fællesudgifter (drift)', 'ikke henlæggelser til forbedring'],
  ['forsikring', 'Forsikring', ''],
  ['vedligeholdelse', 'Vedligeholdelse', 'ikke forbedring'],
  ['vand', 'Vand (afholdt)', ''],
  ['varme', 'Varme (afholdt)', ''],
  ['administration', 'Administration', ''],
  ['renovation', 'Renovation', ''],
  ['andet', 'Andet', ''],
]

export default function AaretsTal({ years, persons, property, loans, lease, settings, reload }) {
  const sorterede = [...years].sort((a, b) => b.aar - a.aar)
  const [valgtAar, setValgtAar] = useState(sorterede[0]?.aar ?? null)
  const [mode, setMode] = useState('budget')  // budget = forskud, faktisk = selvangivelse
  const [year, setYear] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [visOpret, setVisOpret] = useState(false)
  const [nyAar, setNyAar] = useState('')
  const [opretFejl, setOpretFejl] = useState('')

  // Synkronisér lokalt år når valg eller data ændrer sig.
  useEffect(() => {
    const y = years.find(y => y.aar === valgtAar)
    if (y) {
      setYear({ ...y, budget: normaliserSaet(y.budget), faktisk: normaliserSaet(y.faktisk) })
      setDirty(false)
    } else {
      setYear(null)
    }
  }, [valgtAar, years])

  const startOpret = () => {
    const forslag = sorterede[0] ? sorterede[0].aar + 1 : new Date().getFullYear()
    setNyAar(String(forslag))
    setOpretFejl('')
    setVisOpret(true)
  }
  const bekraeftOpret = async () => {
    const aar = Number(nyAar)
    if (!aar || aar < 1900 || aar > 2200) { setOpretFejl('Angiv et gyldigt årstal.'); return }
    if (years.find(y => y.aar === aar)) { setOpretFejl('Året findes allerede.'); return }
    const start = prefillSaet({ lease, property, loans })
    await api.post('/years', { aar, budget: start, faktisk: start })
    setVisOpret(false)
    setValgtAar(aar)
    reload()
  }

  const setField = (path, key, v) => {
    setYear(prev => {
      const saet = { ...prev[mode] }
      if (path) saet[path] = { ...saet[path], [key]: parseNum(v) }
      else saet[key] = key === 'naertstaaende' ? v : parseNum(v)
      return { ...prev, [mode]: saet }
    })
    setDirty(true)
  }
  const setRente = (loanId, v) => {
    setYear(prev => ({
      ...prev,
      [mode]: { ...prev[mode], renteudgifter: { ...prev[mode].renteudgifter, [loanId]: parseNum(v) } },
    }))
    setDirty(true)
  }
  const setProrata = (gruppe, key, bool) => {
    setYear(prev => {
      const prorata = { ...(prev[mode].prorata || {}) }
      const pk = `${gruppe}.${key}`
      if (bool) prorata[pk] = true; else delete prorata[pk]
      return { ...prev, [mode]: { ...prev[mode], prorata } }
    })
    setDirty(true)
  }

  const gem = async () => {
    await api.put(`/years/${year.id}`, { aar: year.aar, budget: year.budget, faktisk: year.faktisk })
    setDirty(false)
    reload()
  }
  const sletAar = async () => {
    if (confirm(`Slet hele året ${year.aar}?`)) { await api.del(`/years/${year.id}`); setValgtAar(null); reload() }
  }

  return (
    <>
      <div className="page-header">
        <h1>Årets tal</h1>
        <p>Indtast indtægter, udgifter og renter pr. år. Budget = forskudsopgørelse, Faktisk = selvangivelse.</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 160 }}>
            <label>År</label>
            <select value={valgtAar ?? ''} onChange={e => setValgtAar(Number(e.target.value))}>
              {sorterede.length === 0 && <option value="">— ingen —</option>}
              {sorterede.map(y => <option key={y.id} value={y.aar}>{y.aar}</option>)}
            </select>
          </div>
          {!visOpret && <button className="btn ghost" onClick={startOpret}>+ Opret år</button>}
          {visOpret && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="field" style={{ minWidth: 110 }}>
                <label>Nyt år</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nyAar}
                  autoFocus
                  onChange={e => { setNyAar(e.target.value); setOpretFejl('') }}
                  onKeyDown={e => { if (e.key === 'Enter') bekraeftOpret() }}
                />
              </div>
              <button className="btn primary" onClick={bekraeftOpret}>Opret</button>
              <button className="btn ghost" onClick={() => setVisOpret(false)}>Annullér</button>
              {opretFejl && <span className="badge warn" style={{ alignSelf: 'center' }}>{opretFejl}</span>}
            </div>
          )}
          {year && !visOpret && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className={`btn ${mode === 'budget' ? 'primary' : 'ghost'}`} onClick={() => setMode('budget')}>Budget (forskud)</button>
              <button className={`btn ${mode === 'faktisk' ? 'primary' : 'ghost'}`} onClick={() => setMode('faktisk')}>Faktisk (selvangivelse)</button>
            </div>
          )}
        </div>
      </div>

      {!year && <div className="card"><p className="empty-state">Opret et år for at indtaste tal.</p></div>}

      {year && <Redigering
        saet={year[mode]} loans={loans} persons={persons} property={property}
        fordeling={resolveFordeling(settings, persons)}
        setField={setField} setRente={setRente} setProrata={setProrata}
      />}

      {year && (
        <div className="card" style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={gem} disabled={!dirty}>Gem år</button>
          <button className="btn danger" onClick={sletAar} style={{ marginLeft: 'auto' }}>Slet år</button>
        </div>
      )}
    </>
  )
}

function BeloebFelt({ gruppe, felt, label, hint, saet, mdr, setField, setProrata }) {
  const pro = erProrata(saet, gruppe, felt)
  return (
    <div className="field">
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>{label} {hint && <span className="hint">· {hint}</span>}</span>
        <span className="hint" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer', fontWeight: 400 }}>
          <input type="checkbox" checked={pro} onChange={e => setProrata(gruppe, felt, e.target.checked)} style={{ width: 'auto', margin: 0 }} />
          pr. måned
        </span>
      </label>
      <div className="input-suffix">
        <input
          type="text" inputMode="decimal"
          value={saet[gruppe][felt] || ''}
          onChange={e => setField(gruppe, felt, e.target.value)}
          style={{ paddingRight: 54 }}
        />
        <span className="suffix">{pro ? 'kr./md' : 'kr.'}</span>
      </div>
      {pro && <span className="hint">= {kr(effektivBeloeb(saet, gruppe, felt))} for {mdr} mdr</span>}
    </div>
  )
}

function Redigering({ saet, loans, persons, property, fordeling, setField, setRente, setProrata }) {
  const resultat = resultatFoerRenter(saet)
  const opg = personOpgoerelse(saet, { persons, property, loans, fordeling })
  const mdr = antalMaaneder(saet)

  return (
    <>
      <div className="card">
        <h2>Udlejningsperiode</h2>
        <h3>Styrer antal udlejningsdage og fordeler beløb der er markeret “pr. måned”.</h3>
        <div className="grid">
          <SelectField label="Fra måned" value={String(saet.fra_maaned ?? 1)} onChange={v => setField(null, 'fra_maaned', v)} options={MAANEDER} />
          <SelectField label="Til måned" value={String(saet.til_maaned ?? 12)} onChange={v => setField(null, 'til_maaned', v)} options={MAANEDER} />
          <NumberField label="Udlejet andel" value={saet.udlejet_andel_pct || ''} onChange={v => setField(null, 'udlejet_andel_pct', v)} suffix="%" />
        </div>
        <p className="muted" style={{ marginTop: 10 }}>{mdr} måneder = <strong>{udlejningsdage(saet)} udlejningsdage</strong></p>
      </div>

      <div className="card">
        <h2>Indtægter</h2>
        <div className="grid">
          {INDTAEGT_FELTER.map(([k, label, hint]) => (
            <BeloebFelt key={k} gruppe="indtaegter" felt={k} label={label} hint={hint} saet={saet} mdr={mdr} setField={setField} setProrata={setProrata} />
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>I alt: <strong>{kr(sumIndtaegter(saet))}</strong></p>
      </div>

      <div className="card">
        <h2>Fradragsberettigede udgifter</h2>
        <div className="grid">
          {UDGIFT_FELTER.map(([k, label, hint]) => (
            <BeloebFelt key={k} gruppe="udgifter" felt={k} label={label} hint={hint} saet={saet} mdr={mdr} setField={setField} setProrata={setProrata} />
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>I alt: <strong>{kr(sumFradragsUdgifter(saet))}</strong></p>
      </div>

      <div className="card">
        <h2>Forbedringer</h2>
        <h3>Ikke fradrag — tillægges anskaffelsessummen. Registreres kun til dokumentation.</h3>
        <div className="grid">
          <NumberField label="Forbedringer i året" value={saet.forbedringer || ''} onChange={v => setField(null, 'forbedringer', v)} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Renteudgifter</h2>
            <h3>Personlige renteudgifter (kapitalindkomst) — fordeles efter hæftelse, ikke en del af udlejningsresultatet.</h3>
          </div>
          {loans.length > 0 && (
            <button className="btn ghost" onClick={() => loans.forEach(l => setRente(l.id, estimeretAarligRente(l)))}>
              ↻ Beregn fra stamdata
            </button>
          )}
        </div>
        {loans.length === 0 && <p className="muted">Tilføj lån under Stamdata for at indtaste renter.</p>}
        <div className="grid">
          {loans.map(l => (
            <NumberField
              key={l.id}
              label={l.laangiver || (l.type === 'realkredit' ? 'Realkreditlån' : 'Banklån')}
              hint={`skøn fra lån: ${kr(estimeretAarligRente(l))}`}
              value={saet.renteudgifter[l.id] || ''}
              onChange={v => setRente(l.id, v)}
            />
          ))}
        </div>
        {loans.length > 0 && <p className="muted" style={{ marginTop: 10 }}>Renter i alt: <strong>{kr(sumRenter(saet))}</strong></p>}
      </div>

      <div className="card" style={{ background: 'var(--surface-2)' }}>
        <h2>Beregnet resultat</h2>
        <table className="data">
          <tbody>
            <tr><td>Udlejningsresultat før renter</td><td className="num">{kr(resultat)}</td></tr>
          </tbody>
        </table>
        <p className="muted" style={{ margin: '6px 0 10px', fontSize: 13 }}>
          Fordeling: {fordeling?.mode === 'alt_paa_en' ? 'alt på den beskattede ægtefælle (§25 A)' : 'delt efter ejerandel/hæftelse'}
        </p>
        <table className="data" style={{ marginTop: 4 }}>
          <thead>
            <tr><th>Person</th><th className="num">Resultatandel</th><th className="num">Renter</th><th className="num">Netto kapitalindkomst</th></tr>
          </thead>
          <tbody>
            {opg.map(o => (
              <tr key={o.personId}>
                <td>{o.navn} {o.erBeskattet ? '' : '(ikke beskattet)'}</td>
                <td className="num">{kr(o.resultatAndel)}</td>
                <td className="num">{kr(o.renter)}</td>
                <td className="num">{kr(o.nettoKapitalindkomst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
