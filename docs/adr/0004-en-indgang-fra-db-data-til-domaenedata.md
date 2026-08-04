# Én indgang fra db-data til domænedata

Alle beregninger forudsatte et normaliseret talsæt, men hver kalder skulle selv huske at
normalisere. PDF-generatoren huskede det ikke — den arvede et normaliseret talsæt fra
skærmkomponenten. Invarianten var ren konvention på tværs af et seam, og intet håndhævede
den.

Vi indfører ét module der tager de rå db-former ind (år, lejekontrakter, personer, ejendom,
lån, indstillinger, bilag), normaliserer én gang, og giver domæneformede data ud. Både
skærmregnskabet og PDF'en kalder det. Samme mønster som `aarsgrundlag`.

## Consequences

De fejl der faktisk har kunnet påvises i dette projekt — forkert dagstal, bilag nummereret
2/3 i stedet for 1/2 — lå ikke i regnereglerne, men i *hvordan funktionerne kaldes og
hvornår deres resultat fryses*. De rene funktioner var grønne hele vejen igennem. Et module
med db-formede data ind og domæneformede data ud flytter netop den fejlklasse ind under
`node --test`, uden React- eller HTTP-testinfrastruktur. Det er grunden til at seamet ligger
her og ikke i komponenterne.
