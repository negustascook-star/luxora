LUXORA RENDERBOT (Render / PC — instant)
=====================================
Tas pats verify + banko sargas kaip verify-bot, bet gyvam hostingui:
- verify rolė nuimama INSTANT kai prisijungia (gateway event),
- banko žinutės trinamos INSTANT (messageCreate),
- gražūs HTML puslapiai (Patvirtinta / klaidos / statusas),
- kas 3 min atsarginis kanalu skanavimas, bet TIK žinutėms naujesnėms
  nei paleidimas (senesnes dengia Cloudflare worker cron — taip
  nesidubliuoja).

RENDER: service Settings -> Root Directory: renderbot
(buvo verify-bot — PAKEISK, kitaip veiks senas kodas).
Build: npm install | Start: npm start | Plan: Free.
Env: tie patys 6 (BASE_URL = onrender adresas).
Portal Redirects: <onrender-adresas>/callback.
Portal intents: SERVER MEMBERS + MESSAGE CONTENT.

Pilna instrukcija: verify-bot/VERIFY_SETUP.txt (Node variantas).
Atstatytas failas: verify-bot/.env.example (buvo ištrintas lokaliai).
