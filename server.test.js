// ── Skriveendepunkternes værn ─────────────────────────────────────────────────
//
// Reglerne selv er rene funktioner i src/lib/validering.js og er testet dér, uden
// server. Testen her fastholder det andet halve: WIRINGEN. At hvert skriveendepunkt
// faktisk spørger sin validator, og at et afvist svar ikke skriver noget på disken.
//
// Den blev til, fordi ingen test ville have sagt fra ved en glemt `if (!svar.ok)` i
// ét enkelt endepunkt — eller ved et nyt skriveendepunkt der slet ikke spurgte
// (issue #18). Derfor to greb:
//
//   1. Hvert endepunkt kaldes med en krop der er forkert på præcis én måde, og skal
//      svare 400 med den danske begrundelse — og lade DB-filen i fred.
//   2. En optælling af appens EGNE registrerede ruter mod tabellen nedenfor, så et
//      nyt skriveendepunkt ikke kan tilføjes uden enten en række her eller en bevidst
//      undtagelse.
//
// Appen køres i processen mod en midlertidig DB-fil: server.js eksporterer `app` og
// binder først en port når filen køres som program. Nodes egen fetch rækker — ingen
// ny testafhængighed.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Den mindste database der gør alle skriveendepunkter tilgængelige: lejekontrakterne
// afgør hvilke år der overhovedet kan oprettes, så uden dem ville POST /api/years
// blive afvist af en anden regel end den vi måler på.
const FIXTUR = {
  persons: [{ id: 1, navn: 'Nanna', cpr: '', rolle: 'udlejer' }],
  property: { koebsdato: '2025-07-01', anskaffelsessum: 2000000, ejerandele: { 1: 50 } },
  loans: [{ id: 1, type: 'realkredit', laangiver: 'Bank', hovedstol: 1500000, restgaeld: 1500000, restgaeld_dato: '2025-12-31', startdato: '2025-07-01', rente_pct: 3, haeftelse: { 1: 50 } }],
  leases: [
    { id: 1, startdato: '2025-08-05', slutdato: '2025-12-31', maanedlig_leje: 4500 },
    { id: 2, startdato: '2026-01-01', slutdato: '', maanedlig_leje: 6000 },
  ],
  years: [{ id: 1, aar: 2025, budget: {}, faktisk: {} }],
  bilag: [{ id: 1, aar: 2025, dato: '2025-09-01', tekst: 'Grundskyld', beloeb: 1000, post_id: 'udgifter.grundskyld', type: 'udgift', filnavn: '', mimetype: '', filsti: null }],
  settings: {},
  field_mappings: {},
  nextPersonId: 2, nextLoanId: 2, nextLeaseId: 3, nextYearId: 2, nextBilagId: 2,
}

// Ét afvist kald pr. række: `rute` er ruten som appen har registreret den (den
// optælles til sidst), `url` er den konkrete adresse, og `krop` er forkert på præcis
// én måde. `begrundelse` er reglens egen tekst — den beviser at 400'eren kom fra
// værnet og ikke fra en stavefejl i adressen.
const SKRIVEENDEPUNKTER = [
  {
    metode: 'PUT', rute: '/api/property', url: '/api/property',
    krop: { koebsdato: 'i går' },
    begrundelse: /købsdatoen er ikke en gyldig dato/i,
  },
  {
    metode: 'POST', rute: '/api/loans', url: '/api/loans',
    krop: { laangiver: 'Bank', restgaeld: 'en million' },
    begrundelse: /restgælden er ikke et tal/i,
  },
  {
    metode: 'PUT', rute: '/api/loans/:id', url: '/api/loans/1',
    krop: { laangiver: 'Bank', restgaeld: 'en million' },
    begrundelse: /restgælden er ikke et tal/i,
  },
  {
    metode: 'POST', rute: '/api/leases', url: '/api/leases',
    krop: { startdato: '2025-13-01', maanedlig_leje: 4500 },
    begrundelse: /lejekontraktens startdato er ikke en gyldig dato/i,
  },
  {
    metode: 'PUT', rute: '/api/leases/:id', url: '/api/leases/1',
    krop: { startdato: '2025-13-01', maanedlig_leje: 4500 },
    begrundelse: /lejekontraktens startdato er ikke en gyldig dato/i,
  },
  {
    // 2027 er dækket af den åbne lejekontrakt og findes ikke i forvejen, så året MÅ
    // oprettes — det er talsættet der er forkert.
    metode: 'POST', rute: '/api/years', url: '/api/years',
    krop: { aar: 2027, budget: { udgifter: { vedligeholdelse: 'fem tusind' } } },
    begrundelse: /vedligeholdelse er ikke et tal/i,
  },
  {
    // Samme dør, det andet værn: lejekontrakterne afgør hvilke år der kan oprettes
    // (maaAarOprettes), og 2020 ligger før den tidligste kontrakt.
    metode: 'POST', rute: '/api/years', url: '/api/years',
    krop: { aar: 2020 },
    begrundelse: /lejekontrakt/i,
  },
  {
    metode: 'PUT', rute: '/api/years/:id', url: '/api/years/1',
    krop: { aar: 2025, budget: { udgifter: { vedligeholdelse: 'fem tusind' } } },
    begrundelse: /vedligeholdelse er ikke et tal/i,
  },
  {
    metode: 'PUT', rute: '/api/settings', url: '/api/settings',
    krop: { markedsleje_advarsel_pct: 500 },
    begrundelse: /markedsleje-advarslen skal være mellem 0 og 100/i,
  },
  {
    metode: 'PUT', rute: '/api/field-mappings', url: '/api/field-mappings',
    krop: { 'ikkeetaar-forskud': [] },
    begrundelse: /feltmappingens nøgle/i,
  },
  {
    metode: 'POST', rute: '/api/bilag', url: '/api/bilag',
    krop: { aar: 2025, dato: '2025-02-30', beloeb: 1000, post_id: 'udgifter.grundskyld' },
    begrundelse: /bilagets dato er ikke en gyldig dato/i,
  },
  {
    metode: 'PUT', rute: '/api/bilag/:id', url: '/api/bilag/1',
    krop: { dato: '2025-02-30', beloeb: 1000, post_id: 'udgifter.grundskyld' },
    begrundelse: /bilagets dato er ikke en gyldig dato/i,
  },
]

// Skriveendepunkter uden en krop at afvise — bevidst, ikke glemt. Står et endepunkt
// her, er det en beslutning nogen har taget, og begrundelsen står ved siden af.
const UDEN_VALIDERING = {
  // Personerne bærer hverken tal eller datoer, kun navn, cpr og rolle. Der er ingen
  // domæneform at afvise.
  'POST /api/persons': 'bærer hverken tal eller datoer',
  'PUT /api/persons/:id': 'bærer hverken tal eller datoer',
  // En sletning bærer ingen krop, kun en id i adressen.
  'DELETE /api/persons/:id': 'ingen krop',
  'DELETE /api/loans/:id': 'ingen krop',
  'DELETE /api/leases/:id': 'ingen krop',
  'DELETE /api/years/:id': 'ingen krop',
  'DELETE /api/bilag/:id': 'ingen krop',
}

// De metoder der skriver. GET og HEAD læser og har intet at afvise.
const SKRIVEMETODER = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const noegle = ({ metode, rute }) => `${metode} ${rute}`

let mappe, dbSti, app, server, adresse

before(async () => {
  mappe = mkdtempSync(join(tmpdir(), 'udlejning-server-test-'))
  dbSti = join(mappe, 'udlejning-data.json')
  writeFileSync(dbSti, JSON.stringify(FIXTUR, null, 2), 'utf8')
  // server.js læser DB_PATH og BILAG_DIR ved indlæsning — de skal stå før importen.
  process.env.DB_PATH = dbSti
  process.env.BILAG_DIR = join(mappe, 'bilag')
  ;({ app } = await import('./server.js'))
  server = app.listen(0)
  await new Promise((klar) => server.once('listening', klar))
  adresse = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((lukket) => server.close(lukket))
  rmSync(mappe, { recursive: true, force: true })
})

const skriv = (metode, url, krop) => fetch(`${adresse}${url}`, {
  method: metode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(krop),
})

for (const endepunkt of SKRIVEENDEPUNKTER) {
  test(`${endepunkt.metode} ${endepunkt.url} afviser en krop der ikke har domænets form`, async () => {
    const foer = readFileSync(dbSti, 'utf8')
    const svar = await skriv(endepunkt.metode, endepunkt.url, endepunkt.krop)
    assert.equal(svar.status, 400, `${noegle(endepunkt)} skulle være afvist`)
    const { error } = await svar.json()
    assert.match(error, endepunkt.begrundelse)
    assert.equal(readFileSync(dbSti, 'utf8'), foer, 'en afvist skrivning må ikke røre databasen')
  })
}

// Modstykket: værnet må ikke være blevet til et nej til alt. Gyldige tal skal stadig
// nå hele vejen ned på disken.
test('gyldige tal slipper igennem og bliver gemt', async () => {
  const svar = await skriv('PUT', '/api/settings', { gaveafgift_bundgraense: 80000 })
  assert.equal(svar.status, 200)
  const hentet = await (await fetch(`${adresse}/api/settings`)).json()
  assert.equal(hentet.gaveafgift_bundgraense, 80000)
  assert.equal(JSON.parse(readFileSync(dbSti, 'utf8')).settings.gaveafgift_bundgraense, 80000)
})

// Og det der ikke kan læses ud af et enkelt kald: at tabellen ovenfor er udtømmende.
// Et nyt skriveendepunkt skal enten have en række her eller stå som bevidst undtaget —
// ellers kan det tilføjes uden validering uden at nogen test siger fra.
//
// Ruterne hentes fra appen SELV, ikke fra server.js' kildetekst. En regex over kilden
// ville gå glip af app.post("…") med dobbelte anførselstegn, en anden HTTP-metode
// eller en sti i en variabel — og bestå tavst, hvilket er præcis den fejl testen
// findes for.
test('hvert skriveendepunkt i appen er dækket af en række — eller bevidst undtaget', () => {
  // Express 4 lægger de registrerede ruter i `_router.stack`. Optællingen skal fejle
  // højlydt hvis den form ændrer sig (fx ved en Express-opgradering), ikke stille
  // finde nul ruter og bestå.
  const ruter = app._router?.stack?.filter(lag => lag.route) ?? []
  assert.ok(ruter.length > 0, 'kunne ikke læse appens ruter — er Express\' router-form ændret?')

  const fundne = ruter.flatMap(lag => Object.keys(lag.route.methods)
    .map(metode => noegle({ metode: metode.toUpperCase(), rute: lag.route.path })))
    .filter(endepunkt => SKRIVEMETODER.has(endepunkt.split(' ')[0]))
  const daekket = new Set([...SKRIVEENDEPUNKTER.map(noegle), ...Object.keys(UDEN_VALIDERING)])

  for (const endepunkt of fundne)
    assert.ok(daekket.has(endepunkt),
      `${endepunkt} skriver til databasen uden at være dækket her — tilføj en række i SKRIVEENDEPUNKTER, eller til UDEN_VALIDERING med en begrundelse`)
  for (const endepunkt of daekket)
    assert.ok(fundne.includes(endepunkt), `${endepunkt} findes ikke længere i appen`)
})
