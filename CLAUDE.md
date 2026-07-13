# CLAUDE.md — Udlejningsbeskatning

Kontekst til fremtidige sessioner. Læs denne før du arbejder på projektet.

## Hvad er det

Dansk webapp til skat og regnskab for et **forældrekøb**: en lejlighed ejet **50/50**
af to ægtefæller (Nanna = officiel udlejer, Thomas = medejer) og udlejet til deres datter.
Appen holder stamdata, genererer **skat.dk-felter pr. person** til **forskudsopgørelse**
og **selvangivelse/oplysningsskema** for begge ægtefæller, håndterer **bilag**, og
genererer et **årsregnskab som PDF (med bilag)**.

- **Frontend:** React 18 + Vite. Komponenter i `src/components/`, ren logik i `src/lib/`.
- **Backend:** Express (`server.js`) — serverer API + bygget frontend fra `dist/`.
- **Database:** én JSON-fil, `udlejning-data.json` (`DB_PATH` kan overrides). git-ignored,
  indeholder CPR m.m. — committes ALDRIG.
- **Bilag-filer:** gemmes på disk i `BILAG_DIR` (default `./bilag`, git-ignored).
- **GitHub:** https://github.com/glazeddonut/Udlejningsbeskatning (main).
- **Sproget i UI og kommentarer er dansk.** Match det.

## Sådan kører du det

- **Dev:** `npm run dev` → Vite på **5174** (hot-reload) + Express på **3002**.
  Vite proxyer `/api` til 3002. (Portene valgt for ikke at kollidere med
  FormueFremskrivning på 5173/3001.)
- **Test:** `npm test` (node --test; 34 rene regnetests i `src/lib/*.test.js`).
- **Produktion:** `npm run build` → `npm start` (Express serverer `dist/` på 3002).
- **Docker:** `cp docker-compose.yml.example docker-compose.yml` → `docker compose up -d --build`
  (data + bilag på named volume `udlejning-data`, mountet på `/data`).

## Faner (src/App.jsx)

Overblik · Stamdata · Årets tal · Skatteindberetning · Bilag · Årsregnskab · Indstillinger.

## Vigtige skatteregler (aftalt med brugeren)

- **Almindelige regler** (ikke VSO/kapitalafkast): udlejning er selvstændig erhvervsvirksomhed;
  resultat = kapitalindkomst. Rentefordelen ved VSO/kapitalafkast bortfalder ved udlejning
  kun til nærtstående.
- **Fordeling mellem ægtefæller (§25 A) — VIGTIGT:** virksomhedens resultat beskattes hos den
  ægtefælle der *driver* udlejningen (default Nanna), **100 % — IKKE efter ejerandel**, selvom
  lejligheden ejes 50/50. Renter kan frit fordeles og samles hos den beskattede. Appen har et
  fordelingsvalg (`settings.fordeling_mode`): `'alt_paa_en'` (default, §25 A stk. 1) eller
  `'del'` (50/50 efter ejerandel/hæftelse, §25 A stk. 8). Se `resolveFordeling`/`personOpgoerelse`.
- **Renter er ikke en del af udlejningsresultatet** — personlige renteudgifter, vises separat.
- **Forbedringer er ikke fradrag** (tillægges anskaffelsessum); kun vedligeholdelse er fradrag.
- **Markedsleje:** lejen skal svare til markedslejen; ellers gaveelement (Overblik advarer).

## Skat.dk-felter = højeste risikopunkt

Data-drevne og konfigurerbare pr. år i `src/lib/feltmapping.js` (+ overrides i DB via
`/api/field-mappings`, rettes i Indstillinger). **Rolle-afhængige** pr. person (beskattet
vs. ikke-beskattet). Verificeret mod skat.dk (juli 2026):
- **Forskud:** 221/435 (overskud/underskud, betinget), 481 (reducér bankrenter) + 488
  (renter i virksomhed), 748 (udlejningsdage), 744 (udlejet andel), 699 (nærtstående).
- **Selvangivelse:** 42 + 117 (renter), 111/112 (overskud/underskud), 207 (udlejningsdage),
  699, samt 300/638/301-302 (regnskabsoplysninger). 71 og beskatningsform mangler endelig bekræftelse.
Appen er et hjælpeværktøj, ikke skatterådgivning.

## Datamodel (JSON DB)

`persons` (2 ægtefæller), `property` (singleton, m. ejerandele), `loans` (m. hæftelse),
`lease` (singleton, m. startdato/slutdato), `years` (pr. år med `budget`=forskud og
`faktisk`=selvangivelse), `bilag` (m. filsti på disk), `settings`, `field_mappings`.

Hvert års-talsæt (budget/faktisk): `fra_dato`/`til_dato` (udlejningsperiode, udledt fra
lejekontrakten), `indtaegter`, `udgifter`, `prorata` (pr. felt: månedsbeløb × forholdsmæssige
måneder), `renteudgifter` (pr. lån), `udlejet_andel_pct`, `naertstaaende`.

## Kernemoduler (src/lib)

- `beregning.js` — resultat, §25 A-fordeling (`personOpgoerelse`), periode/pro rata
  (`udlejningsdage`, `prorataMaaneder`, `effektivBeloeb`), markedsleje, rente-skøn. Testet.
- `feltmapping.js` — skat.dk-feltmapping (rolle-afhængig, verificeret). Testet.
- `saet.js` — normalisering af talsæt. `format.js` — kr/decimal-formatering + parsing.
- `pdf.js` — regnskabs-PDF via **pdf-lib** (resultatopgørelse + bilagsliste + indlejrede
  billeder + fletede PDF-bilag).

## Vigtige domæne-detaljer

- **Lejekontrakten styrer:** hvilke år der kan oprettes (`[startår, slutår]`), og hver års
  udlejningsperiode (`periodeForAar` klipper til året; delår som 5. aug håndteres dag-præcist).
- **Pro rata er forholdsmæssig efter dage** (dansk lejeret): delmåned tæller forholdsmæssigt
  (5.–31. aug = 27/31), ikke som hel måned.
- **Beløb tastes med dansk decimalkomma** (1250,50). Talfelter holder rå tekst under redigering.
- **Renter prefiller fra lån** (restgæld × rente) på nye år / via knap.

## Arbejdsmåde brugeren værdsætter

- Verificér empirisk (isoleret node-regnetest + live i appen via preview-værktøjer), ikke kun ræsonnement.
- Ingen regression: bekræft at eksisterende data giver samme tal efter ændringer.
- Inkrementelt: store features i små, testbare trin.
- **Commit/push kun når brugeren beder om det.** Co-author-trailer bruges.
  `udlejning-data.json` og `bilag/` er git-ignored og må ALDRIG committes.
