/* Luxora reputation Worker (Cloudflare Workers, nemokamas planas).
 *
 * Ką daro: su boto tokenu (saugomu Worker Secrets, NE kode) nuskaito
 * nurodyto Discord kanalo žinutes, suskaičiuoja "+rep" ir grąžina:
 *   { positive, reviews: [{name, text, avatar}], updated_at }
 * Puslapis (store.js -> REPUTATION_API_URL) kreipiasi į šį Worker.
 *
 * Secrets (Dashboard -> Worker -> Settings -> Variables -> Secrets):
 *   DISCORD_BOT_TOKEN = boto tokenas iš Discord Developer Portal
 * Vars (Text variables, gali likti default):
 *   CHANNEL_ID = Discord kanalo ID (default: žemiau)
 */

const DEFAULT_CHANNEL_ID = '1458541073164013741';
const CACHE_SECONDS = 300; // Discord klausiama max kas 5 min (rate limit apsauga)

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function avatarURL(author) {
  if (author && author.avatar) {
    const ext = String(author.avatar).startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${ext}?size=64`;
  }
  return '';
}

function toReview(msg) {
  const raw = String((msg && msg.content) || '');
  const text = raw.replace(/^\+rep\s*/i, '').trim().slice(0, 280) || '+rep';
  const author = msg.author || {};
  const name = author.global_name || author.username || '?';
  return { name, text, avatar: avatarURL(author) };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }
    if (!env.DISCORD_BOT_TOKEN) {
      return Response.json(
        { error: 'Nesukonfigūruotas DISCORD_BOT_TOKEN (Worker Secrets). Žr. REPUTATION_SETUP.txt' },
        { status: 500, headers: corsHeaders() }
      );
    }

    const channelId = env.CHANNEL_ID || DEFAULT_CHANNEL_ID;
    const cacheKey = new Request(`https://luxora-reputation/${channelId}`, request);
    try {
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(hit.body, { status: hit.status, headers });
      }
    } catch (e) { /* be kešo – tiesiog klausiame Discord */ }

    let messages;
    try {
      const r = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
        { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
      );
      if (r.status === 401 || r.status === 403) {
        return Response.json(
          { error: 'Discord atmetė tokeną arba botas nemato kanalo (reikia View Channel + Read History).' },
          { status: 502, headers: corsHeaders() }
        );
      }
      if (!r.ok) {
        return Response.json(
          { error: `Discord klaida: HTTP ${r.status}` },
          { status: 502, headers: corsHeaders() }
        );
      }
      messages = await r.json();
    } catch (e) {
      return Response.json(
        { error: 'Nepavyko pasiekti Discord API.' },
        { status: 502, headers: corsHeaders() }
      );
    }

    if (!Array.isArray(messages)) messages = [];
    const reps = messages.filter(
      (m) => m && typeof m.content === 'string' && m.content.trim().toLowerCase().startsWith('+rep')
    );
    const payload = {
      positive: reps.length,
      reviews: reps.slice(0, 12).map(toReview),
      updated_at: new Date().toISOString(),
    };
    const res = Response.json(payload, {
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
    try { await caches.default.put(cacheKey, res.clone()); } catch (e) {}
    return res;
  },
};
