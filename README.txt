LUXORA RESELLS — V6 front-end demo

Failai:
- index.html — parduotuvė
- admin.html — administratoriaus panelė
- styles.css / app.js — parduotuvės dizainas ir logika
- admin.css / admin.js — admin panelė
- store.js — bendri produktų, dropo ir chat duomenys
- assets/luxora-logo.png
- PRODUCTION_SECURITY.txt — ką įjungti serveryje prieš viešą paleidimą

Paleidimas:
1. Išarchyvuok aplanką.
2. Rekomenduojama paleisti per serverį:
   python -m http.server 8080
3. Parduotuvė: http://localhost:8080
4. Admin: http://localhost:8080/admin.html

Demo admin slaptažodis nustatomas atskirai (nepublikuojamas faile).

Kas naujo V6:
- Katalogas startuoja TUŠČIAS — nebėra demo prekių.
- Prekes pats įkeli per admin panelę.
- Vienai prekei galima įkelti nuo 1 iki 5 nuotraukų.
- Nuotraukos įkeliamos tiesiai iš kompiuterio / telefono, o ne per URL.
- Pirma nuotrauka yra pagrindinė; admin panelėje galima kitą nustatyti pagrindine arba pašalinti.
- Nuotraukos automatiškai sumažinamos ir suspaudžiamos, kad localStorage neperpildytų taip greitai.
- Prekės puslapyje atsirado kelių nuotraukų galerija.
- Admin panelė vizualiai atnaujinta: naujas control-center blokas, tvarkingesnės kortelės, lentelė ir prekių redaktorius.
- Tuščio katalogo būsena atrodo normaliai tiek parduotuvėje, tiek admin panelėje.
- Rezervacijų anti-spam: 1 nauja rezervacija kas 3 sekundes vienoje naršyklėje.
- Vienu metu vienoje naršyklėje leidžiamos iki 5 aktyvių rezervacijų.
- Rezervacijų pakeitimai sinchronizuojami tarp to paties domeno naršyklės tabų.

SVARBU APIE APSAUGĄ:
Ši versija vis dar yra front-end prototipas ir duomenys saugomi browserio localStorage.
3 sekundžių anti-spam apsauga sustabdo paprastą greitą spaudinėjimą, tačiau žmogus gali apeiti naršyklės JavaScript arba siųsti užklausas tiesiai į būsimą backend API.
Tikrai viešai svetainei rezervacijų limitas PRIVALO būti tikrinamas ir serveryje. Žr. PRODUCTION_SECURITY.txt.

Taip pat front-end demo admin slaptažodis nėra saugus produkcijai, nes jis yra JavaScript faile. Tikram puslapiui reikia backend prisijungimo ir duomenų bazės.
