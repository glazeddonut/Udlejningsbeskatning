import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { kr } from './format.js'
import {
  sumIndtaegter, sumFradragsUdgifter, resultatFoerRenter, sumRenter,
  personOpgoerelse, resolveFordeling, effektivBeloeb, udlejningsdage, antalMaaneder,
} from './beregning.js'

const A4 = [595.28, 841.89]
const MARGIN = 50
const INK = rgb(0.11, 0.14, 0.2)
const MUTED = rgb(0.42, 0.45, 0.53)
const LINE = rgb(0.8, 0.83, 0.88)

const INDTAEGT_RAEKKER = [
  ['leje', 'Husleje (ekskl. forbrug)'], ['vand', 'Vand (opkraevet)'],
  ['varme', 'Varme (opkraevet)'], ['andet', 'Anden indtaegt'],
]
const UDGIFT_RAEKKER = [
  ['grundskyld', 'Grundskyld (ejendomsskat)'], ['faellesudgifter', 'Faellesudgifter (drift)'],
  ['forsikring', 'Forsikring'], ['vedligeholdelse', 'Vedligeholdelse'],
  ['vand', 'Vand (afholdt)'], ['varme', 'Varme (afholdt)'],
  ['administration', 'Administration'], ['renovation', 'Renovation'], ['andet', 'Andet'],
]

// pdf-lib's Helvetica bruger WinAnsi — erstat tegn den ikke kan kode.
function safe(s) {
  return String(s ?? '')
    .replace(/[–—]/g, '-')      // en/em-dash → -
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/·/g, '-').replace(/→/g, '->')
    .replace(/ | /g, ' ')       // no-break spaces → almindeligt mellemrum
}

// Generér regnskabs-PDF som Uint8Array. Henter bilag-filer via /api/bilag/:id/fil.
export async function genererRegnskabPdf({ year, saet, grundlag, persons, property, loans, settings, bilag = [] }) {
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
  const row = (label, value, { f = font, gap = 16 } = {}) => {
    need(gap); text(label, MARGIN, y, 10, f); right(value, W - MARGIN, y, 10, f); y -= gap
  }
  const sektion = (t) => { need(30); y -= 8; text(t.toUpperCase(), MARGIN, y, 10, bold, MUTED); y -= 6; hline(y); y -= 12 }

  // ── Hoved ──
  text(`Regnskab for udlejning - ${year.aar}`, MARGIN, y, 18, bold); y -= 24
  const ejendom = `${property?.navn || 'Ejendom'}${property?.adresse ? ', ' + property.adresse : ''}`
  text(ejendom, MARGIN, y, 10, font, MUTED); y -= 14
  text('Ejere: ' + persons.map(p => `${p.navn} (${property?.ejerandele?.[p.id] ?? 0} %)`).join(' - '), MARGIN, y, 10, font, MUTED); y -= 14
  text(`Grundlag: ${grundlag === 'faktisk' ? 'faktiske tal' : 'budget'} - naertstaaende: ${saet.naertstaaende ? 'ja' : 'nej'} - ${antalMaaneder(saet)} mdr / ${udlejningsdage(saet)} udlejningsdage`, MARGIN, y, 10, font, MUTED); y -= 8
  hline(y); y -= 4

  // ── Indtaegter ──
  sektion('Indtaegter')
  INDTAEGT_RAEKKER.filter(([k]) => saet.indtaegter[k]).forEach(([k, l]) => row(l, kr(effektivBeloeb(saet, 'indtaegter', k))))
  row('Indtaegter i alt', kr(sumIndtaegter(saet)), { f: bold })

  // ── Udgifter ──
  sektion('Fradragsberettigede udgifter')
  UDGIFT_RAEKKER.filter(([k]) => saet.udgifter[k]).forEach(([k, l]) => row(l, kr(effektivBeloeb(saet, 'udgifter', k))))
  row('Udgifter i alt', kr(sumFradragsUdgifter(saet)), { f: bold })

  // ── Resultat ──
  sektion('Resultat')
  row('Udlejningsresultat foer renter', kr(resultatFoerRenter(saet)), { f: bold })

  // ── Fordeling ──
  const fordeling = resolveFordeling(settings, persons)
  const opg = personOpgoerelse(saet, { persons, property, loans, fordeling })
  sektion('Fordeling pr. ejer')
  opg.forEach(o => row(
    `${o.navn}${o.erBeskattet ? '' : ' (beskattes ikke)'} - resultat ${kr(o.resultatAndel)}, renter ${kr(o.renter)}`,
    kr(o.nettoKapitalindkomst)
  ))
  row('Renteudgifter i alt (personlige, kapitalindkomst)', kr(sumRenter(saet)), { f: bold })

  if (saet.forbedringer > 0) {
    sektion('Forbedringer (ikke fradrag)')
    row('Forbedringer i aaret - tillaegges anskaffelsessummen', kr(saet.forbedringer))
  }

  // ── Bilagsliste ──
  const aaretsBilag = [...bilag].sort((a, b) => a.nummer - b.nummer)
  sektion(`Bilagsoversigt (${aaretsBilag.length})`)
  if (aaretsBilag.length === 0) {
    row('Ingen bilag registreret.', '')
  } else {
    need(18)
    text('Nr.', MARGIN, y, 9, bold, MUTED); text('Dato', MARGIN + 34, y, 9, bold, MUTED)
    text('Tekst', MARGIN + 110, y, 9, bold, MUTED); text('Kategori', MARGIN + 300, y, 9, bold, MUTED)
    right('Beloeb', W - MARGIN, y, 9, bold, MUTED); y -= 6; hline(y); y -= 12
    aaretsBilag.forEach(b => {
      need(15)
      const fortegn = b.type === 'indtaegt' ? '' : '-'
      text(String(b.nummer), MARGIN, y, 10); text(b.dato || '', MARGIN + 34, y, 10)
      text((b.tekst || '').slice(0, 34), MARGIN + 110, y, 10); text((b.kategori || '').slice(0, 20), MARGIN + 300, y, 10)
      right(fortegn + kr(b.beloeb), W - MARGIN, y, 10); y -= 15
    })
  }

  // ── Note ──
  need(60); y -= 6; hline(y); y -= 12
  const note = 'Regnskabet er udarbejdet efter de almindelige skatteregler for udlejning til naertstaaende (foraeldrekoeb). Renteudgifter er personlige (kapitalindkomst) og indgaar ikke i udlejningsresultatet. Forbedringsudgifter er ikke fradragsberettigede. Beloeb er baseret paa de indtastede tal og skal verificeres mod bilag og skat.dk.'
  wrapText(note, W - 2 * MARGIN, 8, font).forEach(l => { need(11); text(l, MARGIN, y, 8, font, MUTED); y -= 11 })

  // ── Vedhaeftede bilag (billeder + PDF-sider) ──
  for (const b of aaretsBilag) {
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
        p.drawText(safe(`Bilag ${b.nummer}: ${b.tekst || ''} (PDF kunne ikke indlejres - se separat fil ${b.filnavn})`), { x: MARGIN, y: H - MARGIN, size: 10, font, color: INK })
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
