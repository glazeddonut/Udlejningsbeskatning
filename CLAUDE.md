# CLAUDE.md — Udlejningsbeskatning

Kontekst til fremtidige sessioner. Læs denne før du arbejder på projektet.

## Hvad er det

Dansk webapp til skat og regnskab for et **forældrekøb**: en lejlighed ejet **50/50**
af to ægtefæller og udlejet til deres datter. Appen holder stamdata (lejlighed, lån,
lejekontrakt), genererer **skat.dk-felter pr. person** til **forskudsopgørelse** og
**selvangivelse** for begge ægtefæller, og printer et **årsregnskab**.

- **Frontend:** React 18 + Vite. Komponenter i `src/components/`, ren logik i `src/lib/`.
- **Backend:** Express (`server.js`) — serverer API + bygget frontend fra `dist/`.
- **Database:** én JSON-fil, `udlejning-data.json` (`DB_PATH` kan overrides). git-ignored,
  indeholder CPR m.m. — committes ALDRIG.
- **Sproget i UI og kommentarer er dansk.** Match det.

## Sådan kører du det

- **Dev:** `npm run dev` → Vite på **5174** (hot-reload) + Express på **3002**.
  Vite proxyer `/api` til 3002. (Portene 5174/3002 er valgt for ikke at kollidere
  med FormueFremskrivning på 5173/3001.)
- **Produktion:** `npm run build` → `npm start` (Express serverer `dist/` på 3002).
- **Docker:** `docker compose up -d --build` (data på named volume `udlejning-data`).

## Vigtige konventioner (aftalt med brugeren)

- **Ejerskab 50/50.** Udlejningsresultat fordeles 50/50; renter fordeles efter hæftelse.
- **Almindelige regler** (ikke VSO/kapitalafkast): udlejningsresultat = kapitalindkomst.
  Rentefordelen ved VSO/kapitalafkast bortfalder ved udlejning kun til nærtstående.
- Hustruen står officielt som udlejer, men skat.dk-felter genereres for **begge**.
- **Renter er ikke en del af udlejningsresultatet** under almindelige regler — de er
  personlige renteudgifter (negativ kapitalindkomst) og vises separat.
- **Forbedringer er ikke fradrag** (tillægges anskaffelsessum); kun vedligeholdelse er fradrag.

## Skat.dk-felter = højeste risikopunkt

Feltnumre og satser er **data-drevne og konfigurerbare pr. år** (`src/lib/feltmapping.js`
+ overrides i DB via `/api/field-mappings`). De SKAL verificeres mod skat.dk /
Den juridiske vejledning før de bruges. Appen er et hjælpeværktøj, ikke skatterådgivning.

## Datamodel (JSON DB)

`persons` (2 ægtefæller), `property` (singleton, m. ejerandele), `loans` (m. hæftelse),
`lease` (singleton, lejekontrakt), `years` (pr. år med `budget`=forskud og `faktisk`=selvangivelse),
`settings`, `field_mappings` (overrides).

## Arbejdsmåde brugeren værdsætter

- Verificér empirisk (isoleret node-regnetest + live i appen), ikke kun ved ræsonnement.
- Ingen regression: bekræft at eksisterende data giver samme tal efter ændringer.
- Inkrementelt: store features i små, testbare trin.
- **Commit/push kun når brugeren beder om det.** Co-author-trailer bruges.
  `udlejning-data.json` er git-ignored og må ALDRIG committes.
