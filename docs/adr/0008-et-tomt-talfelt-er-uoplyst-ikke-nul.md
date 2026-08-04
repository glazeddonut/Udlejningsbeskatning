# Et tomt talfelt er uoplyst, ikke nul

Talfeltet leverer nu et tal ud i stedet for rå dansk tekst, så intet kaldested skal huske
at parse. Det efterlod ét spørgsmål, som ingen kaldesteder tidligere havde taget stilling
til: hvad et **tomt** felt leverer. Den gamle `parseNum('')` svarede 0, fordi alle
kaldesteder handlede om beløb — og et beløb på 0 kr. og intet beløb er samme tal.

Vi lader et tomt felt levere **`null` (uoplyst)**, ikke 0.

Grunden er, at antagelsen ikke holder for alle felter. Den **udlejede andel** er et tal
der indberettes til skat.dk (felt 744) og som siden ADR-0003 også skærer fradraget på
ejendomsposterne ned. `udlejetAndel` læser en uoplyst andel som **100 %** — fuld udlejning
er den rigtige antagelse, når ingen har sagt andet — mens **0 %** er en rigtig andel, der
nulstiller hvert ejendomsfradrag. Leverede et tomt felt 0, ville det at rydde feltet være
et tavst valg af 0 %, og både fradraget og det indberettede tal ville ændre sig, uden at
nogen havde taget stilling.

Samme regel gælder tegn der ikke danner et tal ("-", ",", "fem tusind"): de bærer ingen
oplysning og leverer derfor også `null` frem for et opfundet 0. De to første er i øvrigt
netop de mellemtrin man taster sig igennem på vej mod -5 og 0,5.

## Consequences

For beløb ændrer valget ingen tal: beregningslaget læser gennemgående `Number(v) || 0`,
så et uoplyst beløb fortsat er 0 kr. i enhver sum, og `kr`/`kr2`/`pct` skriver 0.
Det samme gælder ejerandele og hæftelse, som fordelingen læser med `|| 0`. Valideringen
(`validering.js`) behandler i forvejen `null` som uoplyst og afviser det ikke, så et ryddet
felt kan altid gemmes. De gemte data er bagudkompatible: eksisterende 0'er bliver liggende
og betyder stadig 0. Ingen af de tal der indberettes til skat.dk skifter værdi — den
udlejede andel er det eneste af dem der overhovedet kan være uoplyst, og dens svar (100 %)
er netop den beslutning der træffes her.

Ét sted skifter en tærskel dog betydning, og det er tilsigtet: markedsleje-advarslen læses
som `settings?.markedsleje_advarsel_pct ?? 5`. Ryddes den indstilling, gemtes før 0 — altså
"advar ved den mindste afvigelse" — hvor den nu er uoplyst og falder tilbage til appens
egen standard på 5 %. Det er præcis hvad `??` blev skrevet for at betyde. Tærsklen styrer
kun en advarsel på Overblik og indgår i intet regnskab og ingen indberetning.

Prisen er, at `null` nu kan stå i JSON-filen, hvor der før stod 0. Fladerne skal derfor
selv vælge, om et 0 skal vises som "0" eller som et tomt felt — `?? ''` hvor de to er
forskellige oplysninger (den udlejede andel), `|| ''` hvor de er samme tal (beløbene i
Årets tal, hvor talsættet fødes med 0 på hver post).
