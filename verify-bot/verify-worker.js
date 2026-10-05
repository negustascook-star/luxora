/* Luxora verify Worker (Cloudflare Workers, nemokamas planas).
 *
 * Ką daro (viskas per Discord REST — gateway nereikia):
 *  - CRON kas 2 min: palygina serverio narių sąrašą su KV snapshot.
 *    Naujiems: nuima VERIFY rolę + BŪTINAI PM su autorizacijos mygtuku.
 *    (Pirmas paleidimas tik išsaugo sąrašą, veiksmų nedaro.)
 *  - GET /verify: nukreipia į Discord OAuth2 (identify + guilds.join).
 *  - GET /callback: iškeičia kodą į tokeną, priima atgal į serverį,
 *    uždeda VERIFY rolę, IŠSAUGO autorizavusio tokenus (KV) ir
 *    patvirtina į PM.
 *
 * Secrets (Worker -> Settings -> Variables -> Secrets):
 *   DISCORD_BOT_TOKEN, CLIENT_SECRET
 * Text variables (gali likti default):
 *   GUILD_ID, VERIFY_ROLE_ID, CLIENT_ID, BASE_URL (šito workerio URL)
 * KV binding (Workers -> KV -> Create namespace, tada Worker Settings
 * -> Bindings -> KV Namespace, kintamasis: STORE).
 * Cron trigger (Worker -> Triggers -> Cron): kas 2 minutes.
 *
 * Portalas: OAuth2 Redirects turi turėti <BASE_URL>/callback.
 * Boto rolė serveryje turi būti AUKŠČIAU už VERIFY rolę.
 */

const DEFAULTS = {
  GUILD_ID: '1458179076190769287',
  VERIFY_ROLE_ID: '1458539876226961479',
  CLIENT_ID: '1550135782570856558',
};
const OAUTH_SCOPES = 'identify guilds.join';

export function verifyURL(base, uid) {
  const clean = String(base || '').replace(/\/+$/, '');
  return `${clean}/verify${uid ? `?uid=${encodeURIComponent(uid)}` : ''}`;
}

/* ---------- banko duomenų sargas ----------
   Jei kažkas į kanalą parašo nutekintus rekvizitus (vardą arba SENĄ
   IBAN), žinutė trinama, o vietoj jos gražus embedas su mygtuku
   "Duomenys". Mygtukas privačiai (ephemeral) parodo OFICIALIUS
   rekvizitus — visiems, IŠSKYRUS pradinį rašytoją. */
const BANK_TRIGGERS = ['pijusmatulaitis', 'lt777300010158788640'];
const BANK_DETAILS_TEXT =
  'Gavėjas: PIJUS MATULAITIS\nIBAN: LT627044090108005522\nPaskirtis: papildymas';
// Vienintelis vartotojas, kuris mato ir gali naudoti /banktest.
const ALLOWED_TESTER = '1427735541285388443';

export function matchBankText(text) {
  const n = String(text || '').toLowerCase().replace(/[\s.\-]+/g, '');
  if (!n) return false;
  return BANK_TRIGGERS.some((t) => n.includes(t));
}

export function bankEmbed(authorId) {
  return {
    embeds: [{
      title: 'Apmokėjimas bankiniu pavedimu',
      description: 'Banko duomenys čia neberodomi.\n\nSpausk mygtuką **Duomenys** žemiau.',
      color: 0xe7ff20,
    }],
    components: [{
      type: 1,
      components: [{ type: 2, style: 1, label: 'Duomenys', custom_id: `bankdata:${authorId}` }],
    }],
  };
}

export function parseBankCustomId(customId) {
  const m = String(customId || '').match(/^bankdata:([^:]+)$/);
  return m ? m[1] : null;
}

async function bankScan(env, cfg) {
  // Kanalų sąrašas (kešuojamas valandai).
  let channels = null;
  try {
    const cached = await env.STORE.get('bank_channels', 'json');
    if (cached && Date.now() - (cached.ts || 0) < 3600_000 && Array.isArray(cached.ids)) {
      channels = cached.ids;
    }
  } catch (e) {}
  if (!channels) {
    const list = await discord(`/guilds/${cfg.guild}/channels`, { botToken: env.DISCORD_BOT_TOKEN });
    if (!Array.isArray(list)) throw new Error(`channels HTTP: netikėtas atsakymas`);
    channels = list.filter((c) => c && c.type === 0 && c.id).map((c) => c.id);
    await env.STORE.put('bank_channels', JSON.stringify({ ts: Date.now(), ids: channels }));
  }
  let seen = {};
  try { seen = (await env.STORE.get('bank_seen', 'json')) || {}; } catch (e) { seen = {}; }
  let changed = false;
  for (const ch of channels) {
    const last = seen[ch] || null;
    let msgs;
    try {
      msgs = await discord(`/channels/${ch}/messages?limit=25${last ? `&after=${encodeURIComponent(last)}` : ''}`, {
        botToken: env.DISCORD_BOT_TOKEN,
      });
    } catch (e) { continue; }
    if (!Array.isArray(msgs) || msgs.length === 0) continue;
    const sorted = [...msgs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    for (const m of sorted) {
      if (!m || !m.id || !m.author) continue;
      if (m.author.bot || m.webhook_id) continue; // savų nežinučių neliečiam
      if (!matchBankText(m.content)) continue;
      try {
        await discord(`/channels/${ch}/messages/${m.id}`, { method: 'DELETE', botToken: env.DISCORD_BOT_TOKEN });
        console.log(`Ištrinta banko žinutė ${m.id} kanale ${ch} (autorius ${m.author.username}).`);
      } catch (e) { console.error(`Trinti nepavyko ${m.id}: ${e.message}`); continue; }
      try {
        await discord(`/channels/${ch}/messages`, {
          method: 'POST', botToken: env.DISCORD_BOT_TOKEN, body: bankEmbed(m.author.id),
        });
      } catch (e) { console.error(`Embed nepavyko ${ch}: ${e.message}`); }
    }
    seen[ch] = sorted[sorted.length - 1].id;
    changed = true;
  }
  if (changed) {
    try { await env.STORE.put('bank_seen', JSON.stringify(seen)); } catch (e) {}
  }
}

/* ---------- Discord interactions (mygtukai) ---------- */
function hexToBytes(hex) {
  const h = String(hex || '').trim();
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export async function verifyDiscordRequest(publicKeyHex, signatureHex, timestamp, rawBody) {
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify(
      'Ed25519', key, hexToBytes(signatureHex), new TextEncoder().encode(timestamp + rawBody)
    );
  } catch (e) { return false; }
}

export async function handleInteraction(request, env) {
  const sig = request.headers.get('x-signature-ed25519') || '';
  const ts = request.headers.get('x-signature-timestamp') || '';
  const raw = await request.text();
  const pub = env.DISCORD_PUBLIC_KEY || '';
  if (!pub || !(await verifyDiscordRequest(pub, sig, ts, raw))) {
    return new Response('Bad signature', { status: 401 });
  }
  let data = null;
  try { data = JSON.parse(raw); } catch (e) { return new Response('bad json', { status: 400 }); }
  if (data.type === 1) return Response.json({ type: 1 }); // PING
  // Slash komanda /banktest — testavimui DM ir serveryje (atsakymas
  // privatus, mygtukas su custom_id bankdata:0 veikia visiems spaudžiantiems).
  // Matyti/naudoti gali TIK testuotojas (ID žemiau) — kitiems privatus "Neturi teisių".
  if (data.type === 2 && data.data && data.data.name === 'banktest') {
    // Komanda veikia TIK privačiose žinutėse (DM), ne serveriuose.
    if (data.guild_id) {
      return Response.json({ type: 4, data: { content: 'Ši komanda veikia tik privačiose žinutėse (DM).', flags: 64 } });
    }
    const invoker = (data.member && data.member.user && data.member.user.id)
      || (data.user && data.user.id) || '';
    if (invoker !== ALLOWED_TESTER) {
      return Response.json({ type: 4, data: { content: 'Neturi teisių naudotis šia komanda.', flags: 64 } });
    }
    return Response.json({ type: 4, data: { ...bankEmbed('0'), flags: 64 } });
  }
  if (data.type === 3 && data.data && typeof data.data.custom_id === 'string') {
    const posterId = parseBankCustomId(data.data.custom_id);
    if (posterId) {
      const clicker = (data.member && data.member.user && data.member.user.id)
        || (data.user && data.user.id) || '';
      if (clicker && clicker === posterId) {
        // Pradinis rašytojas: duomenų negauna (Discord reikalauja
        // kažkokio atsakymo, kitaip rodytų "interaction failed").
        return Response.json({ type: 4, data: { content: 'Šis mygtukas tau neveikia.', flags: 64 } });
      }
      return Response.json({ type: 4, data: { content: BANK_DETAILS_TEXT, flags: 64 } });
    }
  }
  return new Response('unknown interaction', { status: 400 });
}

export function diffMembers(current, snapshot) {
  // Palaiko ir naują formatą {id: joined_at}, ir seną [id, ...].
  // Pakartotinis atėjimas pagaunamas pagal pasikeitusį joined_at —
  // net jei išėjo ir grįžo tarp dviejų patikrinimų.
  const norm = (v) => {
    if (Array.isArray(v)) return new Map(v.map((id) => [id, null]));
    if (v && typeof v === 'object') return new Map(Object.entries(v));
    return new Map();
  };
  const cur = norm(current);
  const prev = norm(snapshot);
  const joined = [];
  for (const [id, ts] of cur) {
    if (!prev.has(id)) joined.push(id);
    else if (ts && prev.get(id) && ts !== prev.get(id)) joined.push(id);
  }
  const left = [...prev.keys()].filter((id) => !cur.has(id));
  return { joined, left };
}

async function discord(path, { method = 'GET', botToken = null, userToken = null, body = null } = {}) {
  const auth = botToken ? `Bot ${botToken}` : `Bearer ${userToken}`;
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Discord HTTP ${r.status}: ${data.message || 'klaida'}`);
  return data;
}

async function listAllMembers(botToken, guildId) {
  const all = [];
  let after = '0';
  while (true) {
    const batch = await discord(`/guilds/${guildId}/members?limit=1000&after=${after}`, { botToken });
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }
  return all;
}

function verifyDMContent(base, uid) {
  return (
    'Sveikas! Kad gautum prieigą prie serverio, **turi autorizuotis su botu** — ' +
    'spausk mygtuką žemiau ir patvirtink per Discord.'
  );
}

async function handleNewMember(env, cfg, userId, username) {
  // 1) Nuimam rolę.
  try {
    await discord(`/guilds/${cfg.guild}/members/${userId}/roles/${cfg.role}`, {
      method: 'DELETE', botToken: env.DISCORD_BOT_TOKEN,
    });
    console.log(`Rolė nuimta: ${username} (${userId})`);
  } catch (e) {
    console.error(`Rolės nuėmimas nepavyko ${username}: ${e.message} (ar boto rolė AUKŠČIAU?)`);
  }
  // 2) BŪTINAI PM su autorizacijos mygtuku.
  try {
    const dm = await discord('/users/@me/channels', {
      method: 'POST', botToken: env.DISCORD_BOT_TOKEN, body: { recipient_id: userId },
    });
    await discord(`/channels/${dm.id}/messages`, {
      method: 'POST', botToken: env.DISCORD_BOT_TOKEN,
      body: {
        content: verifyDMContent(cfg.base, userId),
        components: [{
          type: 1,
          components: [{
            type: 2, style: 5,
            label: 'Patvirtinti paskyrą',
            url: verifyURL(cfg.base, userId),
          }],
        }],
      },
    });
    console.log(`PM išsiųstas: ${username}`);
  } catch (e) {
    console.error(`PM nepavyko ${username}: uždaryti DM? (${e.message})`);
  }
}

function readTokens(store) {
  return store.get('tokens', 'json').then((v) => (v && typeof v === 'object' ? v : {})).catch(() => ({}));
}
async function saveUserToken(store, userId, td) {
  const all = await readTokens(store);
  const prev = all[userId] || {};
  all[userId] = {
    access_token: td.access_token,
    refresh_token: td.refresh_token || prev.refresh_token || null,
    obtained_at: Date.now(),
    expires_at: Date.now() + (Number(td.expires_in) || 604800) * 1000,
  };
  await store.put('tokens', JSON.stringify(all));
}

function cfgOf(env) {
  return {
    guild: env.GUILD_ID || DEFAULTS.GUILD_ID,
    role: env.VERIFY_ROLE_ID || DEFAULTS.VERIFY_ROLE_ID,
    client: env.CLIENT_ID || DEFAULTS.CLIENT_ID,
    base: String(env.BASE_URL || '').replace(/\/+$/, ''),
  };
}

export default {
  /* --- HTTP: statusas, /verify, /callback --- */
  async fetch(request, env) {
    const url = new URL(request.url);
    const cfg = cfgOf(env);

    if (url.pathname === '/verify') {
      if (!cfg.base) return new Response('Nesukonfigūruotas BASE_URL.', { status: 500 });
      const uid = url.searchParams.get('uid') || '';
      const auth =
        'https://discord.com/oauth2/authorize' +
        `?client_id=${encodeURIComponent(cfg.client)}` +
        `&redirect_uri=${encodeURIComponent(`${cfg.base}/callback`)}` +
        '&response_type=code' +
        `&scope=${encodeURIComponent(OAUTH_SCOPES)}` +
        (uid ? `&state=${encodeURIComponent(uid)}` : '');
      return Response.redirect(auth, 302);
    }

    if (url.pathname === '/callback') {
      const fail = (msg) => new Response(
        `<h1>Nepavyko patvirtinti</h1><p>${msg}</p><p>Bandyk dar kartą per PM gautą mygtuką.</p>`,
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
      try {
        const code = url.searchParams.get('code') || '';
        if (!code) return fail('Nėra autorizacijos kodo.');
        if (!env.CLIENT_SECRET || !cfg.base) return fail('Botas nesukonfigūruotas.');

        const form = new URLSearchParams({
          client_id: cfg.client,
          client_secret: env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${cfg.base}/callback`,
        });
        const tr = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        const td = await tr.json().catch(() => ({}));
        if (!tr.ok || !td.access_token) {
          const why = td.error_description || td.error || `HTTP ${tr.status}`;
          console.error('token exchange:', tr.status, why);
          return fail(`Discord atmetė autorizaciją (${why}).`);
        }

        const meR = await fetch('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bearer ${td.access_token}` },
        });
        const me = await meR.json().catch(() => ({}));
        if (!meR.ok || !me.id) return fail('Discord atmetė autorizaciją.');
        const userId = me.id;

        // Išsaugom autorizavusio tokenus (KV).
        try { await saveUserToken(env.STORE, userId, td); } catch (e) { console.error('Token saugoti nepavyko:', e.message); }

        // Priimam atgal į serverį + uždedam rolę.
        try {
          await discord(`/guilds/${cfg.guild}/members/${userId}`, {
            method: 'PUT', botToken: env.DISCORD_BOT_TOKEN, body: { access_token: td.access_token },
          });
        } catch (e) { console.error('guilds.join:', e.message); }
        await discord(`/guilds/${cfg.guild}/members/${userId}/roles/${cfg.role}`, {
          method: 'PUT', botToken: env.DISCORD_BOT_TOKEN,
        });
        console.log(`Patvirtinta: ${me.username} (${userId})`);

        // Patvirtinam BŪTINAI į PM.
        try {
          const dm = await discord('/users/@me/channels', {
            method: 'POST', botToken: env.DISCORD_BOT_TOKEN, body: { recipient_id: userId },
          });
          if (dm && dm.id) {
            await discord(`/channels/${dm.id}/messages`, {
              method: 'POST', botToken: env.DISCORD_BOT_TOKEN,
              body: { content: 'Patvirtinta! Rolė grąžinta — gero apsipirkimo.' },
            });
          }
        } catch (e) { console.error('PM po verify nepavyko:', e.message); }

        return new Response(
          `<!doctype html><html lang="lt"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>Patvirtinta — Luxora</title><style>` +
          `*{box-sizing:border-box;margin:0}body{min-height:100vh;display:flex;align-items:center;justify-content:center;` +
          `background:#0b0d0a;color:#f2f3eb;font-family:Inter,system-ui,sans-serif;padding:20px}` +
          `.card{background:#12160f;border:1px solid #2a3122;border-radius:20px;padding:40px 36px;text-align:center;max-width:420px}` +
          `.check{width:72px;height:72px;margin:0 auto 18px;border-radius:50%;background:#e7ff20;color:#0b0d0a;` +
          `font-size:36px;font-weight:900;display:flex;align-items:center;justify-content:center}` +
          `h1{font-size:28px;margin-bottom:10px}p{color:#c9cec0;margin-bottom:22px}` +
          `a{display:inline-block;background:#e7ff20;color:#0b0d0a;font-weight:800;text-decoration:none;` +
          `padding:12px 26px;border-radius:12px}</style></head><body><div class="card">` +
          `<div class="check">✓</div><h1>Patvirtinta!</h1>` +
          `<p>Rolė grąžinta. Gali grįžti į Discord serverį.</p>` +
          `<a href="https://discord.com/channels/${cfg.guild}">Grįžti į serverį</a>` +
          `</div></body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      } catch (e) {
        console.error('/callback:', e.message);
        return fail('Serverio klaida. Bandyk dar kartą.');
      }
    }

    if (url.pathname === '/interactions' && request.method === 'POST') {
      return handleInteraction(request, env);
    }

    return new Response('Luxora verify worker veikia. Cron tikrina narius kas 2 min.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },

  /* --- CRON: nauji nariai -> nuimti rolę + PM --- */
  async scheduled(event, env, ctx) {
    if (!env.DISCORD_BOT_TOKEN || !env.STORE) {
      console.error('Trūksta DISCORD_BOT_TOKEN arba STORE (KV binding).');
      return;
    }
    const cfg = cfgOf(env);
    try {
      const members = await listAllMembers(env.DISCORD_BOT_TOKEN, cfg.guild);
      const current = {};
      for (const m of members) {
        if (m.user && m.user.id) current[m.user.id] = m.joined_at || null;
      }
      const raw = await env.STORE.get('members');
      if (!raw) {
        // Pirmas paleidimas: tik išsaugom sąrašą, veiksmų nedarom.
        await env.STORE.put('members', JSON.stringify(current));
        console.log(`Baseline išsaugotas (${Object.keys(current).length} narių). Nuo kito karto stebima.`);
        return;
      }
      let snapshot = null;
      try { snapshot = JSON.parse(raw); } catch (e) { snapshot = null; }
      if (!snapshot) {
        // Sugadinti duomenys — perrašom švariai, veiksmų nedarom.
        await env.STORE.put('members', JSON.stringify(current));
        console.log('Snapshot atstatytas iš naujo.');
        return;
      }
      const { joined } = diffMembers(current, snapshot);
      if (joined.length) {
        const byId = new Map(members.map((m) => [m.user.id, (m.user.username || '?')]));
        for (const id of joined) {
          await handleNewMember(env, cfg, id, byId.get(id) || id);
        }
        await env.STORE.put('members', JSON.stringify(current));
      }
      // Banko duomenų sargas visuose kanaluose.
      try { await bankScan(env, cfg); } catch (e) { console.error('bankScan:', e.message); }
    } catch (e) {
      console.error('scheduled:', e.message);
    }
  },
};
