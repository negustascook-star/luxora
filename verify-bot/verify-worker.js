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
        const tr = await fetch('https://discord.com/oauth2/token', {
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
          '<h1>Patvirtinta!</h1><p>Rolė grąžinta. Gali grįžti į Discord serverį.</p><p><small>Tavo autorizacijos duomenys saugomi pakartotiniam patikrinimui.</small></p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      } catch (e) {
        console.error('/callback:', e.message);
        return fail('Serverio klaida. Bandyk dar kartą.');
      }
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
      if (!joined.length) return;
      const byId = new Map(members.map((m) => [m.user.id, (m.user.username || '?')]));
      for (const id of joined) {
        await handleNewMember(env, cfg, id, byId.get(id) || id);
      }
      await env.STORE.put('members', JSON.stringify(current));
    } catch (e) {
      console.error('scheduled:', e.message);
    }
  },
};
