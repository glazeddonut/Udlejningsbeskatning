import EjereManager from './EjereManager.jsx'
import EjendomStamdata from './EjendomStamdata.jsx'
import LaanManager from './LaanManager.jsx'
import LejekontraktManager from './LejekontraktManager.jsx'

// Samler de persistente stamdata: ejere, lejlighed, lån og lejekontrakt.
export default function Stamdata({ persons, property, loans, lease, reload }) {
  return (
    <>
      <div className="page-header">
        <h1>Stamdata</h1>
        <p>Grundoplysninger der indtastes én gang og genbruges år efter år.</p>
      </div>

      {/* Ejere skal oprettes før ejerandele/hæftelse kan fordeles. */}
      <EjereManager persons={persons} reload={reload} />
      <EjendomStamdata key={`ejendom-${property ? 'har' : 'tom'}`} property={property} persons={persons} reload={reload} />
      <LaanManager loans={loans} persons={persons} reload={reload} />
      <LejekontraktManager key={`lease-${lease ? 'har' : 'tom'}`} lease={lease} reload={reload} />
    </>
  )
}
