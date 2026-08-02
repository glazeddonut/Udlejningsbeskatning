# Arkitektur-review — 2. august 2026

Output fra `/improve-codebase-architecture`. **Alle tal er verificeret empirisk mod den
faktiske `udlejning-data.json`** med isolerede node-kald — ikke ræsonnement.

Formålet med denne fil er at være **durabelt input til `/grill-with-docs`**. Den oprindelige
HTML-rapport lå i en session-specifik scratchpad under `/private/tmp` og overlever ikke.

**Vokabular:** module, interface, implementation, depth, deep, shallow, seam, adapter,
leverage, locality (fra `/codebase-design`). Undgå "component", "service", "boundary".

## Status

| Kandidat | Status |
|---|---|
| **A** — årets periode fryses ved oprettelse | ✅ **BYGGET** i commit `472f691` (`aarsgrundlag` + `periodeAfvigelse`). Skal ikke grilles igen. |
| **E** — bilagsnummerering | 📋 Oprettet som [issue #1](https://github.com/glazeddonut/Udlejningsbeskatning/issues/1), `ready-for-agent` |
| B, C, D, F, G | ⬜ Ikke behandlet |

---

## B. Kontoplanen findes fem steder — `Strong`

**Filer:** `beregning.js:17-21` · `AaretsTal.jsx:53-69` · `Aarsregnskab.jsx:11-27` ·
`pdf.js:14-23` · `Bilag.jsx:6-19`

Samme domæneviden — "hvilke indtægts- og udgiftsarter findes, hvad hedder de" — er skrevet ud
fem gange: som nøgler i `tomtSaet()`, som nøgle+label i formularen, som nøgle+label i
HTML-regnskabet, som **ASCII**-label i PDF'en, og som frie strenge i bilagenes `KATEGORIER`
(uden nogen kobling til udgiftsnøglerne).

**Verificeret fejl:**

```
sumFradragsUdgifter({grundskyld: 7488})                  → 7.488
sumFradragsUdgifter({grundskyld: 7488, ukendt: 99999})   → 107.487
```

`effektivGruppe` (`beregning.js:117-121`) itererer `Object.keys()`, mens begge rapporter
renderer en hvidliste. Resultatet er **et årsregnskab hvor rækkerne ikke summer til totalen**.
Ikke hypotetisk: legacy-nøgler overlever i talsæt via `normaliserSaet`s `...saved`-spread
(`years[2025].budget` bærer stadig `fra_maaned`/`til_maaned`).

**Deletion test:** slet `INDTAEGT_RAEKKER`/`UDGIFT_RAEKKER` i `pdf.js` → kompleksiteten dukker
ikke op hos N kaldere, den findes allerede tre andre steder. Ren gennemstrømning.

**Deepening:** ét `kontoplan`-module (nøgle, dansk label, ASCII-label, gruppe, hint, typisk
månedspost, tilsvarende bilagskategori). Summering itererer kontoplanen — ikke objektnøglerne —
og rapporterer ukendte poster eksplicit i stedet for at smugle dem ind i totalen.

---

## C. Årsregnskabet er implementeret to gange — `Strong`

**Filer:** `Aarsregnskab.jsx:95-174` (`Regnskab`) vs. `pdf.js:35-154` (`genererRegnskabPdf`)

Begge kalder selv `sumIndtaegter`, `sumFradragsUdgifter`, `resultatFoerRenter`, `sumRenter`,
`personOpgoerelse`, `resolveFordeling`, `effektivBeloeb`, `udlejningsdage` — og har hver sin
hoved-, sektions-, fordelings- og noteopstilling. Noteteksten står ordret to gange.

**De er allerede divergeret:** HTML-versionen har **ingen bilagsoversigt overhovedet**, mens
PDF'en har (`pdf.js:93-110`). Knappen hedder alligevel "🖨 Print" ved siden af "⬇ Download PDF
(med bilag)" — to dokumenter der udgiver sig for at være ét.

`Aarsregnskab` normaliserer talsættet og sender det videre; `pdf.js` importerer aldrig
`normaliserSaet` selv. Den invariant er ren konvention på tværs af et seam.

**Deepening:** `regnskabsopstilling(...)` i `src/lib/` der returnerer ren data (sektioner med
rækker, hoved-metadata, bilagsoversigt, note). `Aarsregnskab.jsx` bliver en tabelrenderer;
`pdf.js` beholder kun ægte pdf-lib-viden (`safe`, `wrapText`, `need`, sideskift, billeder,
`copyPages`). I dag: **0 % testdækning på regnskabsdokumentet**.

---

## D. "Hvilke år må oprettes" er skrevet to gange — `Strong`

**Filer:** `AaretsTal.jsx:15-23` (`tilladteAar`) og `server.js:193-203`

Samme regel i præsentationslag og transportlag, ordret duplikeret — også fejlteksterne
("Lejekontrakterne starter i …", med og uden punktum). Ingen af de to kopier er testet.

`beregning.js` er ren ESM og `package.json` har `"type": "module"` — `server.js` **kan**
importere den direkte.

**Deletion test:** slet klientens `tilladteAar` → serveren afviser stadig, men den øjeblikkelige
validering og hint-teksten forsvinder. Den tjener sit brød som UX, ikke som selvstændig viden.

**Deepening:** `aarsinterval(leases) → { minAar, maxAar, aabenSlut }` og
`maaAarOprettes(leases, aar) → { ok, fejl }` i `beregning.js`. Begge kaldesteder bruger samme.

**Uafklaret kanttilfælde:** et "hul-år" mellem to kontrakter accepteres i dag tavst af begge
implementationer. Ingen har taget stilling til om det er rigtigt.

---

## F. Felter uden konsument — `Worth exploring`

**Filer:** `LaanManager.jsx:96` · `beregning.js:143-145` · `feltmapping.js:33` ·
`Indstillinger.jsx:49`

**Verificeret — alle er inerte:**

```
estimeretAarligRente(lån)                             → 45.000
samme lån, peildato ændret til 1999-01-01             → 45.000   (uændret)
resultatFoerRenter(2025) med udlejet_andel_pct = 100  → −2.598
samme med udlejet_andel_pct = 60                      → −2.598   (uændret)
```

- **`restgaeld_dato`** blev tilføjet netop for at fjerne den hardkodede 31/12-antagelse, men
  `estimeretAarligRente(loan)` læser den ikke. I DB'en står `restgaeld_dato: "2026-12-31"`,
  hvilket gav 45.000 kr. rente som prefill for **2025** — et år hvor udlejningen først startede
  5. august.
- **`udlejet_andel_pct`** indberettes til **skat.dk felt 744** ("Erhvervsmæssig andel"), men
  indgår ikke i nogen beregning. Sæt den til 60 og du indberetter 60 % til SKAT, mens fradraget
  er beregnet på 100 %.
- **`feltmapping_aar`** i `settings` bruges kun til at fylde årslisten i Indstillingernes egen
  editor; `SkatteIndberetning.jsx:30` kalder `hentFeltmapping(valgtAar, …)` og ignorerer den.

**Deletion test:** slet alle tre → *ingen* adfærd ændrer sig.

**⚠️ Kræver brugerens beslutning før en agent kan handle:**
1. Skal `udlejet_andel_pct` gange ind i `resultatFoerRenter`/`effektivGruppe`, eller er den ren
   indberetningsværdi? (skattefagligt spørgsmål)
2. Hvad skal `restgaeld_dato` konkret gøre — fremskrive saldoen, eller blot advare når
   peildatoen ikke passer til skatteåret?

---

## G. `normaliserSaet`-konvention og 360-dages-fallbacket — `Worth exploring` / `Strong`

**Filer:** `saet.js` · `beregning.js:67-84` · `server.js:204` · fire kaldere

Alle funktioner i `beregning.js` forudsætter et normaliseret talsæt, men hver kalder skal huske
`normaliserSaet`. **`pdf.js` husker det ikke** — den arver et normaliseret sæt fra
`Aarsregnskab`. En invariant på tværs af et seam, som intet håndhæver.

**Verificeret:**

```
udlejningsdage({})                       → 360
udlejningsdage(normaliserSaet({}))       → 360
```

`POST /api/years` accepterer `budget: budget ?? {}`, så et år oprettet uden prefill indberetter
360 dage — uden markering af at det er et gæt. `beregning.test.js:138` cementerer adfærden.

**Vigtig nuance opdaget efter reviewet:** 360 er præcis SKATs egen værdi for et **helt**
udlejningsår (30/360-konventionen — se `CLAUDE.md`). Fallbacket producerer derfor ikke et
åbenlyst forkert tal, men et der **ser fuldstændig legitimt ud**, netop når perioden mangler.
Det gør fejlen sværere at opdage, ikke lettere.

**Beslægtet — shallow interface:** `NumberField` (`fields.jsx:21-43`) udleverer rå dansk tekst
og kræver at **otte** kaldere husker `parseNum`. Én glemt `parseNum` gemmer en streng i
JSON-DB'en. `BeloebFelt` (`AaretsTal.jsx:223-252`) duplikerer hele komponenten for at tilføje
ét pro rata-afkryds.

---

## Tværgående observation

Testene i `src/lib/*.test.js` er gode og dækker regnereglerne præcist. Men de tester **rene
funktioner mod håndlavede objekter**, og de fejl der faktisk kunne påvises i den rigtige DB —
148 vs. 149 udlejningsdage, bilag nummereret 2/3 i stedet for 1/2 — lå alle i *hvordan
funktionerne kaldes og hvornår deres resultat fryses*.

Fælles for A, D og E: et lille module der tager `db`-formede data ind og giver domæneformede
data ud (`aarsgrundlag`, `aarsinterval`, `bilagForAar`) flytter netop den fejlklasse ind under
`node --test` uden React- eller HTTP-testinfrastruktur. A er bygget efter dette mønster.
