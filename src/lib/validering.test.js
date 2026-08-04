import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validerTalsaet, hjemloeseNoegler, validerAar, validerEjendom, validerLaan, validerLejekontrakt, validerBilag, validerIndstillinger, validerFeltmappinger } from './validering.js'
import { tomtSaet } from './beregning.js'

// ── Beløb der ikke er tal ─────────────────────────────────────────────────────
//
// Et beløb der ikke kan læses som et tal blev tavst til 0 kr. Rækken stod der, og
// totalen stemte — men beløbet var væk (issue #3).

test('et beløb der ikke er et tal afvises frem for tavst at blive 0', () => {
  const saet = tomtSaet()
  saet.udgifter.vedligeholdelse = 'fem tusind'
  const svar = validerTalsaet(saet, 'budget')
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /Vedligeholdelse/)
  assert.match(svar.begrundelse, /fem tusind/)
})

test('et tomt talsæt er gyldigt', () => {
  assert.deepEqual(validerTalsaet(tomtSaet(), 'budget'), { ok: true, begrundelse: '' })
})

// ── Hjemløse poster ───────────────────────────────────────────────────────────
//
// En hjemløs post er en værdi gemt under en nøgle kontoplanen ikke kender. Den skal
// fortsat kunne LÆSES og gemmes igen (ADR-0001) — men en ny af slagsen må ikke
// kunne opstå. Reglen er derfor "afvis nye ukendte poster", ikke "afvis talsæt der
// indeholder ukendte poster".

test('en ny post kontoplanen ikke kender afvises', () => {
  const saet = tomtSaet()
  saet.udgifter.ejerforening = 1200
  const svar = validerTalsaet(saet, 'budget')
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /ejerforening/)
  assert.match(svar.begrundelse, /kontoplanen/i)
})

test('en hjemløs post der allerede står i de gemte data kan gemmes igen', () => {
  const saet = tomtSaet()
  saet.udgifter.ejerforening = 1200
  assert.deepEqual(validerTalsaet(saet, 'budget', new Set(['udgifter.ejerforening'])), { ok: true, begrundelse: '' })
})

test('en hjemløs post er kendt i sin egen gruppe, ikke i den anden', () => {
  const saet = tomtSaet()
  saet.indtaegter.ejerforening = 1200
  assert.equal(validerTalsaet(saet, 'budget', new Set(['udgifter.ejerforening'])).ok, false)
})

test('beløbet på en hjemløs post skal stadig være et tal', () => {
  const saet = tomtSaet()
  saet.udgifter.ejerforening = 'tolvhundrede'
  const svar = validerTalsaet(saet, 'budget', new Set(['udgifter.ejerforening']))
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /ikke et tal/)
})

// ── Udlejningsperioden og de øvrige tal i talsættet ───────────────────────────

test('en dato der ikke er en dato afvises', () => {
  const saet = tomtSaet()
  saet.fra_dato = '5. august 2025'
  const svar = validerTalsaet(saet, 'faktisk')
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /fra-dato/)
  assert.match(svar.begrundelse, /5\. august 2025/)
  assert.match(svar.begrundelse, /Faktisk/)
})

test('en dato der ikke findes i kalenderen afvises', () => {
  const saet = tomtSaet()
  saet.til_dato = '2025-02-30'
  assert.equal(validerTalsaet(saet, 'budget').ok, false)
  saet.til_dato = '2025-13-01'
  assert.equal(validerTalsaet(saet, 'budget').ok, false)
  saet.til_dato = '2025-12-31'
  assert.equal(validerTalsaet(saet, 'budget').ok, true)
})

test('en manglende udlejningsperiode er ikke en fejl — den udfyldes, den afvises ikke', () => {
  const saet = tomtSaet()
  saet.fra_dato = ''
  saet.til_dato = ''
  assert.equal(validerTalsaet(saet, 'budget').ok, true)
})

test('en renteudgift der ikke er et tal afvises, med lånet nævnt', () => {
  const saet = tomtSaet()
  saet.renteudgifter = { 1: 45000, 2: 'ukendt' }
  const svar = validerTalsaet(saet, 'budget')
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /rente/i)
  assert.match(svar.begrundelse, /2/)
})

test('forbedringer der ikke er et tal afvises', () => {
  const saet = tomtSaet()
  saet.forbedringer = 'nyt køkken'
  assert.equal(validerTalsaet(saet, 'budget').ok, false)
})

// Den udlejede andel er en procent af ejendommen. 150 % blev tidligere gemt og
// indberettet, mens beregningen klemte den til 100 (issue #12). Den afvises nu ved
// skrivningen — klemningen i beregningen bliver stående som værn for data der aldrig
// er gået gennem et skriveendepunkt.
test('en udlejet andel uden for 0–100 % afvises', () => {
  const saet = tomtSaet()
  saet.udlejet_andel_pct = 150
  const svar = validerTalsaet(saet, 'budget')
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /udlejede andel/i)
  saet.udlejet_andel_pct = -1
  assert.equal(validerTalsaet(saet, 'budget').ok, false)
})

test('0 % og en uoplyst udlejet andel er begge gyldige', () => {
  const saet = tomtSaet()
  saet.udlejet_andel_pct = 0
  assert.equal(validerTalsaet(saet, 'budget').ok, true)
  saet.udlejet_andel_pct = ''
  assert.equal(validerTalsaet(saet, 'budget').ok, true)
  saet.udlejet_andel_pct = 100
  assert.equal(validerTalsaet(saet, 'budget').ok, true)
})

test('hjemloeseNoegler finder de nøgler kontoplanen ikke kender i et gemt talsæt', () => {
  const gemt = { indtaegter: { leje: 6000, fremleje: 500 }, udgifter: { vand: 300, ejerforening: 1200 } }
  assert.deepEqual([...hjemloeseNoegler(gemt)].sort(), ['indtaegter.fremleje', 'udgifter.ejerforening'])
  assert.deepEqual([...hjemloeseNoegler(tomtSaet())], [])
  assert.deepEqual([...hjemloeseNoegler(null)], [])
})

// ── Året (POST og PUT /api/years) ─────────────────────────────────────────────

test('et år med gyldige tal accepteres uændret', () => {
  const body = { aar: 2026, budget: tomtSaet(), faktisk: tomtSaet() }
  assert.deepEqual(validerAar(body), { ok: true, begrundelse: '' })
})

test('et årstal der ikke er et årstal afvises', () => {
  assert.equal(validerAar({ aar: 'næste år' }).ok, false)
  assert.equal(validerAar({ aar: 20266 }).ok, false)
  assert.equal(validerAar({ aar: 2026.5 }).ok, false)
  assert.equal(validerAar({ aar: '2026' }).ok, true)     // årstal må gerne komme som tekst
  assert.equal(validerAar({}).ok, true)                  // PUT der kun retter talsættene
})

test('fejlen peger på det grundlag den står i', () => {
  const faktisk = tomtSaet()
  faktisk.udgifter.vand = 'x'
  const svar = validerAar({ aar: 2026, budget: tomtSaet(), faktisk })
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /Faktisk/)
})

test('et gemt års hjemløse post kan gemmes igen — også i det andet grundlag', () => {
  // Kopiér fra budget flytter budgettets tal over i de faktiske. Bærer budgettet en
  // hjemløs post, må den følge med — ellers kunne året ikke gemmes bagefter.
  const gemt = {
    aar: 2025,
    budget: { ...tomtSaet(), udgifter: { ...tomtSaet().udgifter, ejerforening: 1200 } },
    faktisk: tomtSaet(),
  }
  const kopieret = JSON.parse(JSON.stringify(gemt.budget))
  assert.equal(validerAar({ aar: 2025, budget: gemt.budget, faktisk: kopieret }, gemt).ok, true)
})

test('en ny ukendt post afvises, også når året i forvejen bærer en anden hjemløs post', () => {
  const gemt = {
    aar: 2025,
    budget: { ...tomtSaet(), udgifter: { ...tomtSaet().udgifter, ejerforening: 1200 } },
    faktisk: tomtSaet(),
  }
  const budget = JSON.parse(JSON.stringify(gemt.budget))
  budget.udgifter.antenneforening = 400
  const svar = validerAar({ aar: 2025, budget, faktisk: tomtSaet() }, gemt)
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /antenneforening/)
})

test('et nyt år kan ikke fødes med en hjemløs post', () => {
  const budget = tomtSaet()
  budget.udgifter.ejerforening = 1200
  assert.equal(validerAar({ aar: 2027, budget }).ok, false)
})

// ── Ejendommen (PUT /api/property) ────────────────────────────────────────────

test('ejendommens tal og købsdato accepteres når de er tal og datoer', () => {
  const ejendom = {
    navn: 'Bøgevej 12, 2. th', type: 'ejerlejlighed', koebsdato: '2025-08-01',
    anskaffelsessum: 2601850, forbedringer_foer_udlejning: 0, grundskyld_aarlig: 3000,
    ejerandele: { 1: 50, 2: 50 },
  }
  assert.deepEqual(validerEjendom(ejendom), { ok: true, begrundelse: '' })
  assert.equal(validerEjendom(null).ok, true)   // ejendommen må ryddes
})

test('ejendommens beløb, købsdato og ejerandele afvises når de ikke har domænets form', () => {
  const ok = { koebsdato: '2025-08-01', anskaffelsessum: 2601850, ejerandele: { 1: 50, 2: 50 } }
  assert.match(validerEjendom({ ...ok, anskaffelsessum: 'to millioner' }).begrundelse, /anskaffelsessum/i)
  assert.match(validerEjendom({ ...ok, grundskyld_aarlig: {} }).begrundelse, /grundskyld/i)
  assert.match(validerEjendom({ ...ok, koebsdato: '01-08-2025' }).begrundelse, /købsdato/i)
  assert.match(validerEjendom({ ...ok, ejerandele: { 1: 150, 2: 50 } }).begrundelse, /ejerandel/i)
})

// ── Lånet (POST og PUT /api/loans) ────────────────────────────────────────────

test('et lån med tal, peildato og hæftelse accepteres', () => {
  const laan = {
    type: 'bank', laangiver: 'Eksempelbanken', hovedstol: 1500000, restgaeld: 1500000,
    restgaeld_dato: '2026-12-31', rente_pct: 3, haeftelse: { 1: 50, 2: 50 },
  }
  assert.deepEqual(validerLaan(laan), { ok: true, begrundelse: '' })
  assert.equal(validerLaan({ type: 'bank', restgaeld_dato: '' }).ok, true)   // peildato må mangle
})

test('lånets beløb, rente, datoer og hæftelse afvises når de ikke har domænets form', () => {
  assert.match(validerLaan({ restgaeld: 'halvanden million' }).begrundelse, /restgæld/i)
  assert.match(validerLaan({ hovedstol: true }).begrundelse, /hovedstol/i)
  assert.match(validerLaan({ rente_pct: 'tre' }).begrundelse, /rente/i)
  assert.match(validerLaan({ restgaeld_dato: '31/12-2026' }).begrundelse, /peildato/i)
  assert.match(validerLaan({ haeftelse: { 1: 120 } }).begrundelse, /hæftelse/i)
  // Startdatoen styrer renteskønnet i optagelsesåret; en dato der ikke er en dato ville
  // tavst blive læst som ingen startdato og give et helt års rente.
  assert.match(validerLaan({ startdato: '9/8-2025' }).begrundelse, /startdato/i)
  assert.equal(validerLaan({ startdato: '' }).ok, true)     // startdatoen må mangle
  assert.equal(validerLaan({ startdato: '2025-08-09' }).ok, true)
})

// ── Lejekontrakten (POST og PUT /api/leases) ──────────────────────────────────

test('en lejekontrakt med datoer og beløb accepteres — også med åben slutdato', () => {
  const lease = {
    lejer_navn: 'Lejer', startdato: '2026-01-01', slutdato: '',
    maanedlig_leje: 6000, forbrug_aconto: { vand: 300, varme: 300 },
    depositum: 0, forudbetalt_leje: 0, markedsleje_maanedlig_skoen: 4500,
  }
  assert.deepEqual(validerLejekontrakt(lease), { ok: true, begrundelse: '' })
})

test('lejekontraktens datoer og beløb afvises når de ikke har domænets form', () => {
  assert.match(validerLejekontrakt({ startdato: '2026-02-30' }).begrundelse, /startdato/i)
  assert.match(validerLejekontrakt({ slutdato: 'åben' }).begrundelse, /slutdato/i)
  assert.match(validerLejekontrakt({ maanedlig_leje: 'seks tusind' }).begrundelse, /leje/i)
  assert.match(validerLejekontrakt({ forbrug_aconto: { vand: 'x' } }).begrundelse, /aconto vand/i)
  assert.match(validerLejekontrakt({ depositum: [] }).begrundelse, /depositum/i)
})

// ── Bilaget (POST og PUT /api/bilag) ──────────────────────────────────────────

test('et bilag med dato, beløb og en post i kontoplanen accepteres', () => {
  const bilag = {
    aar: 2025, dato: '2025-08-14', tekst: 'Udskiftning af linoleumsgulv',
    beloeb: 5211, post_id: 'udgifter.vedligeholdelse', type: 'udgift',
  }
  assert.deepEqual(validerBilag(bilag), { ok: true, begrundelse: '' })
  assert.equal(validerBilag({ aar: 2025, dato: '', beloeb: 0, post_id: null }).ok, true)
  assert.equal(validerBilag({ beloeb: 100 }).ok, true)   // PUT der kun retter beløbet
})

test('bilagets beløb, dato og år afvises når de ikke har domænets form', () => {
  assert.match(validerBilag({ beloeb: 'femtusind' }).begrundelse, /beløb/i)
  assert.match(validerBilag({ dato: '14/8-2025' }).begrundelse, /dato/i)
  assert.match(validerBilag({ aar: 'sidste år' }).begrundelse, /årstal/i)
})

test('et nyt bilag kan ikke bogføres på en post kontoplanen ikke kender', () => {
  const svar = validerBilag({ aar: 2025, beloeb: 100, post_id: 'udgifter.ejerforening' })
  assert.equal(svar.ok, false)
  assert.match(svar.begrundelse, /kontoplanen/i)
})

test('et gemt bilag med en ukendt post kan gemmes igen', () => {
  // Den bevarede kategori må ikke gå tabt, fordi den ikke kunne oversættes (ADR-0005).
  const gemt = { id: 7, aar: 2025, post_id: 'udgifter.ejerforening', kategori: 'Ejerforening' }
  assert.equal(validerBilag({ beloeb: 100, post_id: 'udgifter.ejerforening' }, gemt).ok, true)
})

// ── Indstillinger (PUT /api/settings) ─────────────────────────────────────────

test('indstillingernes tal accepteres og afvises på samme regel', () => {
  const s = { gaveafgift_bundgraense: 76900, markedsleje_advarsel_pct: 5, beskattet_person_id: null }
  assert.deepEqual(validerIndstillinger(s), { ok: true, begrundelse: '' })
  assert.match(validerIndstillinger({ ...s, gaveafgift_bundgraense: 'ingen' }).begrundelse, /bundgrænse/i)
  assert.match(validerIndstillinger({ ...s, markedsleje_advarsel_pct: 150 }).begrundelse, /markedsleje/i)
})

// ── De data der allerede ligger på disken ─────────────────────────────────────
//
// Et talsæt i den form appen faktisk har gemt gennem årene — med de gamle
// måneds-felter fra før udlejningsperioden blev datobaseret, og med et beløb med ører.
// Værnet må ikke kunne spærre for at gemme det der allerede står der.

test('et talsæt i den form der ligger gemt i dag kan skrives igen', () => {
  const gemt = {
    fra_dato: '2025-08-06', til_dato: '2025-12-31',
    indtaegter: { leje: 4500, vand: 300, varme: 300, andet: 0 },
    udgifter: {
      grundskyld: 3120, faellesudgifter: 13250, forsikring: 0, vedligeholdelse: 5211.75,
      vand: 1500, varme: 1500, administration: 0, renovation: 0, andet: 2695,
    },
    prorata: { 'indtaegter.leje': true, 'indtaegter.vand': true, 'indtaegter.varme': true },
    forbedringer: 0,
    renteudgifter: { 1: 17849 },
    udlejet_andel_pct: 100,
    naertstaaende: true,
    fra_maaned: 1, til_maaned: 12,     // gamle felter fra før datoerne
  }
  assert.deepEqual(validerTalsaet(gemt, 'faktisk'), { ok: true, begrundelse: '' })
  assert.equal(validerAar({ aar: 2025, budget: gemt, faktisk: gemt }).ok, true)
})

// ── En krop der slet ikke har domænets form ───────────────────────────────────
//
// Et endepunkt skriver hvad det får. Er kroppen en streng eller en liste, gemmes
// noget der ligner et objekt uden at være et — fx en lejekontrakt som {0:'h',1:'e'}.

test('en krop der ikke er et objekt afvises', () => {
  assert.equal(validerLejekontrakt('hej').ok, false)
  assert.equal(validerEjendom([1, 2, 3]).ok, false)
  assert.equal(validerLaan(42).ok, false)
  assert.equal(validerBilag('bilag').ok, false)
  assert.equal(validerIndstillinger([]).ok, false)
  assert.equal(validerAar(42).ok, false)
  assert.match(validerTalsaet('hej', 'budget').begrundelse, /talsæt/i)
})

// ── Feltmappingen (PUT /api/field-mappings) ───────────────────────────────────
//
// Overrides slås op på nøglen "<år>-<doktype>". Er året i nøglen ikke et årstal,
// findes overriden aldrig igen — den er gemt, men usynlig. Selve feltnumrene er
// bevidst fri tekst: det er brugeren der verificerer dem mod skat.dk.

test('feltmappingens nøgler skal bære et årstal, og hver nøgle en liste af rækker', () => {
  const gyldig = { '2026-forskud': [{ felt_nr: '221', label: 'Overskud', kilde: 'resultat' }] }
  assert.deepEqual(validerFeltmappinger(gyldig), { ok: true, begrundelse: '' })
  assert.equal(validerFeltmappinger({}).ok, true)
  assert.equal(validerFeltmappinger(null).ok, true)
  assert.match(validerFeltmappinger({ 'i år-forskud': [] }).begrundelse, /årstal/i)
  assert.match(validerFeltmappinger({ '2026-forskud': 'ikke en liste' }).begrundelse, /liste/i)
  assert.equal(validerFeltmappinger('hej').ok, false)
})
