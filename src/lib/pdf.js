// ── Regnskabs-PDF ─────────────────────────────────────────────────────────────
//
// Her ligger kun ægte pdf-lib-viden: WinAnsi-værn, ordombrydning, sideskift,
// kolonneplacering, billedindlejring og sammenfletning af PDF-bilag. Hvad
// regnskabet indeholder — hoved, sektioner, rækker, bilagsoversigt og note —
// kommer færdigt ind som opstillingen fra aarsopgoerelse.js (ADR-0004), så
// skærmen og PDF'en ikke kan vise hver sin ting.
//
// Den eneste tilladte forskel på de to flader er de vedhæftede bilagsfiler: en
// skærmside kan ikke bære en indscannet kvittering.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const A4 = [595.28, 841.89]
const MARGIN = 50
const INDHOLD = A4[0] - 2 * MARGIN     // tilgængelig bredde mellem margenerne
const INK = rgb(0.11, 0.14, 0.2)
const MUTED = rgb(0.42, 0.45, 0.53)
const LINE = rgb(0.8, 0.83, 0.88)

// Bilagsoversigtens kolonner er ren sidelayout: hvor langt inde kolonnen starter,
// og hvor mange tegn der er plads til. Kolonnerne selv (og deres overskrifter)
// kommer fra opstillingen. Post-kolonnen bærer kontoplanens danske labels, og de er
// længere end de gamle kategoriord — derfor starter den længere til venstre og har
// plads til hele "Grundskyld (ejendomsskat)".
const BILAG_LAYOUT = {
  nummer: { x: 0 },
  dato: { x: 34 },
  tekst: { x: 110, maks: 30 },
  post: { x: 280, maks: 26 },
  beloeb: { hoejre: true, x: INDHOLD },
}

// Afstemningens kolonner. Post-kolonnen bærer kontoplanens længste label
// ("Grundskyld (ejendomsskat)") og rækken "Bilag med ukendt post (n)"; de tre
// beløbskolonner er højrestillede og skrives med ører; statuskolonnen bærer den
// længste tekst, "Kan ikke afstemmes". Pladserne er målt med pdf-libs egen fontmetrik,
// så kolonnerne ikke kan løbe ind i hinanden.
const AFSTEMNING_LAYOUT = {
  post: { x: 0, maks: 34 },
  indtastet: { hoejre: true, x: 220 },
  bilagssum: { hoejre: true, x: 300 },
  difference: { hoejre: true, x: 385 },
  status: { x: 395 },
}

// Får opstillingen en kolonne mere, skal den også have en plads på siden. Et tavst
// fald tilbage til x = 0 ville tegne den oven i "Nr." — altså præcis den slags drift
// mellem to lister, der ikke må kunne opstå uden at nogen opdager det.
function layoutFor(navn, kort, kolonneId) {
  const l = kort[kolonneId]
  if (!l) throw new Error(`${navn}s kolonne "${kolonneId}" har ingen plads i PDF-layoutet`)
  return l
}
const bilagLayout = (id) => layoutFor('Bilagsoversigten', BILAG_LAYOUT, id)
const afstemningLayout = (id) => layoutFor('Afstemningen', AFSTEMNING_LAYOUT, id)

// pdf-lib's Helvetica koder WinAnsi. Æ, ø, å, tankestreger, krøllede citationstegn,
// midtprik og no-break space kodes KORREKT — de skal ikke erstattes, og regnskabet
// er derfor skrevet på dansk. Kun det WinAnsi reelt ikke kan (pile, flueben, emoji,
// linjeskift) skal væk, ellers kaster pdf-lib midt i genereringen.
const WINANSI_EKSTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const kanKodes = (ch) => {
  const c = ch.codePointAt(0)
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EKSTRA.includes(ch)
}
function safe(s) {
  return [...String(s ?? '')].map(ch => (kanKodes(ch) ? ch : (ch === '→' ? '->' : '?'))).join('')
}

// Generér regnskabs-PDF som Uint8Array ud fra én årsopgørelse (aarsopgoerelse.js).
// Bilagsfilerne hentes via /api/bilag/:id/fil.
export async function genererRegnskabPdf(opgoerelse) {
  const { opstilling, bilag = [] } = opgoerelse
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page = doc.addPage(A4)
  const [W, H] = A4
  let y = H - MARGIN

  const text = (s, x, yy, size = 10, f = font, color = INK) => page.drawText(safe(s), { x, y: yy, size, font: f, color })
  const right = (s, xRight, yy, size = 10, f = font, color = INK) => {
    const w = f.widthOfTextAtSize(safe(s), size)
    page.drawText(safe(s), { x: xRight - w, y: yy, size, font: f, color })
  }
  const hline = (yy) => page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: W - MARGIN, y: yy }, thickness: 0.7, color: LINE })
  const need = (space) => { if (y - space < MARGIN) { page = doc.addPage(A4); y = H - MARGIN } }
  const linje = (label, value, { f = font, gap = 16 } = {}) => {
    need(gap); text(label, MARGIN, y, 10, f); right(value, W - MARGIN, y, 10, f); y -= gap
  }
  const sektion = (t) => { need(30); y -= 8; text(t.toUpperCase(), MARGIN, y, 10, bold, MUTED); y -= 6; hline(y); y -= 12 }

  // Én tabel fra opstillingen: overskrifter, streg, rækker. Kolonnernes pladser kommer
  // fra et layoutkort, alt indhold fra opstillingen. Både afstemningen og
  // bilagsoversigten går denne ene vej, så de to ikke kan blive tegnet hver sin måde.
  // `fontFor` lader en enkelt række skille sig ud — afstemningen sætter en difference
  // med fed.
  const tabel = (kolonner, raekker, layout, fontFor = () => font) => {
    need(18)
    for (const k of kolonner) {
      const l = layout(k.id)
      if (l.hoejre) right(k.label, MARGIN + l.x, y, 9, bold, MUTED)
      else text(k.label, MARGIN + l.x, y, 9, bold, MUTED)
    }
    y -= 6; hline(y); y -= 12
    for (const r of raekker) {
      need(15)
      const f = fontFor(r)
      for (const k of kolonner) {
        const l = layout(k.id)
        const celle = r.celler[k.id] ?? ''
        if (l.hoejre) right(celle, MARGIN + l.x, y, 10, f)
        else text(l.maks ? celle.slice(0, l.maks) : celle, MARGIN + l.x, y, 10, f)
      }
      y -= 15
    }
  }

  const smaatekst = (s) => wrapText(s, INDHOLD, 8, font).forEach(l => { need(11); text(l, MARGIN, y, 8, font, MUTED); y -= 11 })

  // ── Hoved ──
  text(opstilling.hoved.overskrift, MARGIN, y, 18, bold); y -= 24
  opstilling.hoved.linjer.forEach((l, i) => {
    text(l, MARGIN, y, 10, font, MUTED)
    y -= i === opstilling.hoved.linjer.length - 1 ? 8 : 14
  })
  hline(y); y -= 4

  // ── Sektioner ──
  for (const s of opstilling.sektioner) {
    sektion(s.titel)
    for (const r of s.raekker) linje(r.label, r.vaerdi, { f: r.sum ? bold : font })
  }

  // ── Afstemning mod bilag ──
  // Kun ved grundlaget faktisk; ved budget er den fraværende i opstillingen, og så
  // står der ikke noget her heller. En difference sættes med fed, men dommen står
  // også som ord i statuskolonnen — en PDF læses lige så tit i sort/hvid.
  const afst = opstilling.afstemning
  if (afst) {
    sektion(afst.titel)
    if (afst.raekker.length === 0) linje(afst.tom_tekst, '')
    else tabel(afst.kolonner, afst.raekker, afstemningLayout, r => (r.status === 'difference' ? bold : font))
    y -= 2
    smaatekst(afst.forklaring)
  }

  // ── Bilagsoversigt ──
  const oversigt = opstilling.bilagsoversigt
  sektion(oversigt.titel)
  if (oversigt.antal === 0) linje(oversigt.tom_tekst, '')
  else tabel(oversigt.kolonner, oversigt.raekker, bilagLayout)

  // ── Note ──
  need(60); y -= 6; hline(y); y -= 12
  smaatekst(opstilling.note)

  // ── Vedhæftede bilag (billeder + PDF-sider) ──
  for (const b of bilag) {
    if (!b.filsti) continue
    let bytes
    try {
      const resp = await fetch(`/api/bilag/${b.id}/fil`)
      if (!resp.ok) continue
      bytes = new Uint8Array(await resp.arrayBuffer())
    } catch { continue }

    const mt = b.mimetype || ''
    if (mt.startsWith('image/')) {
      try {
        const img = mt.includes('png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
        const p = doc.addPage(A4)
        p.drawText(safe(`Bilag ${b.nummer}: ${b.tekst || ''}`), { x: MARGIN, y: H - MARGIN, size: 11, font: bold, color: INK })
        const maxW = W - 2 * MARGIN, maxH = H - 2 * MARGIN - 30
        const s = Math.min(maxW / img.width, maxH / img.height, 1)
        const w = img.width * s, h = img.height * s
        p.drawImage(img, { x: (W - w) / 2, y: (H - MARGIN - 24 - h), width: w, height: h })
      } catch { /* ugyldigt billede — spring over */ }
    } else if (mt === 'application/pdf') {
      try {
        const src = await PDFDocument.load(bytes)
        const pages = await doc.copyPages(src, src.getPageIndices())
        pages.forEach((pg, i) => {
          doc.addPage(pg)
          if (i === 0) pg.drawText(safe(`Bilag ${b.nummer}: ${b.tekst || ''}`), { x: 20, y: pg.getHeight() - 20, size: 9, font: bold, color: INK })
        })
      } catch {
        const p = doc.addPage(A4)
        p.drawText(safe(`Bilag ${b.nummer}: ${b.tekst || ''} (PDF kunne ikke indlejres — se separat fil ${b.filnavn})`), { x: MARGIN, y: H - MARGIN, size: 10, font, color: INK })
      }
    }
  }

  return doc.save()
}

// Simpel ordombrydning til en given bredde.
function wrapText(s, maxW, size, font) {
  const words = safe(s).split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w
    if (font.widthOfTextAtSize(test, size) > maxW) { if (cur) lines.push(cur); cur = w } else cur = test
  }
  if (cur) lines.push(cur)
  return lines
}
