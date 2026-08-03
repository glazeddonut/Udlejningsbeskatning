import { useState } from 'react'
import { api } from '../lib/api.js'
import { tal, pct, daNum } from '../lib/format.js'
import { normaliserSaet } from '../lib/saet.js'
import { personOpgoerelse, resolveFordeling, manglerPeriode } from '../lib/beregning.js'
import { hentFeltmapping, evalKilde, feltRolle, felterForRolle } from '../lib/feltmapping.js'

const DOKTYPER = [
  { id: 'forskud', label: 'Forskudsopgørelse', saetNoegle: 'budget', note: 'Fremadrettet estimat (budget-tal).' },
  { id: 'selvangivelse', label: 'Selvangivelse', saetNoegle: 'faktisk', note: 'Bagudrettet, faktiske tal (oplysningsskema).' },
]

// `kopi: null` betyder "ingen værdi at kopiere" — så fladen heller ikke tilbyder knappen.
// evalKilde svarer null når oplysningen mangler (ADR-0002); der skal stå hvad der mangler,
// ikke et tal brugeren kan komme til at taste ind på skat.dk.
function visVaerdi(raw, enhed) {
  if (raw === null) return { vis: 'Periode mangler', kopi: null }
  if (enhed === 'kr') return { vis: tal(raw) + ' kr.', kopi: String(raw) }
  // Procenter skrives med deres decimaler. Felt 744 bærer nu præcis den andel fradraget
  // er regnet på (ADR-0003), og den kan være brøkdelt — `tal()` ville runde 12,5 % op til
  // "13 %" og dermed vise ét tal på skærmen mens fradraget hvilede på et andet.
  // Et helt tal skrives ordret som før.
  if (enhed === '%') return { vis: pct(raw), kopi: daNum(raw) }
  if (enhed === 'dage') return { vis: tal(raw) + ' dage', kopi: String(raw) }
  return { vis: String(raw), kopi: String(raw) }
}

export default function SkatteIndberetning({ years, persons, property, loans, fieldMappings, settings, reload }) {
  const sorterede = [...years].sort((a, b) => b.aar - a.aar)
  const [valgtAar, setValgtAar] = useState(sorterede[0]?.aar ?? null)
  const [doktype, setDoktype] = useState('forskud')

  const fordeling = resolveFordeling(settings, persons)
  const year = years.find(y => y.aar === valgtAar)
  const dt = DOKTYPER.find(d => d.id === doktype)
  const saet = year ? normaliserSaet(year[dt.saetNoegle]) : null
  const opg = saet ? personOpgoerelse(saet, { persons, property, loans, fordeling }) : []
  const felter = hentFeltmapping(valgtAar, doktype, fieldMappings)

  // Sortér så den beskattede vises først (som "Indberetter 2" hos Reportability).
  const opgSorteret = [...opg].sort((a, b) => (b.erBeskattet ? 1 : 0) - (a.erBeskattet ? 1 : 0))

  const saetFordeling = async (patch) => {
    await api.put('/settings', patch)
    reload()
  }

  return (
    <>
      <div className="page-header">
        <h1>Skatteindberetning</h1>
        <p>De værdier I skal indtaste på skat.dk — pr. person, for forskudsopgørelse og selvangivelse.</p>
      </div>

      <div className="disclaimer">
        ⚠️ <strong>Verificér feltnumrene.</strong> Felt-/rubriknumrene er et bedste bud og skal
        kontrolleres mod skat.dk / Den juridiske vejledning for det pågældende år. Beløbene er
        beregnet ud fra jeres indtastede tal. Appen er et hjælpeværktøj, ikke skatterådgivning.
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 120 }}>
            <label>År</label>
            <select value={valgtAar ?? ''} onChange={e => setValgtAar(Number(e.target.value))}>
              {sorterede.length === 0 && <option value="">— ingen —</option>}
              {sorterede.map(y => <option key={y.id} value={y.aar}>{y.aar}</option>)}
            </select>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {DOKTYPER.map(d => (
              <button key={d.id} className={`btn ${doktype === d.id ? 'primary' : 'ghost'}`} onClick={() => setDoktype(d.id)}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* Fordelingsvalg mellem ægtefællerne (jf. §25 A) */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 200 }}>
            <label>Fordeling mellem jer</label>
            <select value={fordeling.mode} onChange={e => saetFordeling({ fordeling_mode: e.target.value })}>
              <option value="alt_paa_en">Alt på den ene</option>
              <option value="del">Del mellem os</option>
            </select>
          </div>
          {fordeling.mode === 'alt_paa_en' && (
            <div className="field" style={{ minWidth: 200 }}>
              <label>Beskattes hos</label>
              <select
                value={fordeling.beskattetPersonId ?? ''}
                onChange={e => saetFordeling({ beskattet_person_id: Number(e.target.value) })}
              >
                {persons.map(p => <option key={p.id} value={p.id}>{p.navn}{p.rolle === 'udlejer' ? ' (udlejer)' : ''}</option>)}
              </select>
            </div>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 13, flex: 1, minWidth: 200 }}>
            {fordeling.mode === 'alt_paa_en'
              ? 'Hele resultatet og alle renter beskattes hos én ægtefælle (§25 A). Den anden flytter sine renter over.'
              : 'Resultat fordeles efter ejerandel, renter efter hæftelse (§25 A stk. 8 — kræver at begge deltager i driften).'}
          </p>
        </div>
        {year && <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>{dt.note}</p>}
        {/* Uden udlejningsperiode er der intet dagstal at indberette — og appen gætter
            ikke ét, heller ikke selvom 360 ville se rigtigt ud (ADR-0002). */}
        {year && manglerPeriode(saet) && (
          <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ margin: 0 }}><span className="badge warn">Periode mangler</span></p>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Udlejningsperioden mangler i dette grundlag, så dagsfelterne (748 / 207) kan ikke
              beregnes og indberettes ikke. Beløb der er tastet “pr. måned” fordeles også efter
              perioden og regnes uden den som et helt år — kontrollér resultatfelterne, før I
              indberetter dem. Udfyld fra- og til-dato under “Årets tal”.
            </p>
          </div>
        )}
      </div>

      {!year && <div className="card"><p className="empty-state">Opret et år under “Årets tal” først.</p></div>}
      {year && persons.length === 0 && <div className="card"><p className="empty-state">Tilføj ejere under Stamdata.</p></div>}

      {year && opgSorteret.map((personOpg, idx) => {
        const p = persons.find(pp => pp.id === personOpg.personId)
        const rolle = feltRolle(personOpg, fordeling)
        const erOverskud = (personOpg.resultatAndel || 0) >= 0
        const synligeFelter = felterForRolle(felter, rolle, erOverskud)
        const indberetterNr = idx + 1
        return (
          <div className="card" key={personOpg.personId}>
            <div className="card-header">
              <div>
                <h2>Indberetter {indberetterNr}: {p?.navn || 'Ejer'}</h2>
                <h3>
                  {personOpg.erBeskattet
                    ? 'Beskattes af resultatet'
                    : 'Beskattes ikke af resultatet — flytter renter til ægtefællen'}
                  {' · ejerandel '}{personOpg.andelPct} %
                </h3>
              </div>
              <span className={`badge ${personOpg.erBeskattet ? 'ok' : ''}`}>
                {personOpg.erBeskattet ? 'Beskattet' : 'Ikke beskattet'}
              </span>
            </div>
            <table className="data">
              <thead>
                <tr><th style={{ width: 90 }}>Felt</th><th>Betegnelse</th><th className="num">Værdi</th><th style={{ width: 90 }}></th></tr>
              </thead>
              <tbody>
                {synligeFelter.map((f, i) => {
                  const raw = evalKilde(f.kilde, { personOpg, saet, person: p })
                  // Resultatfelter (overskud/underskud) indberettes som positivt beløb.
                  const vist = f.kilde === 'resultat' ? Math.abs(raw) : raw
                  const { vis, kopi } = visVaerdi(vist, f.enhed)
                  return (
                    <tr key={i}>
                      <td>
                        <strong>{f.felt_nr}</strong>
                        {f.usikker && <span className="badge warn" style={{ marginLeft: 6, fontSize: 11 }}>verificér</span>}
                      </td>
                      <td>
                        {f.label}
                        {f.note && <div className="muted" style={{ fontSize: 12 }}>{f.note}</div>}
                      </td>
                      <td className="num">{kopi === null ? <span className="badge warn">{vis}</span> : vis}</td>
                      <td>{kopi !== null && (f.enhed === 'kr' || f.enhed === 'dage' || f.enhed === '%') ? <KopiKnap tekst={kopi} /> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}

function KopiKnap({ tekst }) {
  const [kopieret, setKopieret] = useState(false)
  const kopier = async () => {
    try {
      await navigator.clipboard.writeText(tekst)
      setKopieret(true)
      setTimeout(() => setKopieret(false), 1200)
    } catch { /* clipboard kan være blokeret */ }
  }
  return <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={kopier}>{kopieret ? '✓ Kopieret' : 'Kopiér'}</button>
}
