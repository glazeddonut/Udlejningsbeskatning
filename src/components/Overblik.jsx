import { kr } from '../lib/format.js'
import { normaliserSaet } from '../lib/saet.js'
import { resultatFoerRenter, personOpgoerelse, markedslejeTjek, resolveFordeling, leaseForAar } from '../lib/beregning.js'

// Forside: status på stamdata, markedsleje-tjek, seneste års nøgletal og påmindelser.
export default function Overblik({ persons, property, loans, leases, years, settings, onGoto }) {
  const sorterede = [...years].sort((a, b) => b.aar - a.aar)
  const senesteAar = sorterede[0]
  const saet = senesteAar ? normaliserSaet(senesteAar.faktisk) : null

  const mangler = []
  if (persons.length < 2) mangler.push('ejere')
  if (!property) mangler.push('lejlighed')
  if (loans.length === 0) mangler.push('lån')
  if (!leases || leases.length === 0) mangler.push('lejekontrakt')

  // Markedsleje-tjekket køres mod den kontrakt der er aktiv i seneste år (ellers i år).
  const tjekAar = senesteAar?.aar ?? new Date().getFullYear()
  const aktivLease = leaseForAar(leases, tjekAar)
  const mlt = aktivLease ? markedslejeTjek(aktivLease, settings?.markedsleje_advarsel_pct ?? 5) : null
  // Gave-vurdering: forskellen mellem markedsleje og aftalt leje er et muligt gaveelement
  // fra ejerne til datteren. To ejere → sammenlign med 2× bundgrænse (grov rettesnor).
  const bundgraense = settings?.gaveafgift_bundgraense ?? 0
  const antalGivere = Math.max(persons.length, 1)
  const gaveGraense = bundgraense * antalGivere

  return (
    <>
      <div className="page-header">
        <h1>Overblik</h1>
        <p>{property?.navn ? `${property.navn}${property.adresse ? ' · ' + property.adresse : ''}` : 'Forældrekøb — udlejning til datter'}</p>
      </div>

      {mangler.length > 0 && (
        <div className="card">
          <h2>Kom i gang</h2>
          <p className="muted">Udfyld stamdata for at få fuldt udbytte: mangler <strong>{mangler.join(', ')}</strong>.</p>
          <button className="btn primary" onClick={() => onGoto('stamdata')}>Gå til Stamdata</button>
        </div>
      )}

      {mlt && (
        <div className="card">
          <div className="card-header">
            <h2>Markedsleje</h2>
            {!mlt.harSkoen
              ? <span className="badge">Intet skøn</span>
              : mlt.advarsel
                ? <span className="badge warn">Leje under markedsleje</span>
                : <span className="badge ok">Ser markedskonform ud</span>}
          </div>
          {!mlt.harSkoen && <p className="muted">Angiv et markedsleje-skøn på lejekontrakten for at tjekke for gaveelement.</p>}
          {mlt.harSkoen && (
            <>
              <table className="data">
                <tbody>
                  <tr><td>Aftalt årsleje</td><td className="num">{kr(mlt.aftaltAarsleje)}</td></tr>
                  <tr><td>Markedsleje (skøn)</td><td className="num">{kr(mlt.markedsAarsleje)}</td></tr>
                  <tr className="total"><td>Forskel (muligt gaveelement)</td><td className="num">{kr(mlt.difference)}</td></tr>
                </tbody>
              </table>
              {mlt.advarsel && (
                <p className="muted" style={{ marginTop: 10 }}>
                  Lejen ligger {mlt.underPct.toFixed(1)} % under markedslejen. SKAT kan fiksere lejen til
                  markedsniveau, og forskellen kan anses som en gave til datteren.
                  {bundgraense > 0 && <> Samlet gaveafgiftsfri bundgrænse for {antalGivere} givere: ca. {kr(gaveGraense)}
                    {mlt.difference > gaveGraense ? ' — forskellen overstiger bundgrænsen.' : ' — forskellen er under bundgrænsen.'}</>}
                  {' '}Verificér mod gældende regler.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {senesteAar && saet && (
        <div className="card">
          <div className="card-header">
            <h2>Seneste år · {senesteAar.aar}</h2>
            <button className="btn ghost" onClick={() => onGoto('skat')}>Skatteindberetning →</button>
          </div>
          <table className="data">
            <tbody>
              <tr><td>Udlejningsresultat før renter (faktisk)</td><td className="num">{kr(resultatFoerRenter(saet))}</td></tr>
              {personOpgoerelse(saet, { persons, property, loans, fordeling: resolveFordeling(settings, persons) }).map(o => (
                <tr key={o.personId}>
                  <td>{o.navn} — netto kapitalindkomst</td>
                  <td className="num">{kr(o.nettoKapitalindkomst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Skatteordning</h2>
        <p className="muted" style={{ margin: 0 }}>
          Almindelige regler (udlejningsresultat = kapitalindkomst). Egnet ved udlejning kun til
          nærtstående. Husk: forskudsopgørelsen løbende, og oplysningsskema/selvangivelse efter årets udløb.
        </p>
      </div>
    </>
  )
}
