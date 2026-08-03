# Hjemløse poster tælles med i totalen og vises som egen række

Summeringen af indtægter og udgifter itererer kontoplanen frem for talsættets objektnøgler,
så rapporterne og totalen bygger på samme liste. Det efterlader et hul: en værdi gemt under
en nøgle der ikke findes i kontoplanen — en hjemløs post. Vi tæller den **med** i totalen og
giver den sin egen synlige række i både skærmregnskabet og PDF'en, frem for at udelade den
eller kaste en fejl.

## Considered Options

At udelade den fra totalen ville lade en reel udgift forsvinde ud af fradraget uden at
brugeren opdager det i selve regnskabet. At kaste en fejl ville gøre hele appen ubrugelig
på grund af én legacy-nøgle i JSON-filen. Begge er værre end en synlig, mærkelig række.

## Consequences

Invarianten er, at rækkerne i et regnskab **altid** summer til totalen. Det er hele
fejlklassen bag beslutningen: et årsregnskab hvor delene ikke giver totalen er værdiløst
som dokumentation over for SKAT. Enhver fremtidig ændring af kontoplanen skal bevare den.
