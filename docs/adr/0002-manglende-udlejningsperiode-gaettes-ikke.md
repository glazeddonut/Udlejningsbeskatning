# En manglende udlejningsperiode gættes ikke

Mangler et talsæt fra- og til-dato, gav dagsoptællingerne tidligere **360** — som er præcis
SKATs egen værdi for et helt udlejningsår efter 30/360-konventionen. Gættet producerede
altså ikke et åbenlyst forkert tal, men et der så fuldstændig legitimt ud, netop når
oplysningen manglede. Samme fælde ramte via en anden vej: et hul-år uden lejekontrakt fik
tildelt hele kalenderåret som periode og dermed også 360 dage.

Vi fjerner gættet begge steder. Manglende periode giver 0 dage og et eksplicit
"periode mangler"-flag, som vises i stedet for et tal. Ingen lejekontrakt betyder ingen
periode. Samtidig lukkes kilden: et år fødes aldrig uden periode, fordi serveren udleder
den af lejekontrakten ved oprettelse, og hul-år afvises helt.

## Consequences

Testen der cementerede `udlejningsdage({}) === 360` skrives bevidst om. Står lejligheden
tom et helt år med fradragsberettigede udgifter, kan året ikke oprettes uden at der først
findes en lejekontrakt der dækker det — en accepteret pris for at et 360-tal aldrig kan
opstå af ingenting.
