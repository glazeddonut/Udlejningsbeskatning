# Udlejningsbeskatning

Skat og regnskab for ét forældrekøb: en lejlighed ejet 50/50 af to ægtefæller og
udlejet til deres datter. Dette er ordbogen — hvad ordene betyder, ikke hvordan de
er implementeret. Domænesproget er dansk og skal forblive dansk.

## Sprog

### Ejendom og aftaler

**Forældrekøb**:
En bolig købt af forældre og udlejet til eget barn. Udlejning til nærtstående, hvilket
udelukker VSO og kapitalafkastordningen som reel fordel.

**Lejekontrakt**:
Aftalen om udlejning i en sammenhængende periode, med startdato og eventuel slutdato.
Der kan være flere over tid, men kun én er aktiv i et givet skatteår.
_Undgå_: lejemål, lease

**Nærtstående**:
Lejeren er i familie med udlejer. Afgør beskatningsformen og indberettes særskilt.

**Markedsleje**:
Den leje lejligheden ville koste på det frie marked. Ligger den aftalte leje under den,
kan forskellen udgøre et gaveelement.

**Peildato**:
Den dato en saldo er målt på — typisk lånets restgæld pr. bankens seneste opgørelse.
En saldo uden peildato er ikke stamdata, den er et øjebliksbillede der forældes.
_Undgå_: opgørelsesdato, skæringsdato

### Skatteåret

**Talsæt**:
De indtastede tal for ét år i ét grundlag. Rummer udlejningsperiode, indtægter,
udgifter, renteudgifter, forbedringer og indberetningsværdier.
_Undgå_: datasæt, årsdata

**Grundlag**:
Hvilket af årets to talsæt der er tale om: **budget** (til forskudsopgørelsen, fremadrettet)
eller **faktisk** (til selvangivelsen, bagudrettet).

**Udlejningsperiode**:
Fra- og til-dato for udlejningen inden for ét skatteår. Udledes af lejekontrakten, men
kan overstyres bevidst — fx når den faktiske indflytning afviger fra kontraktens start.

**Årsgrundlag**:
Hvad lejekontrakterne siger om et år — periode, leje, aconto forbrug — beregnet ved
hvert opslag. Modstykket til talsættet, som er et gemt øjebliksbillede.

**Periodeafvigelse**:
Forskellen mellem talsættets gemte udlejningsperiode og årsgrundlagets. Rapporteres,
rettes aldrig automatisk, og kan kvitteres med en begrundelse.

**Hul-år**:
Et kalenderår som ingen lejekontrakt dækker. Ikke det samme som et delår.

### Dagsbegreberne

Tre forskellige optællinger, som aldrig må blandes sammen.

**Udlejningsdage**:
Faktiske kalenderdage i udlejningsperioden, inklusive start og slut. Til visning og
til at afgøre hvilken lejekontrakt der dominerer et delt år.

**Indberetningsdage**:
Udlejningsdage efter SKATs 30/360-konvention — en kalendermåned er 30 dage, et
indkomstår 360. Det tal der indberettes til felt 748 og rubrik 207, og kun det.
_Undgå_: skattedage

**Pro rata-måneder**:
Forholdsmæssige måneder efter faktiske dage, hvor en delmåned tæller forholdsmæssigt
(5.–31. august = 27/31). Lejeretlig og dagsproportional. Bruges til at gange
månedsbeløb op til årsbeløb — aldrig i 30/360.

### Regnskabet

**Kontoplan**:
Den samlede liste over hvilke indtægts- og udgiftsposter der findes, hvad de hedder,
hvilken gruppe de hører til, og om de vedrører hele ejendommen eller kun det udlejede.
Én kilde til sandhed for indtastning, regnskab, PDF og bilag.
_Undgå_: kategorier, felter, rækker

**Post**:
En enkelt linje i kontoplanen — fx grundskyld eller husleje.
_Undgå_: konto, kategori, række

**Hjemløs post**:
En værdi gemt i et talsæt under en nøgle der ikke findes i kontoplanen. Tælles altid
med i totalen og vises som sin egen synlige række, så rækkerne summer til totalen.
_Undgå_: ukendt felt, legacy-nøgle

**Ejendomspost**:
En post der vedrører hele ejendommen (grundskyld, fællesudgifter, forsikring,
renovation) og derfor kun er fradragsberettiget med den udlejede andel. Modsætningen
er en post der udelukkende vedrører det udlejede.

**Udlejet andel**:
Hvor stor en del af ejendommen der er udlejet erhvervsmæssigt. 100 % ved fuld udlejning.
Rammer kun ejendomsposter, aldrig indtægter.

**Opstilling**:
Årsregnskabet som ren data — hoved, sektioner, rækker, afstemning og note — uafhængigt
af om det renderes som tabel på skærmen eller som PDF.
_Undgå_: rapport, view

**Bilag**:
Et dokumenteret indtægts- eller udgiftsakt: dato, beløb, post, og en fil på disk.
Nummereres fortløbende og gapfrit inden for året.

**Afstemning**:
Sammenligning af bilagssummen pr. post med det indtastede årsbeløb for samme post.
Kun poster der har mindst ét bilag afstemmes; en post uden bilag er ikke en fejl.

### Skatten

**Udlejningsresultat**:
Indtægter minus fradragsberettigede driftsudgifter, før renter. Beskattes som
kapitalindkomst. Forbedringer og renteudgifter indgår ikke.
_Undgå_: overskud, nettoresultat

**Forbedring**:
En udgift der forøger boligens værdi. Ikke fradrag — tillægges anskaffelsessummen.
Modsætningen er vedligeholdelse, som er fradrag.

**Fordeling**:
Hvordan udlejningsresultatet fordeles mellem ægtefællerne. Enten *alt på én*
(hele resultatet hos den ægtefælle der driver udlejningen, jf. §25 A stk. 1 — uafhængigt
af ejerandel) eller *delt* efter ejerandel og hæftelse (§25 A stk. 8).

**Beskattet ægtefælle**:
Den ægtefælle der beskattes af udlejningsresultatet. Bestemmer hvilke skat.dk-felter
den enkelte person skal udfylde.

**Feltmapping**:
Oversættelsen fra appens tal til nummererede felter på skat.dk, pr. år og pr. dokumenttype.
Rolleafhængig. Projektets højeste risikopunkt.

**Forskudsopgørelse** / **Selvangivelse**:
De to skat.dk-dokumenter. Samme feltnummer betyder forskellige ting i de to — et felt
verificeres altid inden for sin egen opgørelse. "Rubrik" og "felt nr." er heller ikke
det samme.
