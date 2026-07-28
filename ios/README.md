# Colourbox AI — iPhone-app

Native SwiftUI-skal omkring web-appen på https://ai-chat-nine-silk.vercel.app.
Al funktionalitet deles 1:1 med webudgaven — hver web-deploy opdaterer appen
automatisk, uden App Store-opdatering.

## Kør appen

1. Installér Xcode fra Mac App Store (gratis).
2. Åbn `ios/AIChat.xcodeproj`.
3. Vælg en simulator (fx iPhone 15) og tryk ⌘R.

## På din egen iPhone

1. Sæt telefonen i med kabel og vælg den som destination.
2. Under *Signing & Capabilities*: vælg dit personlige Apple-ID som Team
   (gratis — appen skal geninstalleres hver 7. dag uden betalt konto).
3. ⌘R. Første gang: godkend udvikleren under Indstillinger → Generelt →
   VPN og enhedsadministration.

## Detaljer

- Login-cookien gemmes i appens WKWebsiteDataStore — du forbliver logget ind.
- Mikrofon (voice chat) virker: OS-dialogen vises første gang
  (NSMicrophoneUsageDescription), hvorefter web-appens getUserMedia får lov.
- Eksterne links (kilder m.m.) åbnes i Safari.
- Offline vises en dansk fejlside med "Prøv igen".
