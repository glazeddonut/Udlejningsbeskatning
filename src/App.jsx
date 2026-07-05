import { useState, useEffect, useCallback } from 'react'
import Stamdata from './components/Stamdata.jsx'
import AaretsTal from './components/AaretsTal.jsx'
import SkatteIndberetning from './components/SkatteIndberetning.jsx'
import Aarsregnskab from './components/Aarsregnskab.jsx'
import Bilag from './components/Bilag.jsx'
import Overblik from './components/Overblik.jsx'
import Indstillinger from './components/Indstillinger.jsx'

const TABS = [
  { id: 'overblik',    label: 'Overblik' },
  { id: 'stamdata',    label: 'Stamdata' },
  { id: 'aaret',       label: 'Årets tal' },
  { id: 'skat',        label: 'Skatteindberetning' },
  { id: 'bilag',       label: 'Bilag' },
  { id: 'regnskab',    label: 'Årsregnskab' },
  { id: 'indstillinger', label: 'Indstillinger' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('overblik')

  const [persons, setPersons] = useState([])
  const [property, setProperty] = useState(null)
  const [loans, setLoans] = useState([])
  const [lease, setLease] = useState(null)
  const [years, setYears] = useState([])
  const [settings, setSettings] = useState(null)
  const [fieldMappings, setFieldMappings] = useState({})
  const [loaded, setLoaded] = useState(false)

  // Tema: initialiseres fra attributten som pre-paint-scriptet i index.html satte.
  const [theme, setTheme] = useState(
    () => (typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-theme') === 'dark') ? 'dark' : 'light'
  )
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      else document.documentElement.removeAttribute('data-theme')
      try { localStorage.setItem('theme', next) } catch (e) { /* privat browsing o.l. */ }
      return next
    })
  }

  const fetchData = useCallback(async () => {
    const [persRes, propRes, loanRes, leaseRes, yearRes, setRes, fmRes] = await Promise.all([
      fetch('/api/persons'),
      fetch('/api/property'),
      fetch('/api/loans'),
      fetch('/api/lease'),
      fetch('/api/years'),
      fetch('/api/settings'),
      fetch('/api/field-mappings'),
    ])
    setPersons(await persRes.json())
    setProperty(await propRes.json())
    setLoans(await loanRes.json())
    setLease(await leaseRes.json())
    setYears(await yearRes.json())
    setSettings(await setRes.json())
    setFieldMappings(await fmRes.json())
    setLoaded(true)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">U</span>
          <span>Udlejningsbeskatning</span>
          <span className="sub">· Forældrekøb</span>
        </div>
        <span className="spacer" />
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? '☀︎ Lyst' : '☾ Mørkt'}
        </button>
      </header>

      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={activeTab === t.id ? 'active' : ''}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="container">
        {!loaded && <div className="empty-state">Henter data…</div>}
        {loaded && activeTab === 'overblik' && (
          <Overblik persons={persons} property={property} loans={loans} lease={lease} years={years} settings={settings} onGoto={setActiveTab} />
        )}
        {loaded && activeTab === 'stamdata' && (
          <Stamdata persons={persons} property={property} loans={loans} lease={lease} reload={fetchData} />
        )}
        {loaded && activeTab === 'aaret' && (
          <AaretsTal years={years} persons={persons} property={property} loans={loans} lease={lease} settings={settings} reload={fetchData} />
        )}
        {loaded && activeTab === 'skat' && (
          <SkatteIndberetning years={years} persons={persons} property={property} loans={loans} fieldMappings={fieldMappings} settings={settings} reload={fetchData} />
        )}
        {loaded && activeTab === 'bilag' && (
          <Bilag years={years} />
        )}
        {loaded && activeTab === 'regnskab' && (
          <Aarsregnskab years={years} persons={persons} property={property} loans={loans} settings={settings} />
        )}
        {loaded && activeTab === 'indstillinger' && (
          <Indstillinger settings={settings} fieldMappings={fieldMappings} years={years} reload={fetchData} />
        )}
      </main>
    </>
  )
}
