import express from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'

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
  loans: [],            // { id, type, laangiver, hovedstol, restgaeld, rente_pct, haeftelse{} }
  lease: null,          // singleton (lejekontrakt til datteren)
  years: [],            // { id, aar, budget:{...}, faktisk:{...} }
  bilag: [],            // { id, aar, nummer, dato, tekst, beloeb, kategori, type, filnavn, mimetype, filsti }
  settings: { ...DEFAULT_SETTINGS },
  field_mappings: {},   // overrides: { "2026-forskud": [ {felt_nr,label,kilde} ] }; tom = brug defaults i frontend
  nextPersonId: 1,
  nextLoanId: 1,
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
    if (db.lease === undefined) db.lease = null
    if (!db.field_mappings) db.field_mappings = {}
    if (!db.bilag) db.bilag = []
    if (!db.nextPersonId) db.nextPersonId = 1
    if (!db.nextLoanId) db.nextLoanId = 1
    if (!db.nextYearId) db.nextYearId = 1
    if (!db.nextBilagId) db.nextBilagId = 1

    // Merge settings med defaults (tilføjer nye nøgler hvis de mangler)
    db.settings = { ...DEFAULT_SETTINGS, ...(db.settings ?? {}) }

    return db
  } catch { return emptyDb() }
}

function saveDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
}

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
  const { type, laangiver, hovedstol, restgaeld, rente_pct, haeftelse } = req.body
  const loan = {
    id: db.nextLoanId++,
    type: type ?? 'realkredit',
    laangiver: laangiver ?? '',
    hovedstol: hovedstol ?? 0,
    restgaeld: restgaeld ?? 0,
    rente_pct: rente_pct ?? 0,
    haeftelse: haeftelse ?? {},   // { personId: pct }
  }
  db.loans.push(loan)
  saveDb(db)
  res.json(loan)
})
app.put('/api/loans/:id', (req, res) => {
  const db = loadDb()
  const { type, laangiver, hovedstol, restgaeld, rente_pct, haeftelse } = req.body
  const l = db.loans.find(l => l.id === Number(req.params.id))
  if (l) {
    l.type = type; l.laangiver = laangiver; l.hovedstol = hovedstol
    l.restgaeld = restgaeld; l.rente_pct = rente_pct; l.haeftelse = haeftelse ?? {}
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

// ── Lease (singleton — lejekontrakt) ─────────────────
app.get('/api/lease', (req, res) => {
  res.json(loadDb().lease)
})
app.put('/api/lease', (req, res) => {
  const db = loadDb()
  db.lease = req.body ?? null
  saveDb(db)
  res.json(db.lease)
})

// ── Years (årets tal) ────────────────────────────────
app.get('/api/years', (req, res) => {
  res.json(loadDb().years)
})
app.post('/api/years', (req, res) => {
  const db = loadDb()
  const { aar, budget, faktisk } = req.body
  if (db.years.find(y => y.aar === Number(aar)))
    return res.status(400).json({ error: 'Året findes allerede' })
  const year = { id: db.nextYearId++, aar: Number(aar), budget: budget ?? {}, faktisk: faktisk ?? {} }
  db.years.push(year)
  saveDb(db)
  res.json(year)
})
app.put('/api/years/:id', (req, res) => {
  const db = loadDb()
  const { aar, budget, faktisk } = req.body
  const y = db.years.find(y => y.id === Number(req.params.id))
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
  db.field_mappings = req.body ?? {}
  saveDb(db)
  res.json(db.field_mappings)
})

// ── Bilag ────────────────────────────────────────────
// Liste (metadata only; filsti udelades ikke, men filen hentes separat).
app.get('/api/bilag', (req, res) => {
  const aar = req.query.aar ? Number(req.query.aar) : null
  let liste = loadDb().bilag
  if (aar) liste = liste.filter(b => b.aar === aar)
  res.json(liste)
})

// Upload: fil sendes som base64 (data-URL eller ren base64) i JSON-body.
app.post('/api/bilag', (req, res) => {
  const db = loadDb()
  const { aar, dato, tekst, beloeb, kategori, type, filnavn, mimetype, data } = req.body
  const id = db.nextBilagId++
  let filsti = null
  if (data) {
    const base64 = String(data).includes(',') ? String(data).split(',')[1] : String(data)
    const ext = extname(filnavn || '') || (mimetype === 'application/pdf' ? '.pdf' : '.bin')
    filsti = `${id}${ext}`   // filnavn udledes af id — ingen path traversal fra brugerinput
    writeFileSync(join(BILAG_DIR, filsti), Buffer.from(base64, 'base64'))
  }
  const nummer = Math.max(0, ...db.bilag.filter(b => b.aar === Number(aar)).map(b => b.nummer || 0)) + 1
  const bilag = {
    id, aar: Number(aar), nummer,
    dato: dato ?? '', tekst: tekst ?? '', beloeb: beloeb ?? 0,
    kategori: kategori ?? '', type: type ?? 'udgift',
    filnavn: filnavn ?? '', mimetype: mimetype ?? '', filsti,
  }
  db.bilag.push(bilag)
  saveDb(db)
  res.json(bilag)
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
  if (b) {
    const { dato, tekst, beloeb, kategori, type } = req.body
    if (dato !== undefined) b.dato = dato
    if (tekst !== undefined) b.tekst = tekst
    if (beloeb !== undefined) b.beloeb = beloeb
    if (kategori !== undefined) b.kategori = kategori
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
