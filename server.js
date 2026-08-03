import express from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'
import { bilagForAar, medBilagsnumre, migrerBilag } from './src/lib/bilag.js'
import { maaAarOprettes, saetTilNytAar } from './src/lib/beregning.js'
import {
  validerAar, validerEjendom, validerLaan, validerLejekontrakt,
  validerBilag, validerIndstillinger, validerFeltmappinger,
} from './src/lib/validering.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// DB-sti kan overrides med env var (peg på en persistent volume i container)
const DB_PATH = process.env.DB_PATH || join(__dirname, 'udlejning-data.json')
// Bilag-filer gemmes på disk (ikke i JSON'en), så DB'en holdes lille.
const BILAG_DIR = process.env.BILAG_DIR || join(__dirname, 'bilag')
if (!existsSync(BILAG_DIR)) mkdirSync(BILAG_DIR, { recursive: true })

// Standardindstillinger. Satser/beløbsgrænser SKAL verificeres mod skat.dk /
// Den juridiske vejledning pr. år før de bruges — se README + Indstillinger.
const DEFAULT_SETTINGS = {
  skatteordning: 'almindelige',      // forældrekøb kun til nærtstående → almindelige regler
  feltmapping_aar: 2026,             // hvilket års default-feltmapping der bruges
  gaveafgift_bundgraense: 76900,     // kr. pr. giver pr. modtager (VERIFICÉR pr. år)
  markedsleje_advarsel_pct: 5,       // advar hvis aftalt leje er > X% under markedsleje
  fordeling_mode: 'alt_paa_en',      // 'alt_paa_en' (§25 A) | 'del' (§25 A stk. 8)
  beskattet_person_id: null,         // null = udled fra rollen 'udlejer'
}

const emptyDb = () => ({
  persons: [],          // { id, navn, cpr, rolle: 'udlejer' | 'medejer' }
  property: null,       // singleton
  loans: [],            // { id, type, laangiver, hovedstol, restgaeld, restgaeld_dato, rente_pct, haeftelse{} }
  leases: [],           // lejekontrakter til datteren (én aktiv pr. år) { id, startdato, slutdato, maanedlig_leje, ... }
  years: [],            // { id, aar, budget:{...}, faktisk:{...} }
  bilag: [],            // { id, aar, dato, tekst, beloeb, post_id, type, filnavn, mimetype, filsti }
                        // (post_id = id på en post i kontoplanen; nummeret gemmes ikke —
                        //  det udledes af årets liste, se src/lib/bilag.js)
  settings: { ...DEFAULT_SETTINGS },
  field_mappings: {},   // overrides: { "2026-forskud": [ {felt_nr,label,kilde} ] }; tom = brug defaults i frontend
  nextPersonId: 1,
  nextLoanId: 1,
  nextLeaseId: 1,
  nextYearId: 1,
  nextBilagId: 1,
})

function loadDb() {
  if (!existsSync(DB_PATH)) return emptyDb()
  try {
    const db = JSON.parse(readFileSync(DB_PATH, 'utf8'))

    // Migreringer: sørg for at nye felter/samlinger findes på gamle DB-filer.
    if (!db.persons) db.persons = []
    if (!db.loans) db.loans = []
    if (!db.years) db.years = []
    if (db.property === undefined) db.property = null
    if (!db.field_mappings) db.field_mappings = {}
    if (!db.bilag) db.bilag = []
    // Ryd gamle, gemte bilagsnumre. De blev overskrevet ved læsning i forvejen og var
    // derfor allerede forkerte på disken; nummeret udledes nu ét sted (src/lib/bilag.js).
    // Ikke en migrering der skal til for at serveres korrekt — den fjerner den anden sandhed.
    for (const b of db.bilag) delete b.nummer
    // Migrér bilagets frie kategoritekst til en post i kontoplanen (ADR-0005).
    // Oversættelsen selv ligger i src/lib/bilag.js, hvor den kan testes rent; her
    // udføres den, så den skrives med på disken ved næste gemning — som lease→leases.
    // Kan en kategori ikke oversættes, bevares den og markeres frem for at gå tabt.
    db.bilag = migrerBilag(db.bilag)
    if (!db.nextPersonId) db.nextPersonId = 1
    if (!db.nextLoanId) db.nextLoanId = 1
    if (!db.nextYearId) db.nextYearId = 1
    if (!db.nextBilagId) db.nextBilagId = 1

    // Migrér singleton-lejekontrakt → liste af kontrakter (én aktiv pr. år).
    if (!db.leases) db.leases = []
    if (db.lease) { db.leases.push({ id: db.leases.length + 1, ...db.lease }); delete db.lease }
    if (!db.nextLeaseId) db.nextLeaseId = db.leases.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1

    // Merge settings med defaults (tilføjer nye nøgler hvis de mangler)
    db.settings = { ...DEFAULT_SETTINGS, ...(db.settings ?? {}) }

    return db
  } catch { return emptyDb() }
}

function saveDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
}

// Skriveendepunkterne afviser data der ikke har domænets form — beløb der ikke er tal,
// datoer der ikke er datoer, poster kontoplanen ikke kender — med en dansk begrundelse
// frem for at gemme dem. Reglerne selv er rene funktioner i src/lib/validering.js, så
// de kan testes uden at starte en server; her udføres de, ét sted pr. endepunkt.
// Værnet gælder ENHVER klient, ikke kun brugerfladen: et fremtidigt endepunkt eller en
// klient med en fejl skriver gennem de samme døre.
//
// Det dækker de endepunkter der bærer et tal eller en dato: år, ejendom, lån,
// lejekontrakter, bilag, indstillinger og feltmappingens nøgler. Kun personer står
// uden for — de bærer hverken tal eller datoer, kun navn, cpr og rolle.
const afvis = (res, svar) => res.status(400).json({ error: svar.begrundelse })

const app = express()
app.use(express.json({ limit: '25mb' }))   // bilag sendes som base64 → større limit
app.use(express.static(join(__dirname, 'dist')))

// ── Health check (til container/orchestrator) ────────
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// ── Persons (ægtefæller) ─────────────────────────────
app.get('/api/persons', (req, res) => {
  res.json(loadDb().persons)
})
app.post('/api/persons', (req, res) => {
  const db = loadDb()
  const { navn, cpr, rolle } = req.body
  const person = { id: db.nextPersonId++, navn: navn ?? '', cpr: cpr ?? '', rolle: rolle ?? 'medejer' }
  db.persons.push(person)
  saveDb(db)
  res.json(person)
})
app.put('/api/persons/:id', (req, res) => {
  const db = loadDb()
  const { navn, cpr, rolle } = req.body
  const p = db.persons.find(p => p.id === Number(req.params.id))
  if (p) { p.navn = navn; p.cpr = cpr; p.rolle = rolle }
  saveDb(db)
  res.json({ success: true })
})
app.delete('/api/persons/:id', (req, res) => {
  const db = loadDb()
  db.persons = db.persons.filter(p => p.id !== Number(req.params.id))
  saveDb(db)
  res.json({ success: true })
})

// ── Property (singleton — lejligheden) ───────────────
app.get('/api/property', (req, res) => {
  res.json(loadDb().property)
})
app.put('/api/property', (req, res) => {
  const db = loadDb()
  const svar = validerEjendom(req.body)
  if (!svar.ok) return afvis(res, svar)
  db.property = req.body ?? null
  saveDb(db)
  res.json(db.property)
})

// ── Loans (lån i lejligheden) ────────────────────────
app.get('/api/loans', (req, res) => {
  res.json(loadDb().loans)
})
app.post('/api/loans', (req, res) => {
  const db = loadDb()
  const svar = validerLaan(req.body)
  if (!svar.ok) return afvis(res, svar)
  const { type, laangiver, hovedstol, restgaeld, restgaeld_dato, rente_pct, haeftelse } = req.body
  const loan = {
    id: db.nextLoanId++,
    type: type ?? 'realkredit',
    laangiver: laangiver ?? '',
    hovedstol: hovedstol ?? 0,
    restgaeld: restgaeld ?? 0,
    restgaeld_dato: restgaeld_dato ?? '',   // peildato for restgælden (fx bankens 31/12-indberetning)
    rente_pct: rente_pct ?? 0,
    haeftelse: haeftelse ?? {},   // { personId: pct }
  }
  db.loans.push(loan)
  saveDb(db)
  res.json(loan)
})
app.put('/api/loans/:id', (req, res) => {
  const db = loadDb()
  const svar = validerLaan(req.body)
  if (!svar.ok) return afvis(res, svar)
  const { type, laangiver, hovedstol, restgaeld, restgaeld_dato, rente_pct, haeftelse } = req.body
  const l = db.loans.find(l => l.id === Number(req.params.id))
  if (l) {
    l.type = type; l.laangiver = laangiver; l.hovedstol = hovedstol
    l.restgaeld = restgaeld; l.restgaeld_dato = restgaeld_dato ?? ''
    l.rente_pct = rente_pct; l.haeftelse = haeftelse ?? {}
  }
  saveDb(db)
  res.json({ success: true })
})
app.delete('/api/loans/:id', (req, res) => {
  const db = loadDb()
  db.loans = db.loans.filter(l => l.id !== Number(req.params.id))
  saveDb(db)
  res.json({ success: true })
})

// ── Leases (lejekontrakter — én aktiv pr. år) ────────
app.get('/api/leases', (req, res) => {
  res.json(loadDb().leases)
})
app.post('/api/leases', (req, res) => {
  const db = loadDb()
  const svar = validerLejekontrakt(req.body)
  if (!svar.ok) return afvis(res, svar)
  const lease = { id: db.nextLeaseId++, ...(req.body ?? {}) }
  db.leases.push(lease)
  saveDb(db)
  res.json(lease)
})
app.put('/api/leases/:id', (req, res) => {
  const db = loadDb()
  const svar = validerLejekontrakt(req.body)
  if (!svar.ok) return afvis(res, svar)
  const idx = db.leases.findIndex(l => l.id === Number(req.params.id))
  if (idx !== -1) db.leases[idx] = { ...db.leases[idx], ...(req.body ?? {}), id: db.leases[idx].id }
  saveDb(db)
  res.json({ success: true })
})
app.delete('/api/leases/:id', (req, res) => {
  const db = loadDb()
  db.leases = db.leases.filter(l => l.id !== Number(req.params.id))
  saveDb(db)
  res.json({ success: true })
})

// ── Years (årets tal) ────────────────────────────────
app.get('/api/years', (req, res) => {
  res.json(loadDb().years)
})
app.post('/api/years', (req, res) => {
  const db = loadDb()
  const { aar, budget, faktisk } = req.body
  const aarN = Number(aar)
  // Lejekontrakterne afgør hvilke år der kan oprettes — reglen selv bor i
  // beregningslaget, så serveren og klienten svarer med samme tekst (ADR-0002).
  const svar = maaAarOprettes(db.leases, aarN)
  if (!svar.ok) return afvis(res, svar)
  if (db.years.find(y => y.aar === aarN))
    return res.status(400).json({ error: 'Året findes allerede' })
  // Et nyt år har ingen gemte hjemløse poster at bære med sig — det fødes af
  // kontoplanen, og en post kontoplanen ikke kender kan derfor ikke være legitim her.
  const form = validerAar(req.body)
  if (!form.ok) return afvis(res, form)
  // Årets udlejningsperiode udledes af lejekontrakten HER, frem for at året fødes med
  // det talsæt klienten måtte have sendt. Et år oprettet direkte mod API'et får derfor
  // også sin periode — også når kalderen sender et tomt talsæt (ADR-0002). Hvert
  // grundlag gøres op for sig, så budget og faktisk ikke deler tal.
  const kontekst = { leases: db.leases, property: db.property, loans: db.loans, aar: aarN }
  const year = {
    id: db.nextYearId++, aar: aarN,
    budget: saetTilNytAar(kontekst, budget),
    faktisk: saetTilNytAar(kontekst, faktisk),
  }
  db.years.push(year)
  saveDb(db)
  res.json(year)
})
app.put('/api/years/:id', (req, res) => {
  const db = loadDb()
  const { aar, budget, faktisk } = req.body
  const y = db.years.find(y => y.id === Number(req.params.id))
  // Året som det står gemt er det eneste sted en hjemløs post kan komme fra: bærer
  // årets talsæt allerede en nøgle kontoplanen ikke kender, kan den gemmes igen
  // (ADR-0001) — en ny af slagsen kan ikke.
  const svar = validerAar(req.body, y)
  if (!svar.ok) return afvis(res, svar)
  if (y) {
    if (aar !== undefined) y.aar = Number(aar)
    if (budget !== undefined) y.budget = budget
    if (faktisk !== undefined) y.faktisk = faktisk
  }
  saveDb(db)
  res.json({ success: true })
})
app.delete('/api/years/:id', (req, res) => {
  const db = loadDb()
  db.years = db.years.filter(y => y.id !== Number(req.params.id))
  saveDb(db)
  res.json({ success: true })
})

// ── Settings ─────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json(loadDb().settings)
})
app.put('/api/settings', (req, res) => {
  const db = loadDb()
  const svar = validerIndstillinger(req.body)
  if (!svar.ok) return afvis(res, svar)
  db.settings = { ...db.settings, ...req.body }
  saveDb(db)
  res.json(db.settings)
})

// ── Field mappings (overrides til skat.dk-felter) ────
app.get('/api/field-mappings', (req, res) => {
  res.json(loadDb().field_mappings)
})
app.put('/api/field-mappings', (req, res) => {
  const db = loadDb()
  const svar = validerFeltmappinger(req.body)
  if (!svar.ok) return afvis(res, svar)
  db.field_mappings = req.body ?? {}
  saveDb(db)
  res.json(db.field_mappings)
})

// ── Bilag ────────────────────────────────────────────
// Liste (metadata only; filsti udelades ikke, men filen hentes separat).
// Nummereringen ligger i src/lib/bilag.js — se dér for hvorfor nummeret beregnes
// ved læsning og aldrig gemmes.
app.get('/api/bilag', (req, res) => {
  const db = loadDb()
  res.json(req.query.aar ? bilagForAar(db.bilag, req.query.aar) : medBilagsnumre(db.bilag))
})

// Upload: fil sendes som base64 (data-URL eller ren base64) i JSON-body.
app.post('/api/bilag', (req, res) => {
  const db = loadDb()
  const svar = validerBilag(req.body)
  if (!svar.ok) return afvis(res, svar)
  const { aar, dato, tekst, beloeb, post_id, type, filnavn, mimetype, data } = req.body
  const id = db.nextBilagId++
  let filsti = null
  if (data) {
    const base64 = String(data).includes(',') ? String(data).split(',')[1] : String(data)
    const ext = extname(filnavn || '') || (mimetype === 'application/pdf' ? '.pdf' : '.bin')
    filsti = `${id}${ext}`   // filnavn udledes af id — ingen path traversal fra brugerinput
    writeFileSync(join(BILAG_DIR, filsti), Buffer.from(base64, 'base64'))
  }
  // Intet `nummer` gemmes — det udledes af årets liste ved læsning (src/lib/bilag.js).
  const bilag = {
    id, aar: Number(aar),
    dato: dato ?? '', tekst: tekst ?? '', beloeb: beloeb ?? 0,
    post_id: post_id ?? null, type: type ?? 'udgift',
    filnavn: filnavn ?? '', mimetype: mimetype ?? '', filsti,
  }
  db.bilag.push(bilag)
  saveDb(db)
  // Svar med bilaget som det serveres — altså med det udledte nummer.
  res.json(bilagForAar(db.bilag, bilag.aar).find(b => b.id === id))
})

// Hent selve filen (til preview i UI og til PDF-generering).
app.get('/api/bilag/:id/fil', (req, res) => {
  const b = loadDb().bilag.find(x => x.id === Number(req.params.id))
  if (!b || !b.filsti) return res.status(404).end()
  const p = join(BILAG_DIR, b.filsti)
  if (!existsSync(p)) return res.status(404).end()
  res.setHeader('Content-Type', b.mimetype || 'application/octet-stream')
  res.send(readFileSync(p))
})

app.put('/api/bilag/:id', (req, res) => {
  const db = loadDb()
  const b = db.bilag.find(x => x.id === Number(req.params.id))
  // Bilaget som det står gemt: bærer det en post kontoplanen ikke kender — en gammel
  // kategori der ikke kunne oversættes — må den gemmes igen frem for at gå tabt.
  const svar = validerBilag(req.body, b)
  if (!svar.ok) return afvis(res, svar)
  if (b) {
    const { dato, tekst, beloeb, post_id, type } = req.body
    if (dato !== undefined) b.dato = dato
    if (tekst !== undefined) b.tekst = tekst
    if (beloeb !== undefined) b.beloeb = beloeb
    // Vælges en post, ryger den bevarede (uoversættelige) kategori — ellers ville
    // bilaget bære to sandheder om hvad det dokumenterer.
    if (post_id !== undefined) { b.post_id = post_id; delete b.kategori }
    if (type !== undefined) b.type = type
  }
  saveDb(db)
  res.json({ success: true })
})

app.delete('/api/bilag/:id', (req, res) => {
  const db = loadDb()
  const b = db.bilag.find(x => x.id === Number(req.params.id))
  if (b?.filsti) { try { unlinkSync(join(BILAG_DIR, b.filsti)) } catch { /* filen mangler allerede */ } }
  db.bilag = db.bilag.filter(x => x.id !== Number(req.params.id))
  saveDb(db)
  res.json({ success: true })
})

// ── SPA fallback ─────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => console.log(`Udlejningsbeskatning kører på http://localhost:${PORT}`))
