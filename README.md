# Udlejningsbeskatning

Dansk webapp der hjælper med skat og regnskab for et **forældrekøb** — en lejlighed
ejet 50/50 af to ægtefæller og udlejet til deres datter.

Appen:
- vedligeholder alle stamdata om lejlighed, lån, lejekontrakt og udlejning (persistent, år efter år),
- genererer de præcise **skat.dk-felter pr. person** til både **forskudsopgørelse** og
  **selvangivelse/oplysningsskema** for begge ægtefæller,
- printer et **årsregnskab** for udlejningen.

> ⚠️ **Ikke skatterådgivning.** Appen er et hjælpeværktøj. Konkrete skat.dk-feltnumre,
> satser og beløbsgrænser er konfigurerbare og skal verificeres mod skat.dk /
> Den juridiske vejledning for det relevante år, før de bruges.

## Teknologi

- **Frontend:** React 18 + Vite (`src/`)
- **Backend:** Express (`server.js`) — serverer API + bygget frontend fra `dist/`
- **Database:** én JSON-fil, `udlejning-data.json` (path kan overrides med `DB_PATH`).
  Filen er git-ignored og indeholder personlige data (CPR m.m.) — committes aldrig.

## Kør lokalt

```bash
npm install
npm run dev      # Vite på 5174 (hot-reload) + Express på 3002
```

Åbn http://localhost:5174 — Vite proxyer `/api`-kald til Express på 3002.

Produktion:

```bash
npm run build    # bygger frontend til dist/
npm start        # Express serverer dist/ på 3002
```

## Docker

```bash
cp docker-compose.yml.example docker-compose.yml   # tilpas efter behov (git-ignoreret)
docker compose up -d --build                        # data på named volume "udlejning-data"
```

Appen svarer på port **3002** (valgt for ikke at kollidere med FormueFremskrivning på 3001).
