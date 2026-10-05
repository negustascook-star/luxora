/* Luxora verify bot.
 *
 * 1) Naujas narys serveryje -> nuimama VERIFY rolė.
 * 2) Į PM (DM) išsiunčiama žinutė su mygtuku "Patvirtinti" (OAuth2 autorizacija).
 * 3) Po autorizacijos (per naršyklę) botas: priima atgal į serverį
 *    (guilds.join) + uždeda VERIFY rolę + patvirtina į PM.
 *
 * Reikia: Gateway intents Guilds + GuildMembers (privileged!) + DirectMessages.
 * Boto rolė serveryje turi būti AUKŠČIAU už VERIFY rolę (kitaip 403).
 */

const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || '1550135782570856558';
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const GUILD_ID = process.env.GUILD_ID || '1458179076190769287';
const VERIFY_ROLE_ID = process.env.VERIFY_ROLE_ID || '1458539876226961479';
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');
const PORT = Number(process.env.PORT) || 3000;

if (!TOKEN) { console.error('Trūksta DISCORD_BOT_TOKEN (.env).'); process.exit(1); }
if (!CLIENT_SECRET) console.warn('Dėmesio: nėra CLIENT_SECRET — /callback neveiks, kol neįrašysi.');
if (!BASE_URL) console.warn('Dėmesio: nėra BASE_URL — PM mygtuko nuoroda neveiks, kol neįrašysi.');

const REDIRECT_URI = BASE_URL ? `${BASE_URL}/callback` : '';
const OAUTH_SCOPES = 'identify guilds.join';

function verifyPageURL(uid) {
  return `${BASE_URL}/verify${uid ? `?uid=${encodeURIComponent(uid)}` : ''}`;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Prisijungta kaip ${client.user.tag} — laukiu naujų narių ${GUILD_ID}.`);
});

/* --- 1+2) Atėjo naujas narys: nuimti rolę + PM su autorizacija --- */
client.on('guildMemberAdd', async (member) => {
  try {
    if (member.guild.id !== GUILD_ID) return;

    try {
      await member.roles.remove(VERIFY_ROLE_ID, 'Verify: rolė nuimta iki patvirtinimo');
      console.log(`Nuimta rolė: ${member.user.tag}`);
    } catch (e) {
      console.error(`Nepavyko nuimti rolės ${member.user.tag}: ${e.message} (ar boto rolė AUKŠČIAU už verify rolę?)`);
    }

    const embed = new EmbedBuilder()
      .setTitle('Reikia patvirtinti paskyrą')
      .setDescription(
        'Sveikas! Kad gautum prieigą prie serverio, **turi autorizuotis su botu** — ' +
        'spausk mygtuką žemiau ir patvirtink per Discord.\n\n' +
        'Autorizuodamas sutinki, kad išsaugosim prisijungimą pakartotiniam patikrinimui.\n\n' +
        'Po autorizacijos rolė bus grąžinta automatiškai.'
      )
      .setColor(0xe7ff20);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Patvirtinti paskyrą')
        .setStyle(ButtonStyle.Link)
        .setURL(BASE_URL ? verifyPageURL(member.id) : 'https://discord.com')
    );

    try {
      await member.send({ embeds: [embed], components: [row] });
      console.log(`PM išsiųstas: ${member.user.tag}`);
    } catch (e) {
      console.error(`Nepavyko išsiųsti PM ${member.user.tag}: uždarytos privačios žinutės? (${e.message})`);
    }
  } catch (e) {
    console.error('guildMemberAdd klaida:', e.message);
  }
});

/* --- 3) OAuth2: /verify nukreipia į Discord, /callback uždeda rolę --- */
const app = express();

app.get('/verify', (req, res) => {
  if (!BASE_URL || !CLIENT_ID) return res.status(500).send('Botas nesukonfigūruotas (BASE_URL).');
  const state = String(req.query.uid || '');
  const url =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    '&response_type=code' +
    `&scope=${encodeURIComponent(OAUTH_SCOPES)}` +
    (state ? `&state=${encodeURIComponent(state)}` : '');
  res.redirect(url);
});

async function discord(path, { method = 'GET', token = null, bot = false, body = null } = {}) {
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: bot ? `Bot ${TOKEN}` : `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Discord HTTP ${r.status}: ${data.message || 'klaida'}`);
  return data;
}

/* --- Autorizavusių OAuth tokenų saugykla (tokens.json, NIEKADA į git) ---
   Reikia pakartotiniam priėmimui į serverį (guilds.join) be naujos
   autorizacijos. Prieigos raktai galioja ribotai, todėl atnaujinami
   automatiškai per refresh_token. */
const fs = require('fs');
const path = require('path');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');
function loadTokens() {
  try {
    const v = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch (e) { return {}; }
}
function persistTokens(all) {
  try { fs.writeFileSync(TOKENS_FILE, JSON.stringify(all, null, 2)); }
  catch (e) { console.error('tokens.json įrašyti nepavyko:', e.message); }
}
function saveUserTokens(userId, td) {
  const all = loadTokens();
  const prev = all[userId] || {};
  all[userId] = {
    access_token: td.access_token,
    refresh_token: td.refresh_token || prev.refresh_token || null,
    obtained_at: Date.now(),
    expires_at: Date.now() + (Number(td.expires_in) || 604800) * 1000,
  };
  persistTokens(all);
}
async function getValidUserToken(userId) {
  const all = loadTokens();
  const rec = all[userId];
  if (!rec || !rec.access_token) return null;
  if (rec.expires_at && Date.now() < rec.expires_at - 60000) return rec.access_token;
  if (!rec.refresh_token || !CLIENT_SECRET) return rec.access_token;
  try {
    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: rec.refresh_token,
    });
    const r = await fetch('https://discord.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) return rec.access_token;
    saveUserTokens(userId, d);
    return d.access_token;
  } catch (e) { return rec.access_token; }
}

app.get('/callback', async (req, res) => {
  const sendErr = (msg) => res.status(400).send(`<h1>Nepavyko patvirtinti</h1><p>${msg}</p><p>Bandyk dar kartą per PM gautą mygtuką.</p>`);
  try {
    const code = String(req.query.code || '');
    if (!code) return sendErr('Nėra autorizacijos kodo.');
    if (!CLIENT_SECRET || !BASE_URL) return sendErr('Botas nesukonfigūruotas (CLIENT_SECRET / BASE_URL).');

    // Kodą keičiam į access token.
    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    });
    const tr = await fetch('https://discord.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const td = await tr.json().catch(() => ({}));
    if (!tr.ok || !td.access_token) return sendErr('Discord atmetė autorizaciją.');
    const userToken = td.access_token;

    const me = await discord('/users/@me', { token: userToken });
    const userId = me.id;

    // Išsaugom autorizavusio OAuth tokenus (auto re-verify / pakartotinis priėmimas).
    saveUserTokens(userId, td);
    const liveToken = (await getValidUserToken(userId)) || userToken;

    // Priimam atgal į serverį (jei išėjo) + uždedam rolę.
    try {
      await discord(`/guilds/${GUILD_ID}/members/${userId}`, { method: 'PUT', bot: true, body: { access_token: liveToken } });
    } catch (e) {
      console.error('guilds.join:', e.message);
    }
    await discord(`/guilds/${GUILD_ID}/members/${userId}/roles/${VERIFY_ROLE_ID}`, { method: 'PUT', bot: true });
    console.log(`Patvirtinta: ${me.username} (${userId}) — rolė uždėta.`);

    // Patvirtinam į PM (bet būtinai).
    try {
      const dm = await discord('/users/@me/channels', { method: 'POST', bot: true, body: { recipient_id: userId } });
      if (dm && dm.id) {
        await discord(`/channels/${dm.id}/messages`, {
          method: 'POST', bot: true,
          body: { content: 'Patvirtinta! Rolė grąžinta — gero apsipirkimo.' },
        });
      }
    } catch (e) {
      console.error('PM po verify nepavyko:', e.message);
    }

    res.send('<h1>Patvirtinta!</h1><p>Rolė grąžinta. Gali grįžti į Discord serverį.</p><p><small>Tavo autorizacijos duomenys saugomi pakartotiniam patikrinimui.</small></p>');
  } catch (e) {
    console.error('/callback:', e.message);
    sendErr('Serverio klaida. Bandyk dar kartą.');
  }
});

app.get('/', (req, res) => res.send('Luxora verify bot veikia.'));

/* Paleidimas tik tiesiogiai (node index.js), ne per require — kad veiktų testai. */
if (require.main === module) {
  app.listen(PORT, () => console.log(`HTTP klauso :${PORT}.`));
  client.login(TOKEN).catch((e) => { console.error('Login klaida:', e.message); process.exit(1); });
}

module.exports = { saveUserTokens, getValidUserToken, loadTokens, TOKENS_FILE };
