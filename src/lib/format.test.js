import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indtastetTal, daNum, kr, kr2, pct, oere } from './format.js'
import { udlejetAndel } from './beregning.js'
import { validerTalsaet, validerEjendom, validerLaan, validerLejekontrakt, validerIndstillinger } from './validering.js'

// indtastetTal er talfeltets (NumberField) oversættelse fra rå indtastning til værdi. Den
// er ren, og det er den eneste del af feltet der kan testes uden en browser: selve
// React-komponenten har projektet med vilje ingen testinfrastruktur til. Til gengæld
// bærer funktionen hele den invariant kaldestederne tidligere hver især skulle huske —
// at det der forlader feltet er et TAL, aldrig en tekst.

test('indtastetTal leverer et tal, aldrig en tekst — også for dansk decimalkomma', () => {
  for (const raa of ['0', '1250', '1250,50', '1.250,50', '-500', '  42  ', '3,5', '100']) {
    const v = indtastetTal(raa)
    assert.equal(typeof v, 'number', `“${raa}” skal give et tal`)
    assert.ok(Number.isFinite(v), `“${raa}” skal give et endeligt tal`)
  }
  assert.equal(indtastetTal('1250,50'), 1250.5)
  assert.equal(indtastetTal('1.250,50'), 1250.5)   // punktum = tusindtalsseparator
  assert.equal(indtastetTal('-500'), -500)
  assert.equal(indtastetTal('3,5'), 3.5)
})

test('et delvist indtastet tal går ikke tabt: “1250,” er 1250, ikke ingenting', () => {
  // Tastes 1250,50 ét tegn ad gangen, skal hvert mellemtrin bære et brugbart tal.
  // (Teksten selv bliver stående i feltet — det er feltets egen state, ikke indtastetTal's sag.)
  assert.equal(indtastetTal('1'), 1)
  assert.equal(indtastetTal('12'), 12)
  assert.equal(indtastetTal('125'), 125)
  assert.equal(indtastetTal('1250'), 1250)
  assert.equal(indtastetTal('1250,'), 1250)
  assert.equal(indtastetTal('1250,5'), 1250.5)
  assert.equal(indtastetTal('1250,50'), 1250.5)
})

test('et tomt felt er uoplyst (null), ikke nul', () => {
  assert.equal(indtastetTal(''), null)
  assert.equal(indtastetTal('   '), null)
  assert.equal(indtastetTal(null), null)
  assert.equal(indtastetTal(undefined), null)
  // 0 er derimod en rigtig oplysning og skal ikke kunne forveksles med et tomt felt.
  assert.equal(indtastetTal('0'), 0)
  assert.equal(indtastetTal('0,00'), 0)
})

test('tegn der ikke danner et tal er uoplyst — ikke et tavst 0', () => {
  // “-” og “,” er de to mellemtrin man taster sig igennem på vej mod -5 og 0,5.
  for (const raa of ['-', ',', '.', 'abc', 'fem tusind', 'kr.']) {
    assert.equal(indtastetTal(raa), null, `“${raa}” bærer intet tal`)
  }
})

test('den tomme udlejede andel og 0 % er to forskellige ting', () => {
  // Hele grunden til at et tomt felt giver null: udlejetAndel læser uoplyst som fuld
  // udlejning, mens 0 % nulstiller ejendomsposternes fradrag (ADR-0003). Gav et tomt
  // felt 0, ville det at rydde feltet tavst skære hvert ejendomsfradrag væk — og det
  // tal indberettes til skat.dk (felt 744).
  assert.equal(udlejetAndel({ udlejet_andel_pct: indtastetTal('') }), 100)
  assert.equal(udlejetAndel({ udlejet_andel_pct: indtastetTal('0') }), 0)
  assert.equal(udlejetAndel({ udlejet_andel_pct: indtastetTal('60') }), 60)
})

test('et uoplyst beløb regnes som 0 kr. — valget om null ændrer ingen beløb', () => {
  const tom = indtastetTal('')
  assert.equal(kr(tom), '0 kr.')
  assert.equal(kr2(tom), '0,00 kr.')
  assert.equal(pct(tom), '0 %')
  assert.equal(oere(tom), 0)
  assert.equal(Number(tom) || 0, 0)   // det greb beregningslaget bruger gennemgående
})

test('feltets værdi kan skrives tilbage i feltet og give samme tal', () => {
  for (const raa of ['1250,50', '1.250,50', '0', '-500', '3,5', '']) {
    const v = indtastetTal(raa)
    assert.equal(indtastetTal(daNum(v)), v, `“${raa}” skal overleve turen gennem daNum`)
  }
  assert.equal(daNum(indtastetTal('1250,50')), '1250,5')
  assert.equal(daNum(indtastetTal('')), '')       // uoplyst vises som et tomt felt
  assert.equal(daNum(indtastetTal('0')), '0')     // 0 vises som 0
})

test('det talfeltet leverer kan altid gemmes — serveren afviser det ikke', () => {
  // Den anden ende af #10: valideringen afviser tekst i tallenes felter. Alt hvad
  // indtastetTal kan finde på at levere — tal som uoplyst — skal slippe igennem, ellers
  // ville en indtastning kunne blokere for at gemme.
  const vaerdier = ['', '0', '1250,50', '-500', 'abc', '100'].map(indtastetTal)
  for (const v of vaerdier) {
    assert.ok(validerTalsaet({ indtaegter: { leje: v } }, 'faktisk').ok, `talsæt med ${v}`)
    assert.ok(validerTalsaet({ renteudgifter: { 1: v } }, 'faktisk').ok, `renteudgift ${v}`)
    assert.ok(validerTalsaet({ forbedringer: v }, 'faktisk').ok, `forbedringer ${v}`)
    assert.ok(validerEjendom({ anskaffelsessum: v, grundskyld_aarlig: v }).ok, `ejendom ${v}`)
    assert.ok(validerLaan({ hovedstol: v, restgaeld: v, rente_pct: v }).ok, `lån ${v}`)
    assert.ok(validerLejekontrakt({ maanedlig_leje: v, depositum: v }).ok, `lejekontrakt ${v}`)
    assert.ok(validerIndstillinger({ gaveafgift_bundgraense: v }).ok, `indstillinger ${v}`)
  }
  // Procentfelterne har en øvre grænse, så kun de lovlige andele prøves der.
  for (const v of ['', '0', '50', '100'].map(indtastetTal)) {
    assert.ok(validerTalsaet({ udlejet_andel_pct: v }, 'faktisk').ok, `udlejet andel ${v}`)
    assert.ok(validerEjendom({ ejerandele: { 1: v } }).ok, `ejerandel ${v}`)
    assert.ok(validerLaan({ haeftelse: { 1: v } }).ok, `hæftelse ${v}`)
    assert.ok(validerIndstillinger({ markedsleje_advarsel_pct: v }).ok, `markedsleje-advarsel ${v}`)
  }
})
