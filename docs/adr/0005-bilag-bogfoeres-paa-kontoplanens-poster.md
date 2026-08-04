# Bilag bogføres på kontoplanens poster

Bilagenes kategori var frie strenge uden kobling til kontoplanens poster, så et bilag på
"Vedligeholdelse" og en udgiftspost `vedligeholdelse` var to ubeslægtede ting. Vi lader
bilag pege på en post i kontoplanen i stedet, og bygger afstemningen: bilagssummen pr. post
holdt op mod det indtastede årsbeløb for samme post, vist i årsregnskabet — på skærm og i
PDF — og kun mod grundlaget *faktisk*.

Kontoplanen får derfor et par poster den ikke summerer, til renteudgifter og forbedringer,
så alt hvad et bilag kan dokumentere har et sted at høre til.

## Considered Options

Kun poster der **har** mindst ét bilag afstemmes. En post uden bilag vises neutralt som
"ingen bilag", ikke som en fejl. Alternativet — at markere hver difference — ville lyse rødt
på næsten alt, fordi grundskyld prefilles fra stamdata uden bilag og husleje tastes som
månedsbeløb med pro rata. En advarsel der altid lyser, læres der at ignorere, og det er
farligt i en app hvis øvrige advarsler handler om markedsleje og gaveelement.

## Consequences

Prisen er, at en glemt kvittering fremstår som "ingen bilag" frem for som en fejl.
Eksisterende bilag skal migreres, men kategorierne er få og oversættes entydigt.
