// Fast vidensbase for den anonyme site-widget (CBX-new). Indholdet spejler
// pricing-siden på cbx-new-one.vercel.app, så widgettens svar altid stemmer
// overens med sitet. Redigér her (eller flyt til Blob) når priserne ændres.
const WIDGET_KB = [
  {
    name: "Prisliste – Colourbox Stock og Share",
    text: `COLOURBOX STOCK — KREDITTER (engangskøb)
Én kredit køber ét vilkårligt asset: foto, vektor eller 4K-video. Ingen størrelses-tillæg, ingen format-straf, ingen skjulte licenstrin.
- 1 kredit: 9 EUR (9,00 EUR pr. download)
- 10 kreditter: 69 EUR (6,90 EUR pr. download) — mest populær
- 50 kreditter: 295 EUR (5,90 EUR pr. download)
- 200 kreditter: 980 EUR (4,90 EUR pr. download)
Kreditter udløber ikke og kan bruges af alle på kontoen.

COLOURBOX SHARE — ABONNEMENTER (pr. måned)
- Team: 49 EUR/md. Op til 10 brugere, 500 GB lager, deling og mapper, consent-tracking, EU-hosting.
- Business: 199 EUR/md. (anbefalet) Op til 100 brugere, 5 TB lager, roller og rettigheder, fuld audit-log, Stock-kreditter inkluderet, prioriteret support.
- Enterprise: individuel pris. Ubegrænsede brugere, SSO/SCIM, NIS2- og AI Act-understøttelse, CDN-distribution, dedikeret success manager.
Alle Share-planer faktureres månedligt og kan opsiges med løbende måned + 30 dage. Årlig betaling giver 2 måneder gratis.`,
  },
  {
    name: "Licensvilkår – kort udgave",
    text: `LICENS (gælder alle Stock-downloads)
- Royalty-fri licens: betal én gang, brug for altid — også efter abonnementets ophør.
- Tilladt: markedsføring, web, sociale medier, præsentationer, tryk op til 500.000 eksemplarer, apps og software-UI.
- Ikke tilladt: videresalg af filen som den er, brug i varemærker/logoer, print-on-demand-produkter til videresalg uden udvidet licens, ærekrænkende eller vildledende sammenhænge.
- Personer på billeder: alle modeller har underskrevet model release. Følsomme sammenhænge (sundhed, politik, dating) kræver udvidet licens.
- Kreditering er ikke påkrævet, men værdsat: "Foto: Colourbox".
- Én licens dækker én juridisk enhed; bureauer skal købe klient-licens pr. slutkunde.
EU-DATA: Alle filer hostes og distribueres fra EU-datacentre. Ingen data forlader EU.`,
  },
  {
    name: "FAQ – kundeservice",
    text: `OFTE STILLEDE SPØRGSMÅL
Sp: Kan jeg prøve gratis? Sv: Ja — opret en gratis konto og gennemse hele biblioteket med vandmærke. Share har 14 dages gratis prøve på Team-planen.
Sp: Hvordan opsiger jeg? Sv: Under Konto → Abonnement → Opsig. Opsigelse gælder fra næste faktureringsperiode (løbende måned + 30 dage).
Sp: Kan jeg skifte plan? Sv: Ja, op- og nedgradering sker med det samme; difference modregnes på næste faktura.
Sp: Faktura og EAN? Sv: Vi sender faktura med EAN til offentlige kunder og understøtter betalingskort samt bankoverførsel for Business/Enterprise.
Sp: Refusion? Sv: Ubrugte kreditter refunderes inden for 14 dage efter køb. Downloadede assets refunderes ikke.
Sp: Hvor hurtigt svarer support? Sv: Hverdage 9–16 CET, typisk under 2 timer. Business/Enterprise har prioriteret support.
Sp: Kontakt? Sv: support@colourbox.com eller chatten her på sitet.`,
  },
];

module.exports = { WIDGET_KB };
