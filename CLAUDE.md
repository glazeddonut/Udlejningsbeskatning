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
- **Udlejet andel (`udlejet_andel_pct`) rammer KUN ejendomsposter** — grundskyld, fællesudgifter,
  forsikring, renovation (flaget `ejendomspost` i `kontoplan.js`). Indtægter og poster der
  udelukkende vedrører det udlejede (vedligeholdelse, administration) røres aldrig. Samme andel
  indberettes til skat.dk (felt 744) og regnes fradrag på. Se ADR-0003 og `fradragsBeloeb`.

## Skat.dk-felter = højeste risikopunkt

Data-drevne og konfigurerbare pr. år i `src/lib/feltmapping.js` (+ overrides i DB via
`/api/field-mappings`, rettes i Indstillinger). **Rolle-afhængige** pr. person (beskattet
vs. ikke-beskattet). Verificeret mod skat.dk (juli 2026):
- **Forskud:** 221/435 (overskud/underskud, betinget), 481 (reducér bankrenter) + 488
  (renter i virksomhed), 748 (udlejningsdage), 744 (udlejet andel), 699 (nærtstående).
- **Selvangivelse:** 42 + 117 (renter), 111/112 (overskud/underskud), 207 (udlejningsdage),
  699, samt 300/638/301-302 (regnskabsoplysninger).
Appen er et hjælpeværktøj, ikke skatterådgivning.

### Tre faldgruber ved verifikation af feltnumre (lært på den hårde måde)

1. **Samme nummer betyder forskellige ting i forskudsopgørelse og årsopgørelse.** Et felt SKAL
   altid verificeres inden for sin egen opgørelse. Datamodellen har skelnen indbygget
   (`forskud` og `selvangivelse` er adskilte lister) — bevar den.
2. **"Rubrik" og "felt nr." er ikke det samme.** Skemaet viser rubriknummeret; UFSTs Bilag B
   beskriver de interne feltnumre. Bilag B kan derfor **ikke** bruges til at be- eller afkræfte
   et rubriknummer — de kolliderer (rubrik 207 = udlejningsdage, felt 207 = noget helt andet).
3. **Skærmbillede fra TastSelv slår dokument-slutning.** Blanketter og vejledninger er
   sekundære i forhold til, hvad der faktisk står i brugerens eget skema.

Verificeret ved direkte observation i TastSelv (aug. 2026): **felt 748** (forskud) =
"Erhvervsmæssig andel uden vurderingsfordeling, anfør antal dage"; **rubrik 207** (årsopgørelse)
= "Flerårig erhvervsmæssig udlejning, anfør antal dage". Se
`docs/research/skat-felt-71-og-beskatningsform.md` (m. rettelse).

### To dagsbegreber — bland dem ALDRIG sammen

Bekræftet af brugeren aug. 2026. Appen har med vilje to forskellige daglige optællinger:

| Formål | Funktion | Konvention | Eksempel 5. aug–31. dec |
|---|---|---|---|
| **Indberetning til skat.dk** (felt 748 / rubrik 207) | `udlejningsdage360` | **30/360** — måned = 30 dage, år = 360 | **146** |
| **Pro rata af beløb** (dansk lejeret) | `prorataMaaneder` | faktiske dage, delmåned forholdsmæssigt | 4,87 mdr. |
| Visning/kontrol + `leaseForAar`s kontraktvalg | `udlejningsdage` | faktiske kalenderdage | 149 |

Skemaet bærer selv fodnoten *"En kalendermåned udgør 30 dage og indkomståret 360 dage"*.
Et helt år indberettes derfor som **360**, ikke 365. Omvendt må pro rata af husleje **ikke**
regnes i 30/360 — den er lejeretlig og dagsproportional. Årets tal viser begge tal, så
forskellen er synlig ved indtastning.

## Datamodel (JSON DB)

`persons` (2 ægtefæller), `property` (singleton, m. ejerandele), `loans` (m. hæftelse,
`restgaeld` + `restgaeld_dato` = peildato for saldoen, og `startdato` = hvornår lånet blev
optaget), `leases` (liste af
lejekontrakter, hver m. startdato/slutdato — én aktiv pr. år via `leaseForAar`),
`years` (pr. år med `budget`=forskud og `faktisk`=selvangivelse), `bilag`
(m. filsti på disk), `settings`, `field_mappings`. (Ældre DB'er med `lease`-singleton
migreres automatisk til `leases` i `loadDb`.)

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

- **Lejekontrakterne styrer:** hvilke år der kan oprettes (tidligste start → seneste slut
  på tværs af kontrakter; åben slutdato = ingen øvre grænse), og hver års udlejningsperiode.
  `leaseForAar` vælger den kontrakt der er aktiv i året (ved delt år vinder den med flest dage);
  `periodeForAar` klipper til året (delår som 5. aug håndteres dag-præcist). Antagelse: én leje
  pr. år (ikke lejeskift midt i et skatteår).
- **Restgæld er et øjebliksbillede, ikke stamdata:** den falder for hvert afdrag. Lånet har
  derfor en eksplicit `restgaeld_dato` (peildato, default seneste årsskifte), ikke en hardkodet
  31/12. Bruges som prefill-skøn til renten (`renteskoen`), og ligger peildatoen mere end et
  halvt år uden for året, advares der — saldoen fremskrives ikke (ADR-0007).
- **Lånets `startdato` skærer renteskønnet til:** skønnet er restgæld × rente × den del af
  året lånet løb, talt i faktiske kalenderdage / årets faktiske længde (365/366) — ikke
  30/360 og ikke pro rata-måneder, se ADR-0007. Mangler startdatoen, dækker skønnet hele
  året, markeret på skærmen. Et år før startdatoen giver intet skøn.
- **Pro rata er forholdsmæssig efter dage** (dansk lejeret): delmåned tæller forholdsmæssigt
  (5.–31. aug = 27/31), ikke som hel måned.
- **Beløb tastes med dansk decimalkomma** (1250,50). Talfelter holder rå tekst under redigering.
- **Renter prefiller fra lån** (`renteskoen`) på nye år / via knap. Et beløb brugeren selv
  har tastet overskrives aldrig af et skøn.

## Arbejdsmåde brugeren værdsætter

- Verificér empirisk (isoleret node-regnetest + live i appen via preview-værktøjer), ikke kun ræsonnement.
- Ingen regression: bekræft at eksisterende data giver samme tal efter ændringer.
- Inkrementelt: store features i små, testbare trin.
- **Commit/push kun når brugeren beder om det.** Co-author-trailer bruges.
  `udlejning-data.json` og `bilag/` er git-ignored og må ALDRIG committes.

## Agent skills

### Issue tracker

Issues spores som GitHub Issues i `glazeddonut/Udlejningsbeskatning` via `gh` CLI.
Se `docs/agents/issue-tracker.md`.

### Triage labels

Standard-vokabular: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. Se `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` i repo-roden (ingen af dem findes endnu —
oprettes først når de bliver relevante). Se `docs/agents/domain.md`.
