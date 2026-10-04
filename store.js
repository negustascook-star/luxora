/* Luxora basic deterrent (ne tikra apsauga — kodas vis tiek siunčiamas naršyklei). */
(function(){try{console.clear();console.log('%cLuxora — sustok.','font-weight:bold')}catch(e){}
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();
if(e.key==='F12'||((e.ctrlKey||e.metaKey)&&e.shiftKey&&(k==='i'||k==='j'||k==='c'))||((e.ctrlKey||e.metaKey)&&k==='u')){e.preventDefault();e.stopPropagation();return false}},true)})();
(() => {
  /* Statinis režimas (GitHub Pages): GitHub nemoka vykdyti Node.js,
     todėl vietoj /api serverio naudojama naršyklės localStorage.
     Savo serveryje (VPS) automatiškai naudojamas /api backend. */
  const STATIC_MODE = (() => {
    try { return /\.github\.io$/i.test(location.hostname); }
    catch(e){ return true; }
  })();

  const DEFAULT_ADMIN_PASSWORD = 'admin123';

  /* Atsiliepimai iš Discord: puslapis pats negali kviesti Discord API
     (naršyklė blokuoja CORS, o boto tokenas viešame kode būtų pavogtas).
     Todėl užklausa eina per Worker-tarpininką (žr. REPUTATION_SETUP.txt).
     Worker URL ima iš admin panelės nustatymų, čia – tik atsarginis.
     Bot tokenas saugomas TIK admino naršyklės localStorage
     (įvedama per admin panelę, niekada nepatenka į git). */
  const REPUTATION_API_URL =
    (typeof window !== 'undefined' && window.LUXORA_REPUTATION_URL) || '';

  const KEYS = {
    cart: 'luxora_cart_v1',
    favorites: 'luxora_favorites_v6',
    chats: 'luxora_chat_sessions_v6',
    buyerId: 'luxora_buyer_id_v6',
    dropFallback: 'luxora_next_drop',
    products: 'luxora_products_v6',
    orders: 'luxora_orders_v6',
    version: 'luxora_version_v6',
    adminPw: 'luxora_admin_pw_v6',
    adminSession: 'luxora_admin_session_v6',
    dcWorker: 'luxora_dc_worker_v6',
    dcToken: 'luxora_dc_token_v6',
    dcChannel: 'luxora_dc_channel_v6',
    dcStatus: 'luxora_dc_status_v6'
  };

  const DELIVERY = {
    lpexpress: { label: 'LP Express', fee: 2.05 },
    omniva: { label: 'Omniva', fee: 2.49 },
    dpd: { label: 'DPD', fee: 1.98 }
  };
  const BANK = { name: 'PIJUS MATULAITIS', iban: 'LT777300010158788640' };

  const silhouettes = {
    shoe: `<svg viewBox="0 0 520 320" aria-hidden="true"><path fill="#f2f3eb" d="M78 198c38-8 77-30 115-57 18-13 29-39 35-78l62 22c6 2 9 9 7 15l-7 21c32 31 70 54 113 63l37 8c29 6 40 33 23 52-16 18-41 28-74 29H111c-38 0-58-15-61-37-3-18 7-32 28-38Z"/><path fill="#20231e" d="M228 83l56 20-10 31-62-23zM178 150l111 25-7 20-120-25z"/><path fill="#d9e51e" d="M149 190c65 9 136 19 213 31l-7 13-216-21z"/><path fill="#090b08" d="M70 238h360c-5 15-25 22-55 22H109c-18 0-31-6-39-22Z"/></svg>`,
    shoe2: `<svg viewBox="0 0 520 340" aria-hidden="true"><path fill="#e8e9e0" d="M92 110l74-30 65 34 49-26 49 18 14 86 83 31c31 12 39 47 13 66-19 14-47 20-83 20H118c-49 0-73-14-76-42-2-22 14-39 48-51l2-106Z"/><path fill="#11130f" d="M98 117l69-27 58 33-18 44-111-17zM269 101l52 18 12 68-75-19zM217 178l117 27 21 59H197z"/><path fill="#cfd0c8" d="M104 206c79 17 171 36 275 58l-18 18-271-34z"/><circle cx="175" cy="155" r="10" fill="#e7ff20"/></svg>`,
    hoodie: `<svg viewBox="0 0 420 420" aria-hidden="true"><path fill="#e9eae2" d="M151 87c18-22 38-32 59-32s41 10 59 32l45 27 51 67-44 30-23-29v164H122V182l-23 29-44-30 51-67 45-27Z"/><path fill="#151812" d="M173 83c8 22 20 34 37 34s29-12 37-34c-9-10-21-15-37-15s-28 5-37 15Z"/><path fill="#e7ff20" d="M169 199h82v27h-82z"/><path fill="#11130f" d="M181 196h58v5h-58z"/></svg>`,
    tee: `<svg viewBox="0 0 420 420" aria-hidden="true"><path fill="#efefe8" d="M139 79c20 17 44 26 71 26s51-9 71-26l88 52-42 78-38-21v170H131V188l-38 21-42-78 88-52Z"/><rect x="151" y="188" width="118" height="47" rx="6" fill="#e7ff20"/><rect x="176" y="204" width="68" height="14" rx="4" fill="#11130f"/></svg>`,
    beanie: `<svg viewBox="0 0 420 420" aria-hidden="true"><path fill="#e8e9e1" d="M86 238c8-105 52-167 124-167s116 62 124 167H86Z"/><rect x="72" y="224" width="276" height="87" rx="28" fill="#d8d9d1"/><rect x="161" y="249" width="98" height="32" rx="7" fill="#e7ff20"/><path d="M130 225c12-77 39-117 80-117s68 40 80 117" fill="none" stroke="#a7aaa0" stroke-width="8" stroke-dasharray="7 9"/></svg>`,
    pants: `<svg viewBox="0 0 420 420" aria-hidden="true"><path fill="#e8e9e1" d="M129 63h162l-18 294h-75l12-176-24 176h-75l18-294Z"/><path fill="#141713" d="M136 73h148l-3 38H133zM191 117h38l-8 84-15 18-17-18z"/><path fill="#e7ff20" d="M140 129h44v9h-44z"/></svg>`
  };

  /* ---------- helpers ---------- */
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function money(v){ return new Intl.NumberFormat('lt-LT',{style:'currency',currency:'EUR'}).format(Number(v)||0); }
  function uid(prefix='id'){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`; }
  function escapeHTML(value=''){ return String(value).replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c])); }
  function totalStock(product){ return Object.values(product.sizes || {}).reduce((a,b)=>a + (Number(b)||0),0); }
  function productImages(product){
    const imgs = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
    return imgs.slice(0,5);
  }
  function productVisual(product, imageOverride=null){
    const image = imageOverride || productImages(product)[0] || '';
    if(image){
      return `<img class="product-photo" src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"/><div class="product-silhouette fallback-silhouette" style="display:none">${silhouettes[product.type] || silhouettes.tee}</div>`;
    }
    return `<div class="product-silhouette">${silhouettes[product.type] || silhouettes.tee}</div>`;
  }
  function parseSizes(input){
    const out = {};
    String(input || '').split(',').map(s=>s.trim()).filter(Boolean).forEach(part=>{
      const [size,qty] = part.split(':').map(s=>s.trim());
      if(size) out[size] = Math.max(0, Number.parseInt(qty || '0',10) || 0);
    });
    return out;
  }
  function sizesToText(sizes){ return Object.entries(sizes || {}).map(([s,q])=>`${s}:${q}`).join(', '); }

  /* ---------- lokali saugykla (statiniam režimui) ---------- */
  function lsGet(key, fallback){
    try {
      const v = localStorage.getItem(key);
      return v == null ? clone(fallback) : JSON.parse(v);
    } catch(e){ return clone(fallback); }
  }
  function lsSet(key, value){
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch(e){
      throw new Error('Naršyklės atmintis pilna — sumažink nuotraukų skaičių ar dydį.');
    }
  }
  function bumpVersion(){
    try { localStorage.setItem(KEYS.version, String(Date.now())); } catch(e){}
    catalogVersion = Number(localStorage.getItem(KEYS.version)) || catalogVersion;
  }

  /* ---------- katalogas (serveris, live / localStorage) ---------- */
  let productsCache = [];
  let catalogVersion = 0;
  const catalogListeners = new Set();
  function notifyCatalog(){ catalogListeners.forEach(fn => { try { fn(productsCache); } catch(e){} }); }
  function onCatalog(fn){ catalogListeners.add(fn); }
  function loadLocalCatalog(){
    productsCache = lsGet(KEYS.products, []);
    if(!Array.isArray(productsCache)) productsCache = [];
    catalogVersion = Number(lsGet(KEYS.version, 0)) || 0;
  }
  async function refreshProducts(silent){
    if(!STATIC_MODE){
      try {
        const r = await fetch('/api/products', { headers: { 'Accept': 'application/json' } });
        if(r.ok){
          const data = await r.json();
          if(Array.isArray(data.products)){
            const changed = data.version !== catalogVersion;
            productsCache = data.products;
            catalogVersion = data.version || catalogVersion;
            if(changed || !silent) notifyCatalog();
            return changed;
          }
        }
      } catch(e){ /* krentam į lokalų režimą */ }
    }
    const before = catalogVersion;
    loadLocalCatalog();
    if(before !== catalogVersion || !silent) notifyCatalog();
    return before !== catalogVersion;
  }
  function getProducts(){ return productsCache; }
  function findProduct(id){ return productsCache.find(p => Number(p.id) === Number(id)) || null; }

  let sseOn = false, pollTimer = null;
  function startPolling(){
    if(pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        if(STATIC_MODE){
          const v = Number(localStorage.getItem(KEYS.version)) || 0;
          if(v && v !== catalogVersion){ await refreshProducts(); getReputation().catch(()=>{}); }
        } else {
          const r = await fetch('/api/version');
          const d = await r.json();
          if(d.version && d.version !== catalogVersion){ refreshProducts().catch(()=>{}); getReputation().catch(()=>{}); }
        }
      } catch(e){}
    }, 8000);
  }
  function connectLive(){
    if(STATIC_MODE){
      // Katalogo sinchronizacija tarp to paties naršyklės tabų.
      try {
        window.addEventListener('storage', (e) => {
          if(e.key === KEYS.products || e.key === KEYS.version){
            refreshProducts(true).catch(()=>{});
          }
        });
      } catch(e){}
      startPolling();
      return;
    }
    try {
      const es = new EventSource('/api/events');
      es.addEventListener('products', () => refreshProducts().catch(()=>{}));
      es.addEventListener('drop', () => { dropCache = null; document.dispatchEvent(new CustomEvent('luxora:drop')); });
      es.addEventListener('reputation', () => getReputation().catch(()=>{}));
      es.onerror = () => { try { es.close(); } catch(e){} startPolling(); };
      es.onopen = () => { sseOn = true; refreshProducts(true).catch(()=>{}); };
    } catch(e){ startPolling(); }
    setTimeout(() => { if(!sseOn) startPolling(); }, 6000);
  }

  /* ---------- drop date (serveris / localStorage) ---------- */
  let dropCache = null;
  function defaultDropDate(){
    const now = new Date(); const target = new Date(now);
    const days = (5 - now.getDay() + 7) % 7;
    target.setDate(now.getDate() + (days === 0 && now.getHours() >= 20 ? 7 : days));
    target.setHours(20,0,0,0);
    return target;
  }
  async function getDropDate(){
    if(dropCache) return dropCache;
    if(!STATIC_MODE){
      try {
        const r = await fetch('/api/drop'); const d = await r.json();
        if(d.iso){ dropCache = new Date(d.iso); return dropCache; }
      } catch(e){}
    }
    try {
      const saved = localStorage.getItem(KEYS.dropFallback);
      const parsed = saved ? new Date(saved) : null;
      if(parsed && !Number.isNaN(parsed.getTime())) return parsed;
    } catch(e){}
    return defaultDropDate();
  }

  /* ---------- reputacija iš Discord (admin panelė + Worker) ---------- */
  const DEFAULT_DC_CHANNEL = '1458541073164013741';
  function getDiscordConfig(){
    let worker = '', token = '', channel = DEFAULT_DC_CHANNEL;
    try {
      worker = (localStorage.getItem(KEYS.dcWorker) || '').trim();
      token = (localStorage.getItem(KEYS.dcToken) || '').trim();
      channel = (localStorage.getItem(KEYS.dcChannel) || '').trim() || DEFAULT_DC_CHANNEL;
    } catch(e){}
    if(!worker) worker = REPUTATION_API_URL;
    return { worker, token, channel };
  }
  function saveDiscordConfig({ worker = '', token = '', channel = '' } = {}){
    try {
      localStorage.setItem(KEYS.dcWorker, String(worker == null ? '' : worker).trim());
      if(token) localStorage.setItem(KEYS.dcToken, String(token).trim());
      localStorage.setItem(KEYS.dcChannel, String(channel == null ? '' : channel).trim() || DEFAULT_DC_CHANNEL);
    } catch(e){ throw new Error('Nepavyko išsaugoti — naršyklės atmintis nepasiekiama.'); }
    repCache = null;
  }
  function clearDiscordToken(){ try { localStorage.removeItem(KEYS.dcToken); } catch(e){} repCache = null; }
  function readDcStatus(){
    try {
      const v = JSON.parse(localStorage.getItem(KEYS.dcStatus) || 'null');
      return v && typeof v === 'object' ? v : {};
    } catch(e){ return {}; }
  }
  function writeDcStatus(patch){
    try { localStorage.setItem(KEYS.dcStatus, JSON.stringify({ ...readDcStatus(), ...patch })); } catch(e){}
  }
  function getDiscordStatus(){
    const cfg = getDiscordConfig();
    const st = readDcStatus();
    return {
      workerSet: !!cfg.worker,
      tokenSet: !!cfg.token,
      channel: cfg.channel,
      lastCheck: st.lastCheck || 0,
      lastCount: typeof st.lastCount === 'number' ? st.lastCount : null,
      lastError: st.lastError || ''
    };
  }
  async function fetchReputation(url, extraHeaders){
    let ctrl = null, timer = null;
    try {
      if(typeof AbortController !== 'undefined'){
        ctrl = new AbortController();
        timer = setTimeout(() => { try { ctrl.abort(); } catch(e){} }, 15000);
      }
      const r = await fetch(url, { headers: { 'Accept': 'application/json', ...(extraHeaders || {}) }, ...(ctrl ? { signal: ctrl.signal } : {}) });
      const data = await r.json().catch(() => ({}));
      if(r.ok && data && typeof data.positive === 'number') return data;
      throw new Error((data && data.error) || `Reputacijos klaida: HTTP ${r.status}`);
    } finally { if(timer) clearTimeout(timer); }
  }
  let repCache = null;
  async function getReputation(){
    const cfg = getDiscordConfig();
    try {
      if(cfg.worker && cfg.token){
        // Pagrindinis kelias: tokenas iš admin panelės, užklausa per Worker.
        const endpoint = `${cfg.worker.replace(/\/+$/, '')}/?channel=${encodeURIComponent(cfg.channel)}`;
        const data = await fetchReputation(endpoint, { Authorization: `Bot ${cfg.token}` });
        repCache = data;
        writeDcStatus({ lastCheck: Date.now(), lastCount: data.positive, lastError: '' });
        try { document.dispatchEvent(new CustomEvent('luxora:rep')); } catch(e){}
        return repCache;
      }
      if(REPUTATION_API_URL){
        // Atsarginis kelias: tokenas Worker Secrets (savo serveris).
        const data = await fetchReputation(REPUTATION_API_URL);
        repCache = data;
        try { document.dispatchEvent(new CustomEvent('luxora:rep')); } catch(e){}
        return repCache;
      }
    } catch(e){
      writeDcStatus({ lastCheck: Date.now(), lastError: e.message || 'Nežinoma klaida' });
    }
    return repCache;
  }
  function readCart(){ try { const v = JSON.parse(localStorage.getItem(KEYS.cart) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
  function writeCart(c){ try { localStorage.setItem(KEYS.cart, JSON.stringify(c)); } catch(e){} document.dispatchEvent(new CustomEvent('luxora:cart')); }
  function addToCart(id, size, qty){
    qty = Math.max(1, Math.min(99, Number(qty) || 1));
    const cart = readCart();
    const ex = cart.find(i => Number(i.id) === Number(id) && String(i.size) === String(size));
    if(ex) ex.qty = Math.min(99, ex.qty + qty); else cart.unshift({ id: Number(id), size: String(size), qty });
    writeCart(cart);
  }
  function setQty(id, size, qty){
    let cart = readCart();
    qty = Number(qty) || 0;
    if(qty <= 0) cart = cart.filter(i => !(Number(i.id) === Number(id) && String(i.size) === String(size)));
    else cart.forEach(i => { if(Number(i.id) === Number(id) && String(i.size) === String(size)) i.qty = Math.min(99, qty); });
    writeCart(cart);
  }
  function clearCart(){ writeCart([]); }
  function cartDetailed(){
    return readCart().map(i => ({ ...i, product: findProduct(i.id) })).filter(i => i.product);
  }
  function cartCount(){ return readCart().reduce((n, i) => n + (Number(i.qty) || 0), 0); }
  function cartSubtotal(){
    return cartDetailed().reduce((n, i) => n + (Number(i.product.price) || 0) * (Number(i.qty) || 0), 0);
  }

  /* ---------- užsakymas (serveris / localStorage) ---------- */
  function localCreateOrder(payload){
    const items = Array.isArray(payload.items) ? payload.items : [];
    if(!items.length) throw new Error('Krepšelis tuščias');
    const products = lsGet(KEYS.products, []);
    let sub = 0;
    const lines = items.map(i => {
      const p = products.find(x => Number(x.id) === Number(i.id));
      if(!p) throw new Error('Prekė neberasta — atnaujink puslapį');
      const stock = Number(p.sizes?.[i.size] ?? NaN);
      if(!Number.isFinite(stock)) throw new Error(`Dydis "${i.size}" nebegalimas: ${p.name}`);
      const qty = Math.max(1, Math.min(99, Number(i.qty) || 1));
      if(stock < qty) throw new Error(`Liko tik ${stock} vnt.: ${p.name} (${i.size})`);
      p.sizes[i.size] = stock - qty;
      sub += (Number(p.price) || 0) * qty;
      return { id: p.id, name: p.name, size: String(i.size), qty, price: Number(p.price) || 0 };
    });
    const fee = (DELIVERY[payload.delivery] || DELIVERY.lpexpress).fee;
    const total = Math.round((sub + fee) * 100) / 100;
    const code = 'LX-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2,6).toUpperCase();
    const orders = lsGet(KEYS.orders, []);
    const order = {
      id: Date.now(), code, status: 'new', total, items: lines,
      name: payload.name || '', phone: payload.phone || '', email: payload.email || '',
      city: payload.city || '', address: payload.address || '',
      delivery: payload.delivery || 'lpexpress', payment: payload.payment || 'bank',
      created_at: Date.now()
    };
    orders.unshift(order);
    lsSet(KEYS.products, products);
    lsSet(KEYS.orders, orders);
    bumpVersion();
    productsCache = products;
    notifyCatalog();
    try { document.dispatchEvent(new CustomEvent('luxora:orders')); } catch(e){}
    return { code, total, id: order.id };
  }
  async function createOrder(payload){
    if(!STATIC_MODE){
      try {
        const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await r.json().catch(() => ({}));
        if(r.ok) return data;
        if(r.status < 500) throw new Error(data.error || 'užsakymas nepavyko');
      } catch(e){
        if(e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message)) throw e;
      }
    }
    return localCreateOrder(payload);
  }

  /* ---------- pokalbiai (lokalūs, kaip anksčiau) ---------- */
  function readJSON(key, fallback){ try { const v = JSON.parse(localStorage.getItem(key)); return v ?? clone(fallback); } catch { return clone(fallback); } }
  function chats(){ const v = readJSON(KEYS.chats, []); return Array.isArray(v) ? v : []; }
  function saveChats(v){ try { localStorage.setItem(KEYS.chats, JSON.stringify(v)); } catch(e){} }

  /* ---------- admin (serveris / localStorage) ---------- */
  function localAdminPw(){ try { return localStorage.getItem(KEYS.adminPw) || DEFAULT_ADMIN_PASSWORD; } catch(e){ return DEFAULT_ADMIN_PASSWORD; } }
  function localSessionOn(){ try { return sessionStorage.getItem(KEYS.adminSession) === '1'; } catch(e){ return false; } }
  function localSessionSet(on){ try { if(on) sessionStorage.setItem(KEYS.adminSession, '1'); else sessionStorage.removeItem(KEYS.adminSession); } catch(e){} }
  async function adminLogin(password){
    if(!STATIC_MODE){
      try {
        const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        const d = await r.json().catch(() => ({}));
        if(r.ok) return true;
        if(r.status < 500) throw new Error(d.error || 'prisijungti nepavyko');
      } catch(e){
        if(e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message)) throw e;
      }
    }
    if(String(password) === String(localAdminPw())){ localSessionSet(true); return true; }
    throw new Error('Neteisingas slaptažodis.');
  }
  async function adminMe(){
    if(!STATIC_MODE){
      try {
        const r = await fetch('/api/admin/me');
        if(r.ok) return true;
      } catch(e){}
    }
    return localSessionOn();
  }
  async function adminLogout(){ try { await fetch('/api/admin/logout', { method: 'POST' }); } catch(e){} localSessionSet(false); }
  function localApiAdmin(path, opts = {}){
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : null;
    const products = lsGet(KEYS.products, []);
    const orders = lsGet(KEYS.orders, []);
    const prodIdMatch = path.match(/^\/api\/admin\/products\/(\d+)$/);
    const orderIdMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if(path === '/api/admin/orders' && method === 'GET') return { orders };
    if(path === '/api/admin/products' && method === 'POST'){
      const maxId = products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
      const p = { ...body, id: maxId + 1 };
      products.unshift(p);
      lsSet(KEYS.products, products);
      bumpVersion(); productsCache = products; notifyCatalog();
      return { product: p };
    }
    if(prodIdMatch && (method === 'PUT' || method === 'DELETE')){
      const id = Number(prodIdMatch[1]);
      const idx = products.findIndex(x => Number(x.id) === id);
      if(idx < 0) throw new Error('Prekė nerasta');
      if(method === 'DELETE'){ products.splice(idx, 1); }
      else { products[idx] = { ...products[idx], ...body, id }; }
      lsSet(KEYS.products, products);
      bumpVersion(); productsCache = products; notifyCatalog();
      return { ok: true };
    }
    if(orderIdMatch && method === 'PATCH'){
      const id = Number(orderIdMatch[1]);
      const o = orders.find(x => Number(x.id) === id);
      if(!o) throw new Error('Užsakymas nerastas');
      o.status = body.status;
      lsSet(KEYS.orders, orders);
      try { document.dispatchEvent(new CustomEvent('luxora:orders')); } catch(e){}
      return { ok: true };
    }
    if(path === '/api/admin/drop' && method === 'PUT'){
      dropCache = null;
      try { localStorage.setItem(KEYS.dropFallback, String(body.iso)); } catch(e){}
      try { document.dispatchEvent(new CustomEvent('luxora:drop')); } catch(e){}
      return { ok: true };
    }
    if(path === '/api/admin/password' && method === 'PUT'){
      if(String(body.current) !== String(localAdminPw())) throw new Error('Dabartinis slaptažodis neteisingas.');
      if(!body.next || String(body.next).length < 4) throw new Error('Naujas slaptažodis per trumpas (min 4).');
      try { localStorage.setItem(KEYS.adminPw, String(body.next)); } catch(e){}
      return { ok: true };
    }
    throw new Error('serverio klaida');
  }
  async function apiAdmin(path, opts = {}){
    if(!STATIC_MODE){
      try {
        const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if(r.ok && ct.includes('application/json')){
          const d = await r.json().catch(() => ({}));
          return d;
        }
        if(r.status === 401) throw new Error('unauthorized');
        if(r.status < 500){
          const d = ct.includes('application/json') ? await r.json().catch(() => ({})) : {};
          throw new Error(d.error || 'serverio klaida');
        }
      } catch(e){
        if(e.message === 'unauthorized' || /^(Dabartinis|Naujas|Prekė|Užsakymas)/.test(e.message || '')) throw e;
      }
    } else {
      try {
        if(!(await localSessionOn())) throw new Error('unauthorized');
      } catch(e){ throw new Error('unauthorized'); }
    }
    if(!STATIC_MODE){
      try { if(!(await adminMe())) throw new Error('unauthorized'); } catch(e){ throw new Error('unauthorized'); }
    }
    return localApiAdmin(path, opts);
  }
  function fileToDataURL(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nepavyko perskaityti failo'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  async function uploadImages(files){
    const list = [...files].slice(0, 5);
    if(!STATIC_MODE){
      try {
        const fd = new FormData();
        list.forEach(f => fd.append('images', f));
        const r = await fetch('/api/admin/upload', { method: 'POST', body: fd });
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if(r.ok && ct.includes('application/json')){
          const d = await r.json().catch(() => ({}));
          if(Array.isArray(d.urls) && d.urls.length) return d.urls;
        }
        if(r.status === 401) throw new Error('unauthorized');
      } catch(e){
        if(e.message === 'unauthorized') throw e;
      }
    }
    // Statiniam režimui nuotraukos saugomos kaip dataURL tiesiai prekėje.
    const urls = [];
    for(const f of list){ urls.push(await fileToDataURL(f)); }
    return urls;
  }

  // Katalogo sinchronizacija tarp tabų (abiem režimais).
  try {
    window.addEventListener('storage', (e) => {
      if(e.key === KEYS.products || e.key === KEYS.version){
        const v = Number(localStorage.getItem(KEYS.version)) || 0;
        if(v !== catalogVersion){ refreshProducts(true).catch(()=>{}); }
      }
    });
  } catch(e){}

  window.LuxoraStore = {
    KEYS, DELIVERY, BANK, silhouettes,
    money, uid, escapeHTML, totalStock, productImages, productVisual, parseSizes, sizesToText,
    getProducts, findProduct, refreshProducts, onCatalog, connectLive,
    getDropDate, readCart, addToCart, setQty, clearCart, cartDetailed, cartCount, cartSubtotal,
    createOrder, chats, saveChats, adminLogin, adminMe, adminLogout, apiAdmin, uploadImages,
    getReputation, getDiscordConfig, saveDiscordConfig, clearDiscordToken, getDiscordStatus
  };
})();
