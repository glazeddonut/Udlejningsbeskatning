# Skrivningen afviser kun NYE ukendte poster

Serverens skriveendepunkter afviser nu data der ikke har domænets form — beløb der ikke er
tal, datoer der ikke er datoer, poster kontoplanen ikke kender. Reglen om poster er
formuleret som **"afvis en ny ukendt post"**, ikke som "afvis et talsæt der indeholder en
ukendt post". En hjemløs post der allerede står gemt på året slipper igennem; det gør en
nøgle ingen har gemt før ikke. Samme skel gælder bilagets post: en gammel kategori der
ikke kunne oversættes kan gemmes igen, en ny kan ikke vælges.

Tolerancen er **årets**, ikke det enkelte grundlags: "Kopiér fra budget" flytter
budgettets tal over i de faktiske, og en hjemløs post i budgettet ville ellers være ny i
`faktisk` og spærre for at året kunne gemmes.

## Considered Options

Den simple regel — afvis ethvert talsæt med en post uden for kontoplanen — ville gøre
præcis det ADR-0001 forbyder: én legacy-nøgle i JSON-filen, og året kunne ikke længere
gemmes. Rækken ville stadig kunne læses, men brugeren ville være låst ude af at rette
noget som helst andet i året. En validering der afviser noget brugeren med rette vil gemme,
er værre end den tavse accept den erstatter.

## Consequences

Reglerne selv er rene funktioner i `src/lib/validering.js` og kan testes med `node --test`
uden HTTP-server; `server.js` udfører dem. Værnet gælder derfor enhver klient — også
veje ind i databasen som brugerfladen ikke kontrollerer.

Validering rammer kun det der **skrives gennem et endepunkt**. En håndredigeret JSON-fil
går uden om den, og beregningslagets egne værn — fx klemningen af den udlejede andel til
0–100 % i `udlejetAndel` — bliver derfor stående som sidste linje. De to lag siger det
samme: skrivningen nægter at skabe en andel over 100 %, beregningen nægter at regne med
en, der alligevel er der.
