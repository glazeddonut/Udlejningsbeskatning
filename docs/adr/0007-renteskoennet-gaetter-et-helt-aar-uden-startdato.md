# Renteskønnet dækker hele året, når lånets startdato mangler

Lånet har fået en startdato, så renteskønnet kan skæres til den del af året lånet faktisk
løb: et lån optaget 9. august fik før et helt års rente foreslået på optagelsesåret. Uden
startdato dækker skønnet fortsat **hele året**, markeret med et synligt flag
(`manglerStartdato`), så antagelsen står på skærmen i stedet for at være tavs.

Det trækker den modsatte vej af ADR-0002, som ikke gætter en manglende udlejningsperiode.
Forskellen er hvad tallet ER. ADR-0002 handler om et **dagstal der indberettes** (felt 748
/ rubrik 207), hvor 0 er det ærlige svar og teksten "periode mangler" kan træde i stedet
for et tal. Renteskønnet er et **beløb i et felt brugeren selv redigerer**: et skøn på 0
ville læses som "ingen rente" — netop den slags forkerte tal der ser legitimt ud — mens et
helt års rente er præcis det feltet spørger om, og erstattes af bankens faktiske tal.

Der indføres **ingen afdragsprofil**. Lånet har hverken løbetid eller afdragsform, og
restgælden fremskrives ikke. Ligger peildatoen mere end et halvt år uden for det år der
regnes på, siges det som en advarsel frem for at blive regnet om på et gæt. Grænsen er
symmetrisk, fordi fejlen er det: bankens opgørelse pr. det seneste årsskifte ligger én dag
fra året og er det bedste der findes, mens en saldo et helt år på den anden side har haft
fire terminer til at flytte sig.

Dagskonventionen er **faktiske kalenderdage delt med årets faktiske længde** (365/366).
Ikke 30/360, som kun hører til det dagstal der indberettes, og ikke pro rata-måneder, som
ganger et månedsbeløb op til et årsbeløb — renten er allerede et årsbeløb der skal skæres
ned, og renter tilskrives pr. dag på en saldo.

## Consequences

De lån der allerede står i databasen har ingen startdato og får samme skøn som før, så
beslutningen er regressionsfri. Et allerede indtastet rentebeløb overskrives aldrig af et
skøn — skønnet lander kun i feltet når året oprettes, eller når brugeren selv trykker
"Beregn fra stamdata". Et år der ligger helt før lånets startdato giver intet skøn.
Peildatoens tolerance er et skøn over hvornår en saldo er "langt fra" året, ikke en
skatteregel; den kan strammes uden at ændre noget der indberettes.
