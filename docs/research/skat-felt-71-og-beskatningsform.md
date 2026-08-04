# Rubrik 71 og "Vælg beskatningsform" på oplysningsskemaet

**Research-output — dateret 2. august 2026.**
Kildebaseret undersøgelse af de to poster i `src/lib/feltmapping.js` der stadig er markeret
`usikker: true`. Dette er research, ikke skatterådgivning — appen er et hjælpeværktøj, og
endelig kontrol skal ske i TastSelv/hos Skattestyrelsen.

Kontekst: forældrekøb, ejerlejlighed ejet 50/50 af to ægtefæller, udlejet til datteren,
beskatning efter **almindelige regler** (hverken virksomhedsordningen eller
kapitalafkastordningen).

---

## Resumé og statustabel

Kort version: **begge poster i feltmappingen er forkerte som de står nu.**

- Rubrik **71 findes**, men den betyder *"Er du ophørt med selvstændig virksomhed?"* — ikke
  "Vælg virksomhedens aktivitet". Der findes intet felt på oplysningsskemaet hvor man vælger
  virksomhedens aktivitet, og "Aktiv erhvervsmæssig virksomhed" er ikke en valgmulighed nogen
  steder. Posten bør slettes.
- Beskatningsformen vælges i **rubrik 141** (kapitalafkastordningen) og **rubrik 147**
  (virksomhedsordningen) — begge er ja-afkrydsninger der skriver til **felt nr. 184**
  ("Virksomhedskode"). Almindelige regler = **lad begge stå tomme** (felt 184 = blank). Der er
  altså ingen positiv valgmulighed der hedder "Beskatning efter de almindelige regler".

| # | Delspørgsmål | Status |
|---|---|---|
| 1a | Findes rubrik 71 på oplysningsskemaet? | **BEKRÆFTET** — den findes |
| 1a | Er labelen "Vælg virksomhedens aktivitet" korrekt? | **MODSAGT** — rubrik 71 = "Er du ophørt med selvstændig virksomhed? Ophørsår" |
| 1b | Er "Aktiv erhvervsmæssig virksomhed" en gyldig valgmulighed i feltet? | **MODSAGT** — rubrik 71 er et ja-hak, ikke en liste; udtrykket findes ikke i nogen SKAT-kilde |
| 1c | Er det den rigtige valgmulighed for udlejning til nærtstående? | **MODSAGT / bortfalder** — spørgsmålet er ikke relevant, da feltet ikke findes |
| 1d | Hvilke valgmuligheder findes i feltet? | **BEKRÆFTET** — rubrik 71 har kun "Hvis ja, markér her" + ophørsår |
| 2a | Korrekt rubrik-/feltnummer for valg af beskatningsform? | **BEKRÆFTET** — rubrik **141** og **147**, begge → felt nr. **184** |
| 2b | Er "Beskatning efter de almindelige regler" den korrekte betegnelse? | **MODSAGT** — der findes ingen sådan valgmulighed; almindelige regler = ingen markering. SKATs egen terminologi er "personskattelovens regler" |
| 2c | Hvilke valgmuligheder findes i feltet? | **BEKRÆFTET** — 6 kodeværdier i felt 184 (blank, 1–5), se nedenfor |
| — | Findes der en literal dropdown ved navn "Vælg beskatningsform" i TastSelvs online-oplysningsskema? | **STADIG UAFKLARET** — kræver login til TastSelv |

---

## Om numre: "rubrik" og "felt nr." er to forskellige ting

Det er vigtigt for feltmappingen. Skattestyrelsens oplysningsskema har **to talkolonner** ved
siden af hver linje: **Rubrik** (det nummer borgeren ser) og **Felt nr.** (det interne
indberetningsfelt). De er sjældent ens. Fra
[blanket 04.003 for indkomståret 2025](https://skat.dk/media/ftiduwhm/04003_januar2026-t.pdf)
(version 2026.01, side 3–4):

| Rubrik | Tekst på skemaet | Felt nr. |
|---|---|---|
| 42 | Renteudgifter af gæld til pengeinstitutter, pensionskasser … | 481 |
| 71 | Er du ophørt med selvstændig virksomhed? Ophørsår | 131 / 134 |
| 111 | Overskud af selvstændig virksomhed … (før AM-bidrag og renter) | 221 |
| 112 | Underskud af selvstændig virksomhed … | 435 |
| 117 | Renteudgifter i virksomhed | 488 |
| 141 | Ønskes beskatning efter reglerne i kapitalafkastordningen? | 184 |
| 147 | Ønskes beskatning efter reglerne i virksomhedsordningen? | 184 |
| 300 | Virksomhedens cvr-nr./se-nr. | 602 |
| 301 | Er virksomheden fritaget for at give regnskabsoplysninger? | 603 |
| 302 | Begrundelse for fritagelse | 604 |
| 638 | Skyldig/tilgodehavende moms ved regnskabsårets udløb | 638 |

Det bekræfter i øvrigt at appens øvrige selvangivelses-numre (42, 111, 112, 117, 300, 301/302,
638) er **rubriknumre**, og at forskudsopgørelsens 221/435/481/488 er de tilsvarende
**feltnumre** for de samme størrelser. Det hænger sammen.

Officiel definition af feltnumrene ligger i Udviklings- og Forenklingsstyrelsens
[SLUT-vejledning Bilag B — beskrivelse af indberetningsfelterne](https://ufst.dk/media/obgo0qh0/slut-vejledning-2021-bilag-b-beskrivelse-af-indberetningsfelterne-til-eksternt-brug-endelig-version.pdf)
(ekstern udgave, indkomståret 2021), som er den mest detaljerede primærkilde der findes
offentligt. Se
[UFSTs oversigtsside](https://ufst.dk/it-i-skatteforvaltningen/data-og-integrationsportalen/viden-og-vejledninger/oversigt-med-feltbeskrivelser-af-felter-i-arsopgoerelsen)
for alle årgange.

---

## Spørgsmål 1 — Rubrik 71 "Vælg virksomhedens aktivitet"

### 1a. Rubrik 71 findes — men betyder noget helt andet

På [blanket 04.003 for indkomståret 2025](https://skat.dk/media/ftiduwhm/04003_januar2026-t.pdf)
står rubrik 71 under overskriften **"Virksomheds ophør"**, med teksten
*"Er du ophørt med selvstændig virksomhed? Ophørsår"* og afkrydsningen *"Hvis ja, markér her"*.
Felt nr. 131 og 134.

Det er **ikke** en nyhed for 2025. Samme rubriknummer og samme tekst findes i:

- [04.003 for indkomståret 2024](https://skat.dk/media/jh2lvekp/04003_september2025-t.pdf) (rubrik 71)
- [04.003 for indkomståret 2023](https://skat.dk/media/1cjjbnfc/04003_januar_2024-t.pdf) (rubrik 71, felt 134)
- [04.003 for indkomståret 2020](https://skat.dk/media/2r0leey3/04003_januar_2021-t.pdf) (rubrik 71, felt 134)

Rubriknummeret er altså stabilt over mindst indkomstårene 2020–2025, og der er ingen tegn på
ændring til 2026.

Blanketten selv er "til dig, der er fritaget for pligten til at give oplysninger digitalt", men
den er den autoritative papirudgave af præcis det skema TastSelv viser — rubriknumrene er
fælles. Alle årgange ligger på
[skat.dk's blanketside for 04.003](https://skat.dk/hjaelp/blanketter/04-skat-oplysningsskema-og-forskud-personer/04003-oplysningsskemaet).

**Afgørende bekræftelse af at det også gælder i TastSelv:** UFSTs SLUT-vejledning Bilag B
skriver i beskrivelsen af felt 134 (Ligningsart), under kodeværdien "Blank", at hvis man i
TastSelv **rubrik 71** sætter hak for at være ophørt med virksomhed, sættes felt 134 til blank
(se afsnittet *"Felt 134: Ligningsart"* i
[SLUT-vejledning Bilag B](https://ufst.dk/media/obgo0qh0/slut-vejledning-2021-bilag-b-beskrivelse-af-indberetningsfelterne-til-eksternt-brug-endelig-version.pdf)).
Rubrik 71 i TastSelv er altså ophørs-markeringen — ikke en aktivitetsvælger.

> **Konsekvens for brugeren:** hvis appen får dig til at "udfylde rubrik 71", risikerer du at
> afmelde virksomheden i SKATs systemer. Det er ikke en kosmetisk fejl.

### 1b–1d. "Aktiv erhvervsmæssig virksomhed" findes ikke som valgmulighed

- Rubrik 71 har ingen liste af valgmuligheder — den har ét ja-hak plus et ophørsår.
- Jeg har gennemgået **hele** blanket 04.003 for 2025 (alle 4 sider) samt
  [ekstrasiderne med regnskabsoplysninger](https://skat.dk/media/asqadagb/04003_januar2026-ekstrasider-t.pdf).
  Der er **ingen** rubrik der hedder noget i retning af "virksomhedens aktivitet", "virksomhedens
  art" eller "virksomhedstype". De eneste "art"-lignende felter er rubrik 304 (revisorbistandens
  art) og rubrik 302 (begrundelse for fritagelse for regnskabsoplysninger).
- Websøgning på den præcise streng "Vælg virksomhedens aktivitet" giver **ingen** SKAT-kilde
  overhovedet — kun Danmarks Statistiks aktivitetsindberetning og generelle erhvervsartikler.
  Formuleringen stammer ikke fra skat.dk.

**Hvor "aktiviteten" så bliver afgjort:** klassifikationen erhvervsmæssig/ikke-erhvervsmæssig er
noget du selv afgør, og den viser sig ved **hvilken rubrik du bruger** — ikke ved et
dropdown-valg:

- Erhvervsmæssig virksomhed → resultatet i **rubrik 111/112**.
- Ikke-erhvervsmæssig (hobby) virksomhed → overskuddet som anden personlig indkomst
  (rubrik 20), jf. [DJV C.C.1.1.2](https://info.skat.dk/data.aspx?oid=2048528).

Skat.dk's egen vejledning
["Sådan oplyser du virksomhedens resultat"](https://skat.dk/erhverv/egen-virksomhed/skat-af-egen-virksomhed/saadan-oplyser-du-virksomhedens-resultat-oplysningsskema)
beskriver netop at man skal afgøre virksomhedens *skattemæssige kategori* (erhvervsmæssig,
ikke-erhvervsmæssig/hobby, honorarmodtager) — men det er en vurdering, ikke et felt.
Trinvejledningen
["Del 2: Oplys resultatet"](https://skat.dk/erhverv/guides-og-webinarer-til-start-ups/start-up-med-skat/for-virksomheder/arets-regnskab-og-skat/del-2-oplys-resultatet)
går direkte fra "log på TastSelv" til "skriv resultatet i rubrik 111/112" og nævner hverken
aktivitetsvalg eller rubrik 71.

**Det tætteste på en "aktivitetskode"** er felt **134 "Ligningsart"**, som Skattestyrelsen
**selv sætter maskinelt** — borgeren udfylder den ikke. Ifølge SLUT-vejledning Bilag B angiver
ligningsarten hvilken type virksomhed skatteyderen er involveret i, med værdierne:

| Værdi | Betydning (SLUT-vejledning Bilag B, felt 134) |
|---|---|
| Blank | Almindelig lønmodtager |
| 1 | Større virksomheder (omsætning over 500.000 kr.) |
| 2 | Mindre virksomheder (omsætning under 500.000 kr.) |
| 3 | Anden virksomhed — forpagtnings- og **udlejningsvirksomhed vedrørende fast ejendom** uden for anpartsreglerne |
| 4 | Nystartede virksomheder |
| 5 | Hovedaktionærer |
| 6 | Kommanditister |
| 7 | Særlige ikke-erhvervsdrivende |

Et forældrekøb hører hjemme under værdi 3 — men det er altså et internt SKAT-felt, ikke noget
du vælger på skemaet.

### 1c. Er udlejningen erhvervsmæssig? (spørgsmålet bag valgmuligheden)

Selve den skattemæssige antagelse i appen holder. Den juridiske vejledning
[C.C.1.1.1 "Begrebet selvstændig erhvervsvirksomhed"](https://info.skat.dk/data.aspx?oid=2048527)
(DJV **2026-2**, version 3.17, gældende fra 31.07.2026) fastslår at indkomst fra udlejning af
fast ejendom som hovedregel anses for selvstændig erhvervsvirksomhed — med forbehold for at
udlejning af helt underordnet omfang kan falde udenfor. En fuldt udlejet ejerlejlighed er klart
inden for hovedreglen.

Det ændrer bare ikke ved, at der ikke er noget felt hvor man erklærer det.

---

## Spørgsmål 2 — "Vælg beskatningsform"

### 2a. Nummeret: rubrik 141 og 147 → felt nr. 184

Der er ikke ét felt der hedder "Vælg beskatningsform". Valget træffes ved **to
ja-afkrydsninger** på
[blanket 04.003 for indkomståret 2025](https://skat.dk/media/ftiduwhm/04003_januar2026-t.pdf),
side 3:

| Rubrik | Tekst på skemaet | Felt nr. |
|---|---|---|
| **141** | Ønskes beskatning efter reglerne i kapitalafkastordningen? — "Hvis ja, markér her" | **184** |
| **147** | Ønskes beskatning efter reglerne i virksomhedsordningen? — "Hvis ja, markér her" | **184** |

Begge rubrikker skriver til **samme indberetningsfelt, felt nr. 184**. Vælger man
kapitalafkastordningen udfyldes desuden rubrik 142–144; vælger man virksomhedsordningen udfyldes
rubrik 147–152.

Samme rubriknumre findes på skemaerne for indkomstårene
[2024](https://skat.dk/media/jh2lvekp/04003_september2025-t.pdf),
[2023](https://skat.dk/media/1cjjbnfc/04003_januar_2024-t.pdf) og
[2020](https://skat.dk/media/2r0leey3/04003_januar_2021-t.pdf) — numrene er stabile.

At valget netop træffes **i oplysningsskemaet** bekræftes af Den juridiske vejledning
[C.C.5.2.3.1 "Valg af virksomhedsordningen mv."](https://info.skat.dk/data.aspx?oid=1948869)
(DJV 2026-2, version 3.17): den selvstændigt erhvervsdrivende skal i oplysningsskemaet
tilkendegive om virksomhedsordningen ønskes anvendt for indkomståret, og valget står mellem
virksomhedsordningen, kapitalafkastordningen og personskattelovens regler. DJV nævner dog ikke
selv rubriknumrene — dem har jeg fra selve blanketten.

### 2b–2c. Valgmulighederne — og hvorfor "almindelige regler" ikke er et aktivt valg

Det underliggende felt 184 hedder officielt **"Virksomhedskode"**. Fra
[SLUT-vejledning Bilag B, afsnittet "Felt 184: Virksomhedskode"](https://ufst.dk/media/obgo0qh0/slut-vejledning-2021-bilag-b-beskrivelse-af-indberetningsfelterne-til-eksternt-brug-endelig-version.pdf):

| Værdi | Betydning |
|---|---|
| **Blank** | **Ikke i virksomhedsordning eller kapitalafkastordning, ikke vekselerer** |
| 1 | Virksomhedsordning, ikke vekselerer |
| 2 | Virksomhedsordning, vekselerer |
| 3 | Ikke i virksomhedsordning eller kapitalafkastordning, vekselerer |
| 4 | Kapitalafkastordning, ikke vekselerer |
| 5 | Kapitalafkastordning, vekselerer |

For dette forældrekøb er den rigtige tilstand **felt 184 = blank**, dvs. **ingen markering i
hverken rubrik 141 eller 147**. Samme vejledning bruger andetsteds netop formuleringen at
virksomheden er "uden for virksomheds- og kapitalafkastordningen (dvs. felt 184 = blank)" — det
er systemets egen måde at udtrykke "almindelige regler".

Derfor:

- Der er **ingen** valgmulighed der hedder "Beskatning efter de almindelige regler". Man
  fravælger ved ikke at sætte hak.
- SKATs egen terminologi for den tredje mulighed er **"personskattelovens regler"**
  (se [DJV C.C.5.2.3.1](https://info.skat.dk/data.aspx?oid=1948869)), ikke "de almindelige
  regler". "Almindelige regler" er korrekt dagligsprog, men det er ikke en skemabetegnelse.

### Det uafklarede: TastSelvs faktiske UI

**STADIG UAFKLARET:** om TastSelvs *online* oplysningsskema præsenterer rubrik 141/147 som to
separate ja/nej-afkrydsninger (som på papirblanketten) eller som én samlet dropdown med en label
i stil med "Vælg beskatningsform".

- Hvad jeg ledte efter: den præcise streng "Vælg beskatningsform" i en skat.dk-kilde;
  skærmbilleder eller trinvejledninger til det online-oplysningsskema for selvstændige.
- Hvor jeg ledte: skat.dk's blanket- og vejledningssider, info.skat.dk (Den juridiske
  vejledning), ufst.dk's tekniske feltvejledninger, samt websøgning på dansk på de præcise
  formuleringer. `eksternwiki.skat.dk` (SKATs egne TastSelv-demoskærme) svarede ikke på
  forespørgsler under denne research.
- Hvad der skal til for at afklare det: **login til TastSelv Borger** → "Ret
  årsopgørelsen/oplysningsskemaet" → afsnittet med virksomhedsoplysninger, og aflæse hvordan
  rubrik 141/147 er præsenteret. Det kan kun brugeren selv gøre.

Bemærk at dette kun er et spørgsmål om *etiketten i UI'et*. **Substansen er afklaret:** valget
sker via rubrik 141/147 → felt 184, og almindelige regler betyder ingen markering.

---

## Anbefalede ændringer i feltmapping.js

Begge poster er forkerte som de står. Konkrete forslag (brugeren beslutter selv):

### 1. Rubrik 71 — bør fjernes

```js
// NUVÆRENDE (feltmapping.js:45) — forkert
{ felt_nr: '71', label: 'Vælg virksomhedens aktivitet', kilde: 'virksomhedsaktivitet', enhed: '', rolle: 'begge', usikker: true },
```

Anbefaling: **slet posten**, og slet `case 'virksomhedsaktivitet'` i `evalKilde`
(`feltmapping.js:97`).

Begrundelse: rubrik 71 er "Er du ophørt med selvstændig virksomhed?". At udfylde den ville være
aktivt forkert — den afmelder virksomheden. Der findes ikke noget andet felt til
"virksomhedens aktivitet"; klassifikationen som erhvervsmæssig virksomhed kommer i stedet til
udtryk ved at resultatet står i rubrik 111/112, hvilket appen allerede gør.

Hvis der ønskes noget på pladsen, kunne det være en ren **informationslinje uden feltnummer**
(fx "Udlejningen behandles som erhvervsmæssig virksomhed — resultatet oplyses derfor i rubrik
111/112, ikke i rubrik 20"), altså ikke et felt der skal indtastes.

### 2. Beskatningsform — feltnummer rettes, værdien omformuleres

```js
// NUVÆRENDE (feltmapping.js:49) — feltnummer ukendt, værdi misvisende
{ felt_nr: '—', label: 'Vælg beskatningsform', kilde: 'beskatningsform', enhed: '', rolle: 'begge', usikker: true },
```

Anbefaling: erstat med to poster (eller én med begge numre), og sæt `usikker: false`:

```js
{ felt_nr: '141', label: 'Ønskes beskatning efter reglerne i kapitalafkastordningen?',
  kilde: 'beskatningsform', enhed: '', rolle: 'begge',
  note: 'Sæt IKKE hak — der beskattes efter personskattelovens almindelige regler (felt 184 = blank)',
  usikker: false },
{ felt_nr: '147', label: 'Ønskes beskatning efter reglerne i virksomhedsordningen?',
  kilde: 'beskatningsform', enhed: '', rolle: 'begge',
  note: 'Sæt IKKE hak — VSO giver ingen rentefordel ved udlejning til nærtstående',
  usikker: false },
```

og i `evalKilde` (`feltmapping.js:98`):

```js
case 'beskatningsform': return 'Nej (lad feltet stå tomt)'
```

Begrundelse: `usikker` kan sættes til `false` — rubriknumrene 141/147 og felt 184 er verificeret
direkte på den officielle blanket og i UFSTs feltvejledning. Værdien "Beskatning efter de
almindelige regler" bør væk, fordi den foregøgler et aktivt valg der ikke findes; brugeren skal
i stedet vide at **han ikke skal markere noget**.

### 3. Kosmetisk: brug SKATs egne rubriktekster

Appens labels for de allerede verificerede felter kan med fordel matche skemaets ordlyd, fx
rubrik 111 = "Overskud af selvstændig virksomhed før beløb overført til medarbejdende ægtefælle
(før AM-bidrag og renter)" og rubrik 112 = "Underskud af selvstændig virksomhed (før renter og
før overførsel fra konto for opsparet overskud)". Det gør det lettere at genkende linjen i
TastSelv. Ingen taleffekt.

---

## ~~Sideobservationer~~ — TILBAGEVIST 2. august 2026

> **⛔ RETTELSE. Begge sideobservationer nedenfor var FORKERTE.** Brugeren fremlagde
> skærmbilleder fra det faktiske TastSelv-skema, som er direkte observation og slår denne
> dokument-baserede slutning. **Både 748 og 207 er korrekte i appen** og er sat tilbage til
> `usikker: false`.
>
> **Hvad skemaet faktisk viser:**
> - **Felt 748** (forskudsopgørelsen, under "Udlejning og erhvervsmæssig anvendelse") =
>   *"Erhvervsmæssig andel uden vurderingsfordeling, Anfør antal dage"*. Feltet findes,
>   står lige under 744, og er præcis udlejningsdage.
> - **Rubrik 207** (årsopgørelsen, under "Erhvervsmæssig udlejning") =
>   *"Flerårig erhvervsmæssig udlejning. Anfør antal dage"*.
>
> **Hvorfor slutningen gik galt:** researchen forvekslede **rubriknummer** med **feltnummer**
> — netop den skelnen den selv beskriver ovenfor. UFSTs Bilag B lister *feltnumre*; felt 207
> dér er ganske rigtigt noget andet, men **rubrik** 207 på oplysningsskemaet er
> udlejningsdage-feltet. Brugerens skærmbillede skriver bogstaveligt "Rubrik 207".
> Lære heraf: Bilag B kan ikke bruges til at be- eller afkræfte et *rubriknummer*.
>
> **Utilsigtet, men vigtigt fund i samme skærmbillede — SIDEN BEKRÆFTET:** skemaet har fodnoten
> *"En kalendermåned udgør 30 dage og indkomståret 360 dage"*. SKAT regner disse dagsfelter i
> **30/360**, ikke i faktiske kalenderdage. Brugeren har bekræftet konventionen (aug. 2026).
>
> Appen er rettet: `udlejningsdage360()` i `beregning.js` bruges nu til felt 748 og rubrik 207
> (5. aug–31. dec = **146**, helt år = **360**). Den kalenderbaserede `udlejningsdage()` er
> beholdt til visning og til `leaseForAar`s kontraktvalg, og pro rata af beløb kører uændret
> gennem `prorataMaaneder` — den er lejeretlig og dagsproportional. Se tabellen "To dagsbegreber"
> i `CLAUDE.md`.

Til gengæld er **felt 699 "Udlejning til nærtstående"** bekræftet i SLUT-vejledning Bilag B, med
værdierne Ja = 1, Nej = 2, blank = ej udfyldt — appens 699 er altså rigtigt. Samme afsnit
beskriver i øvrigt netop rentekorrektionen ved forældrekøb (jf. rubrik 128 "Rentekorrektion, ved
udlejning af fast ejendom til nærtstående" på blanketten), hvilket bekræfter projektets
antagelse om at VSO ikke giver nogen rentefordel her.

---

## Indkomstår og holdbarhed

- Blanket 04.003 findes pr. indkomstår. Den nyeste er for **indkomståret 2025** (version
  2026.01) — skemaet for indkomståret 2026 er endnu ikke udgivet pr. 2. august 2026.
- Rubrik 71, 141 og 147 er uændrede over indkomstårene 2020, 2023, 2024 og 2025 (kontrolleret
  direkte i de fire blanketter). Risikoen for at de ændrer sig til 2026 vurderes som lav, men
  appens feltmapping for 2026 bør genkontrolleres når 2026-blanketten udkommer (typisk
  januar 2027). (Rettet: stod tidligere som indstillingen `feltmapping_aar: 2026`, der er
  fjernet — feltmappingen slås op på det år brugeren står i.)
- Den juridiske vejledning er tjekket i version **2026-2** (gældende fra 31.07.2026).
- SLUT-vejledning Bilag B er kun offentliggjort i fuld udgave for **indkomståret 2021**; for
  2022–2025 udgives kun delta-dokumenter over nye/ændrede/udgåede felter. Felt 184 optræder ikke
  i nogen af delta-dokumenterne og er derfor uændret.

---

## Kilder

### Primære (Skatteforvaltningen)

**Blanketter — oplysningsskemaet 04.003**
- [Blanketside 04.003 — Oplysningsskemaet (alle årgange)](https://skat.dk/hjaelp/blanketter/04-skat-oplysningsskema-og-forskud-personer/04003-oplysningsskemaet)
- [04.003, indkomståret 2025 (version 2026.01)](https://skat.dk/media/ftiduwhm/04003_januar2026-t.pdf) — hovedkilde til rubrik 71, 141, 147
- [04.003, ekstrasider med regnskabsoplysninger, 2025](https://skat.dk/media/asqadagb/04003_januar2026-ekstrasider-t.pdf)
- [04.003, indkomståret 2024](https://skat.dk/media/jh2lvekp/04003_september2025-t.pdf)
- [04.003, indkomståret 2023](https://skat.dk/media/1cjjbnfc/04003_januar_2024-t.pdf)
- [04.003, indkomståret 2020](https://skat.dk/media/2r0leey3/04003_januar_2021-t.pdf)

**Tekniske feltvejledninger (UFST)**
- [SLUT-vejledning Bilag B — beskrivelse af indberetningsfelterne, indkomståret 2021](https://ufst.dk/media/obgo0qh0/slut-vejledning-2021-bilag-b-beskrivelse-af-indberetningsfelterne-til-eksternt-brug-endelig-version.pdf) — felt 184 (Virksomhedskode), felt 134 (Ligningsart), felt 699, 744, 746, 747, 207
- [Bilag B — nye, udgåede og ændrede indberetningsfelter 2025](https://ufst.dk/media/2gend5hd/slutvejledningen-bilag-b-indberetningsfelter-2025-nye-udgaaede-og-aendrede-ekstern-version.pdf)
- [UFST: Oversigt med beskrivelse af felter på årsopgørelsen (Bilag B)](https://ufst.dk/it-i-skatteforvaltningen/data-og-integrationsportalen/viden-og-vejledninger/oversigt-med-feltbeskrivelser-af-felter-i-arsopgoerelsen)

**Den juridiske vejledning (info.skat.dk, version 2026-2)**
- [C.C.5.2.3.1 Valg af virksomhedsordningen mv.](https://info.skat.dk/data.aspx?oid=1948869)
- [C.C.1.1.1 Begrebet selvstændig erhvervsvirksomhed](https://info.skat.dk/data.aspx?oid=2048527)
- [C.C.1.1.2 Beskatning af selvstændig erhvervsvirksomhed og ikke erhvervsmæssig virksomhed](https://info.skat.dk/data.aspx?oid=2048528)
- [C.C.5.2.2.5 Udlejningsejendomme](https://info.skat.dk/data.aspx?oid=1948850)

**Vejledningssider på skat.dk**
- [Sådan oplyser du virksomhedens resultat (oplysningsskema)](https://skat.dk/erhverv/egen-virksomhed/skat-af-egen-virksomhed/saadan-oplyser-du-virksomhedens-resultat-oplysningsskema)
- [Start up med skat, del 2: Oplys resultatet](https://skat.dk/erhverv/guides-og-webinarer-til-start-ups/start-up-med-skat/for-virksomheder/arets-regnskab-og-skat/del-2-oplys-resultatet)
- [Betal skat af din virksomhed (forskudsopgørelsen, felt 221/435)](https://skat.dk/borger/unge-og-studerende/selvstaendig/betal-skat-af-din-virksomhed)

### Sekundære (kun brugt som pejlemærke — ikke som bevis)

Disse er rådgiver-/leverandørkilder. De peger samstemmende på rubrik 147 for
virksomhedsordningen, hvilket harmonerer med blanketten, men de er ikke selvstændigt bevis.

- [Reportability: Virksomhedsordning ved udlejning af bolig](https://www.reportability.dk/blog/virksomhedsordning-ved-udlejning) — nævner rubrik 147 som stedet hvor ordningen tilvælges
- [Reportability: Selvangivelse for enkeltmandsvirksomheder](https://www.reportability.dk/blog/selvangivelse-for-enkeltmandsvirksomheder)
- [Dinero: Hvilke rubrikker skal udfyldes ved udvidet selvangivelse?](https://dinero.dk/tips/rubrikker-udvidet-selvangivelse/)
- [Revisorgruppen: Tips & tricks til indberetning af oplysningsskemaet 2018 (PDF)](https://www.ri.dk/wp-content/uploads/2019/04/tips-og-tricks-2018.pdf)
- [tax.dk — privat spejling af Den juridiske vejledning](https://tax.dk/jv/cc/C_C_5_2_3_1.htm) (brug info.skat.dk som kilde i stedet)

---

*Appen er et hjælpeværktøj til at holde styr på tal og bilag — ikke skatterådgivning. Kontrollér
altid felterne mod det aktuelle skema i TastSelv før indberetning.*
