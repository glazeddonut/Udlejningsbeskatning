import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { kr, pct } from '../lib/format.js'
import { NumberField, TextField } from './fields.jsx'
import {
  sumIndtaegter, sumFradragsUdgifter, resultatFoerRenter,
  sumRenter, personOpgoerelse, resolveFordeling, gruppeOpgoerelse,
  udlejningsdage, udlejningsdage360, erProrata, effektivBeloeb, renteskoen,
  prorataMaaneder, aarsgrundlag, periodeAfvigelse, periodeKvittering, manglerPeriode,
  udlejetAndel, aarsinterval, maaAarOprettes,
} from '../lib/beregning.js'
import { normaliserSaet } from '../lib/saet.js'

// Lånets navn på skærmen: långiveren, ellers typen. Ét sted, så rentefeltet og
// advarslen om samme lån ikke kan komme til at kalde det to ting.
const laanNavn = (laan) => laan.laangiver || (laan.type === 'realkredit' ? 'Realkreditlån' : 'Banklån')

// Hintet under rentefeltet: skønnet OG hvad det bygger på. Et skøn der er skåret ned
// til en del af året skal kunne ses at være det — ellers ligner et halvt års rente
// bare et forkert tal. Skønnet erstattes fortsat af bankens faktiske rentetal.
function skoenHint(s, aar) {
  if (s.foerOptagelse) return `lånet var ikke optaget i ${aar} — intet skøn`
  if (s.manglerStartdato) return `skøn fra lån: ${kr(s.beloeb)} (hele året — lånets startdato mangler)`
  if (s.dage < s.dageIAar) return `skøn fra lån: ${kr(s.beloeb)} (${s.dage} af årets ${s.dageIAar} dage)`
  return `skøn fra lån: ${kr(s.beloeb)}`
}

export default function AaretsTal({ years, persons, property, loans, leases, settings, reload }) {
  const sorterede = [...years].sort((a, b) => b.aar - a.aar)
  const [valgtAar, setValgtAar] = useState(sorterede[0]?.aar ?? null)
  const [mode, setMode] = useState('budget')  // budget = forskud, faktisk = selvangivelse
  const [year, setYear] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [visOpret, setVisOpret] = useState(false)
  const [nyAar, setNyAar] = useState('')
  const [opretFejl, setOpretFejl] = useState('')
  const [gemFejl, setGemFejl] = useState('')

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

  const { foerste: minAar, sidste: maxAar } = aarsinterval(leases)
  const startOpret = () => {
    let forslag = sorterede[0] ? sorterede[0].aar + 1 : (minAar || new Date().getFullYear())
    if (minAar && forslag < minAar) forslag = minAar
    if (maxAar && forslag > maxAar) forslag = maxAar
    // Forslaget må ikke være et år reglen selv afviser — fx et hul-år mellem to
    // lejekontrakter. Gå frem til det første år der kan oprettes; findes der ingen,
    // står det oprindelige forslag, og fejlen forklarer hvorfor.
    for (let k = forslag; k <= forslag + 50; k++) {
      if (maaAarOprettes(leases, k).ok) { forslag = k; break }
    }
    setNyAar(String(forslag))
    setOpretFejl('')
    setVisOpret(true)
  }
  // Reglen for hvilke år der må oprettes bor i beregningslaget og spørges her, så fejlen
  // vises med det samme — uden at skulle kalde serveren. Serveren spørger samme funktion,
  // så teksten er den samme uanset hvor grænsen rammes. Fejler kaldet alligevel (fx et
  // andet vindue nåede at oprette året), vises serverens egen tekst frem for tavshed.
  const bekraeftOpret = async () => {
    const aar = Number(nyAar)
    const svar = maaAarOprettes(leases, aar)
    if (!svar.ok) { setOpretFejl(svar.begrundelse); return }
    if (years.find(y => y.aar === aar)) { setOpretFejl('Året findes allerede'); return }
    // Talsættet bygges af serveren (saetTilNytAar), så et år får samme periode og samme
    // prefill uanset om det oprettes herfra eller direkte mod API'et (ADR-0002).
    try {
      await api.post('/years', { aar })
    } catch (e) {
      setOpretFejl(e.message)
      return
    }
    setVisOpret(false)
    setValgtAar(aar)
    reload()
  }

  // Værdien gemmes som den kommer ind: talfeltet leverer et tal (eller null for et tomt
  // felt), datofeltet en ISO-dato. Feltet kender sin egen form, så der er ikke længere
  // en liste af nøgler her der skal huske hvilke der ikke må parses.
  const setField = (path, key, v) => {
    setYear(prev => {
      const saet = { ...prev[mode] }
      if (path) saet[path] = { ...saet[path], [key]: v }
      else saet[key] = v
      return { ...prev, [mode]: saet }
    })
    setDirty(true)
    setGemFejl('')   // brugeren er i gang med at rette — den gamle afvisning gælder ikke
  }
  // Sæt begge datoer på én gang — til "brug lejekontraktens periode".
  const setPeriode = (fra, til) => {
    setYear(prev => ({ ...prev, [mode]: { ...prev[mode], fra_dato: fra, til_dato: til } }))
    setDirty(true)
  }
  // Kvitteringen på en periodeafvigelse gemmes på årets talsæt som alt andet — den
  // følger grundlaget (budget/faktisk), fordi de to kan have hver sin periode.
  const setKvittering = (k) => {
    setYear(prev => ({ ...prev, [mode]: { ...prev[mode], periode_kvittering: k } }))
    setDirty(true)
  }
  // Renten kommer enten fra talfeltet (et tal) eller fra knappen “Beregn fra stamdata”
  // (renteskønnets tal). Begge er tal i forvejen og gemmes som de er.
  const setRente = (loanId, v) => {
    setYear(prev => ({
      ...prev,
      [mode]: { ...prev[mode], renteudgifter: { ...prev[mode].renteudgifter, [loanId]: v } },
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

  // Serveren afviser tal og datoer der ikke har domænets form — fx en udlejet andel
  // over 100 %. Afvisningen skal SES: uden den ville knappen bare lade som ingenting,
  // og året stå ugemt uden at nogen sagde det.
  const gem = async () => {
    try {
      await api.put(`/years/${year.id}`, { aar: year.aar, budget: year.budget, faktisk: year.faktisk })
    } catch (e) {
      setGemFejl(e.message)
      return
    }
    setGemFejl('')
    setDirty(false)
    reload()
  }
  const sletAar = async () => {
    if (confirm(`Slet hele året ${year.aar}?`)) { await api.del(`/years/${year.id}`); setValgtAar(null); reload() }
  }
  // Kopiér budgettets (forskuds-)tal over i de faktiske (selvangivelses-)tal.
  const kopierFraBudget = () => {
    const f = year.faktisk
    const harData = sumIndtaegter(f) || sumFradragsUdgifter(f) || sumRenter(f)
    if (harData && !confirm('Overskriv de faktiske tal med budgettets tal?')) return
    setYear(prev => ({ ...prev, faktisk: JSON.parse(JSON.stringify(prev.budget)) }))
    setDirty(true)
  }

  // Årets gemte periode er et øjebliksbillede fra dengang året blev oprettet; kontrakten
  // kan være rettet siden. Vi afleder på ny ved hvert opslag og rapporterer forskellen —
  // uden at rette automatisk, da overstyringen kan være bevidst.
  const grundlag = year ? aarsgrundlag(leases, year.aar) : null

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
              <div className="field" style={{ minWidth: 130 }}>
                <label>Nyt år {(minAar || maxAar) && <span className="hint">· {minAar ?? '…'}–{maxAar ?? 'åbent'}</span>}</label>
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
              {mode === 'faktisk' && (
                <button className="btn ghost" onClick={kopierFraBudget} title="Kopiér budgettets tal over i de faktiske tal">⧉ Kopiér fra budget</button>
              )}
              <button className={`btn ${mode === 'budget' ? 'primary' : 'ghost'}`} onClick={() => setMode('budget')}>Budget (forskud)</button>
              <button className={`btn ${mode === 'faktisk' ? 'primary' : 'ghost'}`} onClick={() => setMode('faktisk')}>Faktisk (selvangivelse)</button>
            </div>
          )}
        </div>
      </div>

      {!year && <div className="card"><p className="empty-state">Opret et år for at indtaste tal.</p></div>}

      {year && <Redigering
        saet={year[mode]} loans={loans} persons={persons} property={property}
        fordeling={resolveFordeling(settings, persons)} grundlag={grundlag}
        setField={setField} setRente={setRente} setProrata={setProrata} setPeriode={setPeriode}
        setKvittering={setKvittering}
      />}

      {year && (
        <div className="card" style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={gem} disabled={!dirty}>Gem år</button>
          {gemFejl && <span className="badge warn" style={{ alignSelf: 'center' }}>{gemFejl}</span>}
          <button className="btn danger" onClick={sletAar} style={{ marginLeft: 'auto' }}>Slet år</button>
        </div>
      )}
    </>
  )
}

// Ét beløbsfelt for én post i kontoplanen. Posten leverer label og hint, så
// indtastningen bruger samme navne som regnskabet.
//
// Feltet er en VARIANT af talfeltet, ikke en kopi af det: pro rata-afkrydsningen sidder
// i labelens højre side, og de to forklaringer under feltet er dets børn. Den rå tekst,
// decimalkommaet og parsningen hører hjemme ét sted — i talfeltet selv.
function BeloebFelt({ post, saet, setField, setProrata }) {
  const { gruppe, noegle, label, hint } = post
  const pro = erProrata(saet, gruppe, noegle)
  // En ejendomspost er kun fradragsberettiget med den udlejede andel (ADR-0003). Det skal
  // stå ved feltet selv: ellers ville tallet i feltet og tallet i totalen være to
  // forskellige beløb uden nogen forklaring imellem.
  // `post` er gruppeopgørelsens linje, og den bærer selv svaret på om andelen har skåret
  // netop dette beløb ned — så feltet, kassen nedenfor og regnskabet ikke kan komme til
  // at være uenige om hvilke poster der er ramt.
  const andelPct = udlejetAndel(saet)
  return (
    <NumberField
      label={label}
      hint={hint}
      suffix={pro ? 'kr./md' : 'kr.'}
      // `|| ''` og ikke `?? ''`: HER er 0 kr. og intet beløb det samme tal — begge læses
      // som 0 af summeringen — så et 0 vises som et tomt felt frem for som et ciffer
      // brugeren skal slette først. Talsættet fødes med 0 på hver eneste post
      // (tomtSaet), og et kort fyldt med nuller ville skjule hvad der faktisk er tastet.
      // Modstykket er den udlejede andel nedenfor, hvor 0 % og uoplyst IKKE er samme tal
      // (ADR-0008); den bruger derfor `??`.
      value={saet[gruppe]?.[noegle] || ''}
      onChange={v => setField(gruppe, noegle, v)}
      labelExtra={
        <span className="hint" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer', fontWeight: 400 }}>
          <input type="checkbox" checked={pro} onChange={e => setProrata(gruppe, noegle, e.target.checked)} style={{ width: 'auto', margin: 0 }} />
          pr. måned
        </span>
      }
    >
      {pro && <span className="hint">= {kr(effektivBeloeb(saet, gruppe, noegle))} for perioden</span>}
      {post.andel && (
        <span className="hint">
          ejendomspost · fradrag {kr(post.beloeb)} ved {pct(andelPct)} udlejet andel
        </span>
      )}
    </NumberField>
  )
}

// Hjemløs post: en værdi gemt under en nøgle kontoplanen ikke kender. Den tælles med
// i gruppens total (ADR-0001), og skal derfor også kunne SES — ellers stemmer de viste
// rækker ikke med totalen. Vises med nøgle og beløb, men kan ikke redigeres her:
// en værdi uden en post i kontoplanen har hverken navn eller plads i regnskabet.
// Baggrunden er --surface-2 (findes i begge temaer), ikke en fast lys farve.
function HjemloesePoster({ poster }) {
  return (
    <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
      <p style={{ margin: 0 }}><span className="badge warn">Hjemløse poster</span></p>
      <table className="data" style={{ marginTop: 8 }}>
        <thead>
          <tr><th>Nøgle</th><th className="num">Beløb</th></tr>
        </thead>
        <tbody>
          {poster.map(p => (
            <tr key={p.id}>
              <td><code>{p.id}</code>{p.prorata && <span className="hint"> · pr. måned</span>}</td>
              <td className="num">{kr(p.beloeb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        Gemt under en nøgle kontoplanen ikke kender. Beløbet tælles med i totalen herunder,
        så rækkerne stemmer — men posten kan ikke rettes her.
      </p>
    </div>
  )
}

// Hvilke poster den udlejede andel rammer, med det afholdte beløb ved siden af fradraget
// (ADR-0003). Uden den ville et par af udgiftsfelterne tavst tælle mindre med i totalen
// end det tal der står i feltet — altså præcis den black box andelen ikke må være.
// Vises kun når andelen faktisk har skåret noget fra.
//
// Sumrækken er ejendomsposternes egen — ikke hele gruppens. En total der ikke kan lægges
// sammen af de rækker der står over den, læses som en regnefejl (ADR-0001). Gruppens
// total står lige under kassen, hvor alle dens poster hører til.
//
// Baggrunden er --surface-2 og mærket .badge.neutral, som findes i begge temaer.
function AndelsPoster({ poster, andelPct }) {
  const sumFoerAndel = poster.reduce((s, p) => s + p.beloebFoerAndel, 0)
  const sum = poster.reduce((s, p) => s + p.beloeb, 0)
  return (
    <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
      <p style={{ margin: 0 }}><span className="badge neutral">Udlejet andel: {pct(andelPct)}</span></p>
      <table className="data" style={{ marginTop: 8 }}>
        <thead>
          <tr><th>Ejendomspost</th><th className="num">Afholdt</th><th className="num">Fradrag</th></tr>
        </thead>
        <tbody>
          {poster.map(p => (
            <tr key={p.id}>
              <td>{p.label}</td>
              <td className="num">{kr(p.beloebFoerAndel)}</td>
              <td className="num">{kr(p.beloeb)}</td>
            </tr>
          ))}
          <tr>
            <td><strong>Ejendomsposter i alt</strong></td>
            <td className="num">{kr(sumFoerAndel)}</td>
            <td className="num"><strong>{kr(sum)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        Det er kolonnen “Fradrag” der tæller med i gruppens total; “Afholdt” er det bilagene
        skal dokumentere. Gruppens øvrige poster indgår fuldt ud.
      </p>
    </div>
  )
}

// Ét kort pr. gruppe i kontoplanen: felterne bygges af kontoplanen, ikke af en liste
// her i komponenten, og totalen er gruppens egen sum — inklusive hjemløse poster.
function GruppeKort({ titel, gruppe, saet, setField, setProrata }) {
  const g = gruppeOpgoerelse(saet, gruppe)
  const ramte = g.poster.filter(p => p.andel)   // linjen bærer selv svaret (ADR-0003)
  return (
    <div className="card">
      <h2>{titel}</h2>
      <div className="grid">
        {g.poster.map(p => (
          <BeloebFelt key={p.id} post={p} saet={saet} setField={setField} setProrata={setProrata} />
        ))}
      </div>
      {g.hjemloese.length > 0 && <HjemloesePoster poster={g.hjemloese} />}
      {ramte.length > 0 && <AndelsPoster poster={ramte} andelPct={g.andelPct} />}
      <p className="muted" style={{ marginTop: 10 }}>I alt: <strong>{kr(g.sum)}</strong></p>
    </div>
  )
}

// Kvitteringsformularen: fritekst-begrundelsen for en afvigelse der ikke er kvitteret
// (eller hvis kvittering ikke længere dækker). Er der kvitteret før for andre datoer,
// prefilles teksten — den skal kunne genbruges, men ikke gælde af sig selv.
// Kalderen giver komponenten en `key` bundet til perioderne, så feltet nulstilles når
// afvigelsen bliver en anden.
function KvitterAfvigelse({ afvigelse, onKvitter }) {
  const [tekst, setTekst] = useState(afvigelse.foraeldet_begrundelse || '')
  return (
    <>
      {afvigelse.foraeldet && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
          Der er tidligere kvitteret med “{afvigelse.foraeldet_begrundelse}”, men perioden er
          ændret siden — begrundelsen dækker ikke den afvigelse der står nu.
        </p>
      )}
      <div className="field" style={{ marginTop: 10 }}>
        <label>Begrundelse for afvigelsen</label>
        <textarea
          rows={2}
          value={tekst}
          onChange={e => setTekst(e.target.value)}
          placeholder="fx: Faktisk indflytning skete 6. august, dagen efter kontraktens start."
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn ghost" disabled={!tekst.trim()} onClick={() => onKvitter(periodeKvittering(afvigelse, tekst))}>
          Kvittér med begrundelse
        </button>
      </div>
    </>
  )
}

function Redigering({ saet, loans, persons, property, fordeling, grundlag, setField, setRente, setProrata, setPeriode, setKvittering }) {
  const resultat = resultatFoerRenter(saet)
  const opg = personOpgoerelse(saet, { persons, property, loans, fordeling })
  const pmdr = prorataMaaneder(saet)
  const afvigelse = periodeAfvigelse(saet, grundlag)
  // Renteskønnet gøres op ÉN gang pr. lån og genbruges af knappen, hintet og advarslen,
  // så de tre ikke kan komme til at bygge på hver sit opslag.
  const skoen = loans.map(laan => ({ laan, s: renteskoen(laan, grundlag.aar) }))

  return (
    <>
      <div className="card">
        <h2>Udlejningsperiode</h2>
        <h3>Udledt fra lejekontrakten, klippet til året. Styrer udlejningsdage og fordeler beløb markeret “pr. måned”.</h3>
        <div className="grid">
          <TextField label="Fra dato" type="date" value={saet.fra_dato || ''} onChange={v => setField(null, 'fra_dato', v)} />
          <TextField label="Til dato" type="date" value={saet.til_dato || ''} onChange={v => setField(null, 'til_dato', v)} />
          {/* Samme andel indberettes til skat.dk (felt 744) og regnes fradrag på (ADR-0003).
              Hintet siger hvad den gør, så en ændring fra 100 ikke er en tavs nedskrivning.
              `?? ''` og ikke `|| ''`: 0 % er en rigtig andel, der nulstiller ejendoms-
              posternes fradrag, og et felt der så tomt ud ville skjule præcis det. */}
          <NumberField
            label="Udlejet andel"
            hint="rammer kun ejendomsposter, aldrig indtægter"
            value={saet.udlejet_andel_pct ?? ''}
            onChange={v => setField(null, 'udlejet_andel_pct', v)}
            suffix="%"
          />
        </div>
        {/* Et hul-år kan ikke længere OPRETTES, men et år kan blive et: rettes
            lejekontrakten bagefter, står året tilbage uden en kontrakt der dækker det.
            Årets tal røres ikke — de er indtastet og kan være indberettet — men
            fraværet siges højt, så et dagstal til skat.dk ikke står uden hjemmel.
            Baggrunden er --surface-2, som findes i begge temaer. */}
        {!grundlag?.lease && (
          <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ margin: 0 }}><span className="badge warn">Ingen lejekontrakt dækker {grundlag.aar}</span></p>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Året er oprettet, men ingen af lejekontrakterne dækker det — enten er kontrakten
              rettet siden, eller året stammer fra før hul-år blev afvist. Tallene herunder er
              dine egne og røres ikke. Opret den lejekontrakt der gælder for {grundlag.aar}, eller slet
              året, hvis der ikke blev lejet ud.
            </p>
          </div>
        )}

        {/* Uden periode vises flaget i stedet for et dagstal (ADR-0002). Et "0 dage"
            eller det tidligere 360 ville begge være svar appen selv havde fundet på. */}
        {manglerPeriode(saet) ? (
          <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ margin: 0 }}><span className="badge warn">Periode mangler</span></p>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Udfyld både fra- og til-dato. Uden en udlejningsperiode kan hverken udlejningsdage
              eller dagstallet til skat.dk (felt 748 / rubrik 207) beregnes — og appen gætter dem ikke.
              Beløb markeret “pr. måned” fordeles også efter perioden: uden den regnes de som et
              helt år, så både beløbene og resultatet herunder skal kontrolleres.
            </p>
          </div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 10 }}>
              <strong>{udlejningsdage(saet)} udlejningsdage</strong> (faktiske kalenderdage) · {pmdr.toLocaleString('da-DK', { maximumFractionDigits: 2 })} måneder til pro rata-fordeling
            </p>
            {/* SKAT regner disse dagsfelter i 30/360 — vis begge tal, så forskellen er synlig ved indtastning. */}
            <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              Til skat.dk (felt 748 / rubrik 207): <strong>{udlejningsdage360(saet)} dage</strong> — skemaet regner
              en kalendermåned som 30 dage og indkomståret som 360 dage.
            </p>
          </>
        )}

        {/* Perioden er gemt ved oprettelsen; er lejekontrakten rettet siden, vises forskellen her.
            Er afvigelsen kvitteret med en begrundelse, vises den neutralt: en advarsel der
            aldrig kan gå væk på et korrekt år, lærer brugeren at ignorere advarsler. */}
        {afvigelse && (
          <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ margin: 0 }}>
              {afvigelse.kvitteret
                ? <span className="badge neutral">Bevidst afvigelse fra lejekontrakten</span>
                : <span className="badge warn">Afviger fra lejekontrakten</span>}
            </p>
            <table className="data" style={{ marginTop: 8 }}>
              <thead>
                <tr><th></th><th>Periode</th><th className="num">Kalenderdage</th><th className="num">Til skat.dk</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Gemt her</td>
                  <td>{afvigelse.gemt.fra_dato || '—'} → {afvigelse.gemt.til_dato || '—'}</td>
                  {/* Mangler den gemte periode, er 0 ikke et dagstal — det er fraværet af et. */}
                  <td className="num">{manglerPeriode(saet) ? '—' : afvigelse.gemt.dage}</td>
                  <td className="num"><strong>{manglerPeriode(saet) ? '—' : afvigelse.gemt.dage360}</strong></td>
                </tr>
                <tr>
                  <td>Lejekontrakten</td>
                  <td>{afvigelse.afledt.fra_dato} → {afvigelse.afledt.til_dato}</td>
                  <td className="num">{afvigelse.afledt.dage}</td>
                  <td className="num"><strong>{afvigelse.afledt.dage360}</strong></td>
                </tr>
              </tbody>
            </table>
            {afvigelse.kvitteret ? (
              <>
                <p style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                  <span className="muted">Begrundelse: </span>{afvigelse.begrundelse}
                </p>
                <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Begrundelsen står i årsregnskabets note. Perioden er uændret — kvitteringen
                  forklarer afvigelsen, den retter den ikke. Ændrer du perioden eller
                  lejekontrakten, dækker begrundelsen ikke længere, og advarslen vender tilbage.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn ghost" onClick={() => setKvittering(null)}>Fjern begrundelsen</button>
                  <button className="btn ghost" onClick={() => setPeriode(afvigelse.afledt.fra_dato, afvigelse.afledt.til_dato)}>
                    Brug lejekontraktens periode
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                  Perioden blev gemt da året blev oprettet — lejekontrakten kan være rettet siden.
                  Har du bevidst overstyret perioden, kan du kvittere med en begrundelse: så vises
                  afvigelsen neutralt, og begrundelsen følger med i årsregnskabets note.
                </p>
                {/* Mangler den gemte periode, er der intet at kvittere for: et fravær
                    forklares ikke, det udfyldes (ADR-0002). Boksen "Periode mangler"
                    ovenfor siger allerede hvad der skal gøres. */}
                {manglerPeriode(saet) ? (
                  <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                    Udfyld først udlejningsperioden — en manglende periode kan ikke kvitteres,
                    kun rettes.
                  </p>
                ) : (
                  <KvitterAfvigelse
                    key={[afvigelse.gemt.fra_dato, afvigelse.gemt.til_dato, afvigelse.afledt.fra_dato, afvigelse.afledt.til_dato, afvigelse.foraeldet_begrundelse].join('|')}
                    afvigelse={afvigelse}
                    onKvitter={setKvittering}
                  />
                )}
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setPeriode(afvigelse.afledt.fra_dato, afvigelse.afledt.til_dato)}>
                  Brug lejekontraktens periode
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <GruppeKort titel="Indtægter" gruppe="indtaegter" saet={saet} setField={setField} setProrata={setProrata} />

      <GruppeKort titel="Fradragsberettigede udgifter" gruppe="udgifter" saet={saet} setField={setField} setProrata={setProrata} />

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
          {/* Knappen er den ENE vej et skøn kan lande i feltet, og den er brugerens eget
              klik. Skønnet skrives aldrig af sig selv oven i et tal der står. */}
          {loans.length > 0 && (
            <button className="btn ghost" onClick={() => skoen.forEach(({ laan, s }) => setRente(laan.id, s.beloeb))}>
              ↻ Beregn fra stamdata
            </button>
          )}
        </div>
        {loans.length === 0 && <p className="muted">Tilføj lån under Stamdata for at indtaste renter.</p>}
        <div className="grid">
          {skoen.map(({ laan, s }) => (
            <NumberField
              key={laan.id}
              label={laanNavn(laan)}
              hint={skoenHint(s, grundlag.aar)}
              value={saet.renteudgifter[laan.id] || ''}
              onChange={v => setRente(laan.id, v)}
            />
          ))}
        </div>
        {/* Peildato-advarslen: restgælden er målt langt fra året, så skønnet er svagt.
            Den står her, hvor skønnet bruges — Lån-fanen kender ikke noget år.
            Baggrunden er --surface-2, som findes i begge temaer. */}
        {skoen.filter(({ s }) => s.peildatoAdvarsel).map(({ laan, s }) => (
          <div key={laan.id} style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ margin: 0 }}>
              <span className="badge warn">Svagt renteskøn — {laanNavn(laan)}</span>
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>{s.peildatoAdvarsel}</p>
          </div>
        ))}
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
