/* Luxora basic deterrent (ne tikra apsauga — kodas vis tiek siunčiamas naršyklei). */
(function(){try{console.clear();console.log('%cLuxora — sustok.','font-weight:bold')}catch(e){}
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();
if(e.key==='F12'||((e.ctrlKey||e.metaKey)&&e.shiftKey&&(k==='i'||k==='j'||k==='c'))||((e.ctrlKey||e.metaKey)&&k==='u')){e.preventDefault();e.stopPropagation();return false}},true)})();
const S = window.LuxoraStore;

const grid = document.querySelector('#productGrid');
const emptyState = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const sortSelect = document.querySelector('#sortSelect');
const categoryChips = document.querySelector('#categoryChips');
const productModal = document.querySelector('#productModal');
const modalContent = document.querySelector('#modalContent');
const toast = document.querySelector('#toast');
const cartDrawer = document.querySelector('#reservationDrawer');
const drawerOverlay = document.querySelector('#drawerOverlay');
const cartList = document.querySelector('#reservationList');
const cartCount = document.querySelector('#reservationCount');
const checkoutModal = document.querySelector('#checkoutModal');
const checkoutContent = document.querySelector('#checkoutContent');

let currentCategory = 'all';
let selectedSize = null;
let selectedQty = 1;
let activeProduct = null;
let checkoutDelivery = 'lpexpress';

function totalStock(p){ return S.totalStock(p); }

/* ---------- katalogas ---------- */
function renderProducts(){
  const products = S.getProducts();
  const q = searchInput.value.trim().toLowerCase();
  let items = products.filter(p =>
    (currentCategory === 'all' || p.category === currentCategory) &&
    `${p.name} ${p.category} ${p.badge || ''}`.toLowerCase().includes(q)
  );
  const sort = sortSelect.value;
  if(sort === 'low') items.sort((a,b)=>a.price-b.price);
  if(sort === 'high') items.sort((a,b)=>b.price-a.price);
  if(sort === 'stock') items.sort((a,b)=>totalStock(b)-totalStock(a));
  if(sort === 'featured') items.sort((a,b)=>(b.hot?1:0)-(a.hot?1:0));

  grid.innerHTML = items.map(p => `
    <article class="product-card" data-id="${p.id}">
      <div class="product-image" style="--product-bg:${S.escapeHTML(p.bg || '#1c211a')}">
        <span class="product-badge ${p.hot?'hot':''}">${S.escapeHTML(p.badge || 'IN STOCK')}</span>
        ${S.productVisual(p)}
      </div>
      <div class="product-info">
        <div class="product-meta"><span>${S.escapeHTML(p.category)}</span><span class="stock-pill">${totalStock(p)} vnt.</span></div>
        <h3>${S.escapeHTML(p.name)}</h3>
        <div class="product-bottom"><div class="price">${S.money(p.price)} <small>su PVM</small></div><button class="quick-btn" data-open="${p.id}">PIRKTI</button></div>
      </div>
    </article>`).join('');
  const catalogEmpty = products.length === 0;
  if(!items.length){
    emptyState.innerHTML = catalogEmpty
      ? '<span class="empty-kicker">DROP PREPARING</span><h3>Prekių dar nėra</h3><p>Naujas asortimentas ruošiamas. Sek kitą dropą — prekės čia atsiras automatiškai, be perkrovimo.</p>'
      : '<h3>Nieko neradome</h3><p>Pabandyk kitą paiešką arba kategoriją.</p>';
  }
  emptyState.classList.toggle('catalog-empty', catalogEmpty);
  emptyState.hidden = items.length !== 0;
  if(activeProduct){
    const fresh = S.findProduct(activeProduct.id);
    if(!fresh){ closeModal(); activeProduct = null; }
    else if(JSON.stringify(fresh.sizes) !== JSON.stringify(activeProduct.sizes)){ activeProduct = fresh; openProduct(fresh.id, true); }
  }
}

/* ---------- prekės langas ---------- */
function openProduct(id, keepOpen){
  activeProduct = S.findProduct(id);
  selectedSize = null; selectedQty = 1;
  if(!activeProduct) return;
  const images = activeProduct.images || [];
  const media = images.length ? `
    <div class="modal-media-wrap">
      <div class="modal-product-image" style="--product-bg:${S.escapeHTML(activeProduct.bg || '#1b2018')}">
        ${S.productVisual(activeProduct, images[0])}
      </div>
      ${images.length>1?`<div class="modal-thumbs">${images.map((src,i)=>`<button type="button" class="modal-thumb ${i===0?'active':''}" data-gallery-image="${i}"><img src="${S.escapeHTML(src)}" alt="${S.escapeHTML(activeProduct.name)} ${i+1}" loading="lazy"></button>`).join('')}</div>`:''}
    </div>` : `
    <div class="modal-media-wrap"><div class="modal-product-image" style="--product-bg:${S.escapeHTML(activeProduct.bg || '#1b2018')}">${S.productVisual(activeProduct)}</div></div>`;
  modalContent.innerHTML = `
    <div class="modal-product-grid">
      ${media}
      <div class="modal-product-info">
        <span class="category">${S.escapeHTML(activeProduct.category.toUpperCase())} / ${S.escapeHTML(activeProduct.badge || '')}</span>
        <h2 id="modalTitle">${S.escapeHTML(activeProduct.name)}</h2>
        <div class="modal-price">${S.money(activeProduct.price)}</div>
        <p class="modal-description">${S.escapeHTML(activeProduct.description || '')}</p>
        <div class="size-title"><span>PASIRINK DYDĮ</span><small>${totalStock(activeProduct)} vnt. likutis</small></div>
        <div class="size-grid">
          ${Object.entries(activeProduct.sizes || {}).map(([size,stock])=>`<button class="size-btn" data-size="${S.escapeHTML(size)}" ${Number(stock)===0?'disabled':''}>${S.escapeHTML(size)}${Number(stock)>0?` <small>(${Number(stock)})</small>`:''}</button>`).join('')}
        </div>
        <div class="qty-row"><span>KIEKIS</span><div class="qty-ctrl"><button type="button" data-qty="-1">−</button><b id="qtyVal">1</b><button type="button" data-qty="1">+</button></div></div>
        <div class="reserve-row">
          <button id="addToCartBtn">Į KREPŠELĮ</button>
        </div>
        <div class="modal-note">Gyvas likutis — jei prekę nupirks kitas, matysi iškart be perkrovimo.</div>
      </div>
    </div>`;
  if(!keepOpen || productModal.hidden){ productModal.hidden = false; document.body.classList.add('no-scroll'); }
}
function closeModal(){
  productModal.hidden = true;
  if(!cartDrawer.classList.contains('open') && checkoutModal.hidden) document.body.classList.remove('no-scroll');
}

/* ---------- krepšelis ---------- */
function renderCart(){
  cartCount.textContent = S.cartCount();
  const items = S.cartDetailed();
  if(!items.length){
    cartList.innerHTML = '<div class="drawer-empty"><b>Krepšelis tuščias</b><span>Išsirink prekę ir pridėk norimą dydį.</span></div>';
    return;
  }
  const noSync = [];
  cartList.innerHTML = items.map(i => {
    const p = i.product;
    const avail = Number(p.sizes?.[i.size] ?? 0);
    if(avail < i.qty) noSync.push(i);
    return `
    <div class="reservation-item">
      <div class="reservation-top"><h4>${S.escapeHTML(p.name)}</h4><b>${S.money(p.price * i.qty)}</b></div>
      <div class="reservation-meta"><span>Dydis: ${S.escapeHTML(i.size)}</span><span>${S.money(p.price)} / vnt.</span></div>
      ${avail < i.qty ? `<div class="reservation-timer">Liko tik <strong>${avail} vnt.</strong> — pakoreguok kiekį.</div>` : ''}
      <div class="cart-row-bottom">
        <div class="qty-ctrl small"><button data-cart-dec="${p.id}|${S.escapeHTML(i.size)}">−</button><b>${i.qty}</b><button data-cart-inc="${p.id}|${S.escapeHTML(i.size)}">+</button></div>
        <button class="reservation-remove" data-cart-remove="${p.id}|${S.escapeHTML(i.size)}">Pašalinti</button>
      </div>
    </div>`;
  }).join('') + `
    <div class="cart-summary"><span>Tarpinė suma</span><b>${S.money(S.cartSubtotal())}</b></div>
    <button class="btn btn-primary btn-full" id="goCheckout">Pirkti →</button>`;
  const btn = document.querySelector('#goCheckout');
  if(btn) btn.addEventListener('click', openCheckout);
}
function openDrawer(){ renderCart(); cartDrawer.classList.add('open'); cartDrawer.setAttribute('aria-hidden','false'); drawerOverlay.hidden = false; document.body.classList.add('no-scroll'); }
function closeDrawer(){
  cartDrawer.classList.remove('open'); cartDrawer.setAttribute('aria-hidden','true'); drawerOverlay.hidden = true;
  if(productModal.hidden && checkoutModal.hidden) document.body.classList.remove('no-scroll');
}

/* ---------- checkout (2 žingsniai: duomenys → apmokėjimas) ---------- */
let coDraft = { name: '', phone: '', email: '', city: '', address: '' };
function deliveryOptionsHTML(){
  return Object.entries(S.DELIVERY).map(([k, d]) => `
    <label class="pick-card ${checkoutDelivery===k?'active':''}"><input type="radio" name="delivery" value="${k}" ${checkoutDelivery===k?'checked':''} hidden>
      <b>${d.label}</b><span>${S.money(d.fee)}</span></label>`).join('');
}
function openCheckout(){
  const items = S.cartDetailed();
  if(!items.length){ showToast('Krepšelis tuščias'); return; }
  closeDrawer();
  renderCheckoutForm();
  checkoutModal.hidden = false; document.body.classList.add('no-scroll');
}
function readDraftFromForm(){
  coDraft = {
    name: checkoutContent.querySelector('#coName').value.trim(),
    phone: checkoutContent.querySelector('#coPhone').value.trim(),
    email: checkoutContent.querySelector('#coEmail').value.trim(),
    city: checkoutContent.querySelector('#coCity').value.trim(),
    address: checkoutContent.querySelector('#coAddress').value.trim()
  };
}
function draftError(){
  if(coDraft.name.length < 2) return 'Įvesk vardą ir pavardę';
  if(!/^\+?[0-9 ]{7,20}$/.test(coDraft.phone)) return 'Patikrink telefono numerį';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(coDraft.email)) return 'Patikrink el. paštą';
  if(coDraft.city.length < 2) return 'Įvesk miestą';
  if(coDraft.address.length < 3) return 'Įvesk paštomato adresą';
  return '';
}
function renderCheckoutForm(){
  const items = S.cartDetailed();
  const sub = S.cartSubtotal();
  const fee = S.DELIVERY[checkoutDelivery].fee;
  checkoutContent.innerHTML = `
    <h2 id="checkoutTitle">Užsakymas <small class="step-mark">1/2</small></h2>
    <div class="checkout-lines">${items.map(i=>`<div><span>${S.escapeHTML(i.product.name)} · ${S.escapeHTML(i.size)} × ${i.qty}</span><b>${S.money(i.product.price*i.qty)}</b></div>`).join('')}</div>
    <h3><span class="h-ico">▦</span> Pristatymas</h3>
    <div class="pick-label">PRISTATYMAS Į PAŠTOMATĄ</div>
    <div class="pick-grid three">${deliveryOptionsHTML()}</div>
    <div class="form-note">Siuntinys XS. Kaina — tiksliai tokia, kokią ima vežėjas.</div>
    <div class="form-grid two">
      <label>Miestas<input id="coCity" maxlength="60" placeholder="Miestas..." autocomplete="address-level2" value="${S.escapeHTML(coDraft.city)}"></label>
      <label class="wide">Paštomatas / adresas<input id="coAddress" maxlength="160" placeholder="...arba paštomato adresas, gatvė" value="${S.escapeHTML(coDraft.address)}"></label>
    </div>
    <div class="pick-label">GAVĖJAS</div>
    <div class="form-grid">
      <label class="wide">Vardas ir pavardė<input id="coName" maxlength="80" placeholder="Vardas ir pavardė" autocomplete="name" value="${S.escapeHTML(coDraft.name)}"></label>
      <label class="wide">Telefonas<input id="coPhone" maxlength="20" placeholder="Telefonas (+370...)" autocomplete="tel" value="${S.escapeHTML(coDraft.phone)}"></label>
      <label class="wide">El. paštas<input id="coEmail" maxlength="120" placeholder="El. paštas" autocomplete="email" value="${S.escapeHTML(coDraft.email)}"></label>
    </div>
    <div class="form-note">Telefonu gausi paštomato kodą iš vežėjo, el. paštu — užsakymo patvirtinimą.</div>
    <div class="checkout-total"><span>Prekės ${S.money(sub)} + siuntimas ${S.money(fee)}</span><b>Viso: ${S.money(sub+fee)}</b></div>
    <div class="checkout-actions"><button class="btn btn-ghost" id="checkoutBack">Atgal</button><button class="btn btn-primary" id="checkoutNext">Tęsti →</button></div>
    <div class="checkout-error" id="checkoutError" role="alert"></div>`;
  checkoutContent.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', () => { readDraftFromForm(); checkoutDelivery = r.value; renderCheckoutForm(); }));
  checkoutContent.querySelector('#checkoutBack').addEventListener('click', () => { readDraftFromForm(); closeCheckout(); openDrawer(); });
  checkoutContent.querySelector('#checkoutNext').addEventListener('click', () => {
    readDraftFromForm();
    const problem = draftError();
    if(problem){ checkoutContent.querySelector('#checkoutError').textContent = problem; return; }
    renderCheckoutConfirm();
  });
}
function bankBoxHTML(total, codeOrNull){
  return `
      <div class="pay-box"><b>▤ Bankinis pavedimas</b>
        <div class="pay-line"><span>Gavėjas</span><strong>PIJUS MATULAITIS</strong></div>
        <div class="pay-line"><span>Sąskaita</span><strong>LT777300010158788640</strong> ${copyBtn('LT777300010158788640','IBAN')}</div>
        <div class="pay-line"><span>Suma</span><strong>${S.money(total)}</strong></div>
        ${codeOrNull ? `<div class="pay-line"><span>Paskirtis</span><strong>${S.escapeHTML(codeOrNull)}</strong> ${copyBtn(codeOrNull,'kodą')}</div>
        <p>Prekės išsiunčiamos gavus apmokėjimą per 1–2 d. d.</p>` : `<p>Paskirtį (užsakymo kodą) gausi patvirtinus užsakymą.</p>`}</div>`;
}
function bindCopyButtons(){
  checkoutContent.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); showToast('Nukopijuota'); }
    catch(e){ showToast(b.dataset.copy); }
  }));
}
function renderCheckoutConfirm(){
  const items = S.cartDetailed();
  if(!items.length){ closeCheckout(); return; }
  const sub = S.cartSubtotal();
  const fee = S.DELIVERY[checkoutDelivery].fee;
  checkoutContent.innerHTML = `
    <h2 id="checkoutTitle">Apmokėjimas <small class="step-mark">2/2</small></h2>
    <div class="checkout-lines">${items.map(i=>`<div><span>${S.escapeHTML(i.product.name)} · ${S.escapeHTML(i.size)} × ${i.qty}</span><b>${S.money(i.product.price*i.qty)}</b></div>`).join('')}
      <div><span>Pristatymas — ${S.escapeHTML(S.DELIVERY[checkoutDelivery].label)} · ${S.escapeHTML(coDraft.city)}, ${S.escapeHTML(coDraft.address)}</span><b>${S.money(fee)}</b></div>
      <div><span><b>Iš viso</b></span><b>${S.money(sub+fee)}</b></div></div>
    ${bankBoxHTML(sub+fee, null)}
    <div class="checkout-actions"><button class="btn btn-ghost" id="confirmBack">Atgal</button><button class="btn btn-primary" id="checkoutSubmit">Patvirtinti užsakymą →</button></div>
    <div class="checkout-error" id="checkoutError" role="alert"></div>`;
  bindCopyButtons();
  checkoutContent.querySelector('#confirmBack').addEventListener('click', renderCheckoutForm);
  checkoutContent.querySelector('#checkoutSubmit').addEventListener('click', submitOrder);
}
async function submitOrder(){
  const err = checkoutContent.querySelector('#checkoutError');
  const btn = checkoutContent.querySelector('#checkoutSubmit');
  const payload = {
    items: S.readCart().map(i => ({ id: i.id, size: i.size, qty: i.qty })),
    name: coDraft.name, phone: coDraft.phone, email: coDraft.email,
    city: coDraft.city, address: coDraft.address,
    delivery: checkoutDelivery, payment: 'bank'
  };
  err.textContent = '';
  btn.disabled = true;
  try {
    const res = await S.createOrder(payload);
    S.clearCart(); renderCart();
    renderCheckoutSuccess(res, payload);
    S.refreshProducts().catch(()=>{});
  } catch(e){ err.textContent = e.message || 'Užsakymas nepavyko'; }
  finally { btn.disabled = false; }
}
function copyBtn(text, label){
  return `<button type="button" class="copy-btn" data-copy="${S.escapeHTML(text)}">Kopijuoti ${label}</button>`;
}
function renderCheckoutSuccess(res, payload){
  const fee = S.DELIVERY[payload.delivery].fee;
  const payHTML = `
      <div class="pay-box"><b>▤ Bankinis pavedimas</b>
        <div class="pay-line"><span>Gavėjas</span><strong>PIJUS MATULAITIS</strong></div>
        <div class="pay-line"><span>Sąskaita</span><strong>LT777300010158788640</strong> ${copyBtn('LT777300010158788640','IBAN')}</div>
        <div class="pay-line"><span>Suma</span><strong>${S.money(res.total)}</strong></div>
        <div class="pay-line"><span>Paskirtis</span><strong>${S.escapeHTML(res.code)}</strong> ${copyBtn(res.code,'kodą')}</div>
        <p>Prekės išsiunčiamos gavus apmokėjimą per 1–2 d. d.</p></div>`;
  checkoutContent.innerHTML = `
    <div class="success-hero"><span class="success-check">✓</span><h2>Užsakymas priimtas!</h2>
    <p>Užsakymo kodas: <strong class="order-code">${S.escapeHTML(res.code)}</strong></p></div>
    <div class="checkout-lines"><div><span>Pristatymas — ${S.escapeHTML(S.DELIVERY[payload.delivery].label)}</span><b>${S.money(fee)}</b></div>
    <div><span><b>Iš viso apmokėti</b></span><b>${S.money(res.total)}</b></div></div>
    ${payHTML}
    <div class="checkout-actions"><button class="btn btn-primary btn-full" id="checkoutDone">Grįžti į parduotuvę</button></div>`;
  checkoutContent.querySelector('#checkoutDone').addEventListener('click', closeCheckout);
  bindCopyButtons();
}
function closeCheckout(){ checkoutModal.hidden = true; if(productModal.hidden && !cartDrawer.classList.contains('open')) document.body.classList.remove('no-scroll'); }

let toastTimer;
function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove('show'),2600);
}

/* ---------- reputacija ---------- */
let repReviews = [], repIndex = 0, repTimer = null;
function renderRepSlide(){
  const slide = document.querySelector('#repSlide');
  if(!slide) return;
  if(!repReviews.length){ document.querySelector('#repCarousel').hidden = true; return; }
  document.querySelector('#repCarousel').hidden = false;
  repIndex = (repIndex + repReviews.length) % repReviews.length;
  const v = repReviews[repIndex];
  slide.innerHTML = `
    <img class="rep-avatar" src="${S.escapeHTML(v.avatar || '')}" alt="" loading="lazy" onerror="this.style.display='none'">
    <div class="rep-slide-body"><b>${S.escapeHTML(v.name || '?')}</b><p>${S.escapeHTML(v.text || '')}</p></div>`;
  const dots = document.querySelector('#repDots');
  if(dots) dots.innerHTML = repReviews.slice(0, 12).map((_, i) => `<i class="${i===repIndex % 12?'on':''}"></i>`).join('');
}
function repAuto(){
  clearInterval(repTimer);
  if(repReviews.length > 1) repTimer = setInterval(() => { repIndex++; renderRepSlide(); }, 6000);
}
async function renderReputation(){
  const el = document.querySelector('#repCount');
  if(!el) return;
  const rep = await S.getReputation();
  if(rep && typeof rep.positive === 'number'){
    el.textContent = rep.positive;
    if(Array.isArray(rep.reviews) && rep.reviews.length){ repReviews = rep.reviews; renderRepSlide(); repAuto(); }
    const upd = document.querySelector('#repUpdated');
    if(upd && rep.updated_at) upd.textContent = 'Atnaujinta: ' + new Intl.DateTimeFormat('lt-LT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(rep.updated_at));
  } else el.textContent = '—';
}
document.querySelector('#repPrev')?.addEventListener('click', () => { repIndex--; renderRepSlide(); repAuto(); });
document.querySelector('#repNext')?.addEventListener('click', () => { repIndex++; renderRepSlide(); repAuto(); });

/* ---------- drop laikmatis ---------- */
function formatDropLabel(date){
  return new Intl.DateTimeFormat('lt-LT',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(date);
}
async function updateDropCountdown(){
  const target = await S.getDropDate();
  const label = document.querySelector('#dropDateLabel');
  if(label) label.textContent = formatDropLabel(target);
  const diff = Math.max(0,target.getTime()-Date.now());
  const d=Math.floor(diff/86400000), h=Math.floor((diff%86400000)/3600000), m=Math.floor((diff%3600000)/60000), sec=Math.floor((diff%60000)/1000);
  document.querySelector('#days').textContent=String(d).padStart(2,'0');
  document.querySelector('#hours').textContent=String(h).padStart(2,'0');
  document.querySelector('#minutes').textContent=String(m).padStart(2,'0');
  document.querySelector('#seconds').textContent=String(sec).padStart(2,'0');
  const card = document.querySelector('.countdown-card>span');
  if(card) card.textContent = diff === 0 ? 'DROP LIVE' : 'NEXT DROP IN';
}

/* ---------- pirkėjų chat (lokalus) ---------- */
const chatLauncher = document.querySelector('#chatLauncher');
const buyerChat = document.querySelector('#buyerChat');
const closeBuyerChat = document.querySelector('#closeBuyerChat');
const buyerChatMessages = document.querySelector('#buyerChatMessages');
const buyerChatForm = document.querySelector('#buyerChatForm');
const buyerChatInput = document.querySelector('#buyerChatInput');
const buyerName = document.querySelector('#buyerName');
const buyerChatIntro = document.querySelector('#buyerChatIntro');
const chatUnread = document.querySelector('#chatUnread');
let buyerId = '';
try { buyerId = localStorage.getItem(S.KEYS.buyerId) || ''; } catch(e){}
let lastRenderedChatSignature = '';
function currentChat(){ if(!buyerId) return null; return S.chats().find(c=>c.id===buyerId) || null; }
function ensureBuyerChat(){
  let chats = S.chats();
  let chat = buyerId ? chats.find(c=>c.id===buyerId) : null;
  if(chat) return chat;
  const name = buyerName.value.trim();
  if(!name) return null;
  buyerId = S.uid('buyer');
  try { localStorage.setItem(S.KEYS.buyerId,buyerId); } catch(e){}
  chat = {id:buyerId,name,createdAt:Date.now(),lastActivity:Date.now(),lastReadBuyer:Date.now(),lastReadAdmin:0,messages:[]};
  chats.push(chat); S.saveChats(chats);
  return chat;
}
function renderBuyerChat(force=false){
  const chat = currentChat();
  if(chat){
    buyerChatIntro.hidden = true;
    const sig = JSON.stringify([chat.name,chat.messages?.length,chat.messages?.at(-1)?.id,chat.lastReadBuyer]);
    if(force || sig!==lastRenderedChatSignature){
      buyerChatMessages.innerHTML = chat.messages?.length ? chat.messages.map(m=>`
        <div class="chat-message ${m.sender==='admin'?'admin':'buyer'}">
          ${S.escapeHTML(m.text)}
          <small>${new Intl.DateTimeFormat('lt-LT',{hour:'2-digit',minute:'2-digit'}).format(new Date(m.time))}</small>
        </div>`).join('') : '<div class="chat-empty">Pokalbis pradėtas. Parašyk klausimą pardavėjui.</div>';
      buyerChatMessages.scrollTop = buyerChatMessages.scrollHeight;
      lastRenderedChatSignature = sig;
    }
  } else {
    buyerChatIntro.hidden = false;
    buyerChatMessages.innerHTML = '<div class="chat-empty">Įvesk vardą ir parašyk pirmą žinutę.</div>';
  }
  updateChatUnread();
}
function updateChatUnread(){
  const chat = currentChat();
  if(!chat){ chatUnread.hidden=true; return; }
  const unread = (chat.messages || []).filter(m=>m.sender==='admin' && Number(m.time)>Number(chat.lastReadBuyer||0)).length;
  chatUnread.hidden = unread===0;
  chatUnread.textContent = unread>9?'9+':String(unread);
}
function markBuyerChatRead(){
  if(!buyerId) return;
  const chats=S.chats(), chat=chats.find(c=>c.id===buyerId);
  if(!chat) return;
  chat.lastReadBuyer=Date.now(); S.saveChats(chats); updateChatUnread();
}
function openBuyerChat(){ buyerChat.classList.add('open'); buyerChat.setAttribute('aria-hidden','false'); renderBuyerChat(true); markBuyerChatRead(); setTimeout(()=>buyerChatInput.focus(),180); }
function closeBuyerChatPanel(){ buyerChat.classList.remove('open'); buyerChat.setAttribute('aria-hidden','true'); }
chatLauncher.addEventListener('click',()=>buyerChat.classList.contains('open')?closeBuyerChatPanel():openBuyerChat());
closeBuyerChat.addEventListener('click',closeBuyerChatPanel);
buyerChatForm.addEventListener('submit',e=>{
  e.preventDefault();
  const text=buyerChatInput.value.trim();
  if(!text) return;
  let chat=ensureBuyerChat();
  if(!chat){ showToast('Įvesk savo vardą'); buyerName.focus(); return; }
  const chats=S.chats(); chat=chats.find(c=>c.id===buyerId);
  chat.messages ||= [];
  chat.messages.push({id:S.uid('msg'),sender:'buyer',text,time:Date.now()});
  chat.lastActivity=Date.now(); chat.lastReadBuyer=Date.now();
  S.saveChats(chats); buyerChatInput.value=''; renderBuyerChat(true);
});

/* ---------- įvykiai ---------- */
categoryChips.addEventListener('click', e=>{
  const btn = e.target.closest('[data-category]'); if(!btn) return;
  currentCategory = btn.dataset.category;
  [...categoryChips.querySelectorAll('.chip')].forEach(c=>c.classList.toggle('active',c===btn));
  renderProducts();
});
searchInput.addEventListener('input',renderProducts);
sortSelect.addEventListener('change',renderProducts);
grid.addEventListener('click',e=>{
  const open = e.target.closest('[data-open]');
  const card = e.target.closest('.product-card');
  const id = open?.dataset.open || card?.dataset.id;
  if(id) openProduct(id);
});
productModal.addEventListener('click',e=>{
  if(e.target===productModal || e.target.closest('[data-close="productModal"]')) closeModal();
  const gallery=e.target.closest('[data-gallery-image]');
  if(gallery && activeProduct){
    const images=activeProduct.images||[], index=Number(gallery.dataset.galleryImage), src=images[index];
    const imageBox=productModal.querySelector('.modal-product-image');
    if(src && imageBox){ imageBox.innerHTML=S.productVisual(activeProduct,src); productModal.querySelectorAll('.modal-thumb').forEach(b=>b.classList.toggle('active',b===gallery)); }
  }
  const size=e.target.closest('[data-size]');
  if(size && !size.disabled){ selectedSize=size.dataset.size; productModal.querySelectorAll('.size-btn').forEach(b=>b.classList.toggle('active',b===size)); }
  const q=e.target.closest('[data-qty]');
  if(q){ selectedQty=Math.max(1,Math.min(99,selectedQty+Number(q.dataset.qty))); const qv=document.querySelector('#qtyVal'); if(qv) qv.textContent=selectedQty; }
  if(e.target.closest('#addToCartBtn')){
    if(!selectedSize){ showToast('Pirmiausia pasirink dydį'); return; }
    const avail = Number(activeProduct.sizes?.[selectedSize] ?? 0);
    if(avail < selectedQty){ showToast(`Liko tik ${avail} vnt.`); return; }
    S.addToCart(activeProduct.id, selectedSize, selectedQty);
    renderCart(); closeModal(); showToast('Pridėta į krepšelį'); openDrawer();
  }
});
document.querySelector('#openReservations').addEventListener('click',openDrawer);
document.querySelector('#closeReservations').addEventListener('click',closeDrawer);
drawerOverlay.addEventListener('click',closeDrawer);
cartList.addEventListener('click',e=>{
  const dec=e.target.closest('[data-cart-dec]'), inc=e.target.closest('[data-cart-inc]'), rem=e.target.closest('[data-cart-remove]');
  const parse = v => { const [id,size]=String(v).split('|'); return [Number(id),size]; };
  if(dec){ const [id,size]=parse(dec.dataset.cartDec); const cur=S.readCart().find(i=>Number(i.id)===id&&String(i.size)===size); S.setQty(id,size,(cur?cur.qty:1)-1); renderCart(); }
  if(inc){ const [id,size]=parse(inc.dataset.cartInc); const cur=S.readCart().find(i=>Number(i.id)===id&&String(i.size)===size); S.setQty(id,size,(cur?cur.qty:1)+1); renderCart(); }
  if(rem){ const [id,size]=parse(rem.dataset.cartRemove); S.setQty(id,size,0); renderCart(); showToast('Pašalinta iš krepšelio'); }
});
checkoutModal.addEventListener('click',e=>{
  if(e.target===checkoutModal || e.target.closest('[data-close="checkoutModal"]')) closeCheckout();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeModal(); closeDrawer(); closeCheckout(); closeBuyerChatPanel(); }
  if(e.key==='/' && document.activeElement?.tagName!=='INPUT' && document.activeElement?.tagName!=='TEXTAREA'){
    e.preventDefault(); searchInput.focus(); document.querySelector('#shop').scrollIntoView({behavior:'smooth'});
  }
});
document.querySelector('#searchFocusBtn').addEventListener('click',()=>{document.querySelector('#shop').scrollIntoView({behavior:'smooth'});setTimeout(()=>searchInput.focus(),500)});
document.querySelector('#scrollDrops').addEventListener('click',()=>document.querySelector('#drops').scrollIntoView({behavior:'smooth'}));
document.querySelector('#dropForm').addEventListener('submit',e=>{
  e.preventDefault();
  const email=document.querySelector('#dropEmail').value;
  document.querySelector('#dropMessage').textContent=`Drop priminimas užregistruotas: ${email}`;
  e.target.reset();
});
document.addEventListener('luxora:cart', renderCart);
document.addEventListener('luxora:drop', updateDropCountdown);
document.addEventListener('luxora:rep', renderReputation);
const whyChatBtn = document.getElementById('whyChatBtn');
if(whyChatBtn) whyChatBtn.addEventListener('click',()=>{ const l=document.getElementById('chatLauncher'); if(l) l.click(); });

window.addEventListener('mousemove',e=>{ const glow=document.querySelector('#cursorGlow'); if(glow){glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';} });
document.querySelector('#year').textContent=new Date().getFullYear();

/* ---------- startas ---------- */
S.onCatalog(renderProducts);
renderCart();
renderProducts();
renderReputation();
updateDropCountdown();
renderBuyerChat(true);
S.refreshProducts().then(()=>{ renderProducts(); renderCart(); }).catch(()=>{ showToast('Nepavyko užkrauti prekių — patikrink internetą'); });
S.connectLive();
setInterval(updateDropCountdown, 1000);
setInterval(()=>renderBuyerChat(false), 2000);
setInterval(()=>{ renderReputation(); }, 30000);
