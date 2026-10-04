/* Luxora basic deterrent (ne tikra apsauga — kodas vis tiek siunčiamas naršyklei). */
(function(){try{console.clear();console.log('%cLuxora — sustok.','font-weight:bold')}catch(e){}
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();
if(e.key==='F12'||((e.ctrlKey||e.metaKey)&&e.shiftKey&&(k==='i'||k==='j'||k==='c'))||((e.ctrlKey||e.metaKey)&&k==='u')){e.preventDefault();e.stopPropagation();return false}},true)})();
const S = window.LuxoraStore;

const loginScreen = document.querySelector('#loginScreen');
const adminShell = document.querySelector('#adminShell');
const loginForm = document.querySelector('#loginForm');
const adminPassword = document.querySelector('#adminPassword');
const loginError = document.querySelector('#loginError');
const adminToast = document.querySelector('#adminToast');
let activeView = 'overview';
let selectedChatId = null;
let toastTimer;

function toast(text){
  adminToast.textContent=text; adminToast.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>adminToast.classList.remove('show'),2200);
}
function showAdmin(){ loginScreen.hidden=true; adminShell.hidden=false; renderAll(); }
function logout(){ S.adminLogout().finally(()=>{ adminShell.hidden=true; loginScreen.hidden=false; adminPassword.value=''; }); }
async function boot(){
  try { if(await S.adminMe()){ showAdmin(); return; } } catch(e){}
  loginScreen.hidden=false; adminShell.hidden=true;
}
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn = loginForm.querySelector('button[type="submit"]');
  if(btn) btn.disabled = true;
  loginError.textContent='';
  try { await S.adminLogin(adminPassword.value); adminPassword.value=''; showAdmin(); }
  catch(err){ loginError.textContent = err.message === 'unauthorized' ? 'Sesija baigėsi.' : (err.message || 'Neteisingas slaptažodis.'); adminPassword.select(); }
  finally { if(btn) btn.disabled = false; }
});
document.querySelector('#logoutBtn').addEventListener('click',logout);
async function guard(fn){
  try { await fn(); }
  catch(err){ if(err.message === 'unauthorized'){ adminShell.hidden=true; loginScreen.hidden=false; loginError.textContent='Sesija baigėsi — prisijunk iš naujo.'; } else toast(err.message || 'Klaida'); }
}

const viewMeta={
  overview:['DASHBOARD','Apžvalga'], products:['CATALOG','Prekės'], messages:['INBOX','Žinutės'],
  reservations:['ORDERS','Užsakymai'], drop:['DROP SYSTEM','Kitas dropas'], discord:['DISCORD','Atsiliepimai iš Discord']
};
function switchView(view){
  activeView=view;
  document.querySelectorAll('.admin-view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
  document.querySelectorAll('#adminNav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.querySelector('#viewEyebrow').textContent=viewMeta[view][0];
  document.querySelector('#viewTitle').textContent=viewMeta[view][1];
  if(view==='messages') renderMessages(true);
  if(view==='products') renderProductTable();
  if(view==='reservations') renderOrders();
  if(view==='drop') syncDropInput();
  if(view==='discord') loadDiscordForm();
}
document.querySelector('#adminNav').addEventListener('click',e=>{ const b=e.target.closest('[data-view]'); if(b) switchView(b.dataset.view); });
document.addEventListener('click',e=>{ const b=e.target.closest('[data-goto]'); if(b) switchView(b.dataset.goto); });

/* ---------- duomenys (serveris) ---------- */
let adminProducts = [];
let adminOrders = [];
async function loadProducts(){ adminProducts = S.getProducts(); }
async function loadOrders(){ const d = await S.apiAdmin('/api/admin/orders'); adminOrders = d.orders || []; }

function totalStock(p){ return S.totalStock(p); }
function formatTime(ts){ return new Intl.DateTimeFormat('lt-LT',{hour:'2-digit',minute:'2-digit'}).format(new Date(ts)); }
function formatDateTime(ts){ return new Intl.DateTimeFormat('lt-LT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ts)); }
function relativeTime(ts){
  const diff=Math.max(0,Date.now()-Number(ts));
  if(diff<60000)return 'dabar'; if(diff<3600000)return `${Math.floor(diff/60000)} min`;
  if(diff<86400000)return `${Math.floor(diff/3600000)} val.`; return `${Math.floor(diff/86400000)} d.`;
}

/* ---------- chat (lokalus, kaip anksčiau) ---------- */
function unreadForChat(chat){ return (chat.messages||[]).filter(m=>m.sender==='buyer'&&Number(m.time)>Number(chat.lastReadAdmin||0)).length; }
function totalUnread(){ return S.chats().reduce((n,c)=>n+unreadForChat(c),0); }

function renderMetrics(){
  const stock=adminProducts.reduce((n,p)=>n+totalStock(p),0), unread=totalUnread();
  const fresh = adminOrders.filter(o=>o.status==='new').length;
  document.querySelector('#metricProducts').textContent=adminProducts.length;
  document.querySelector('#metricStock').textContent=stock;
  document.querySelector('#metricReservations').textContent=fresh;
  document.querySelector('#navProductCount').textContent=adminProducts.length;
  document.querySelector('#navReservationCount').textContent=fresh;
  const navUnread=document.querySelector('#navUnread'); navUnread.hidden=unread===0; navUnread.textContent=unread>99?'99+':unread;
}

function renderOverviewChats(){
  const chats=S.chats().sort((a,b)=>Number(b.lastActivity||0)-Number(a.lastActivity||0)).slice(0,4);
  const box=document.querySelector('#overviewChats');
  if(!chats.length){box.innerHTML='<div class="empty-mini">Pokalbių dar nėra.</div>';return;}
  box.innerHTML=chats.map(c=>{
    const last=(c.messages||[]).at(-1); return `<button class="mini-chat" data-open-chat="${S.escapeHTML(c.id)}">
      <span class="mini-avatar">${S.escapeHTML((c.name||'?')[0].toUpperCase())}</span>
      <span class="mini-chat-copy"><b>${S.escapeHTML(c.name||'Pirkėjas')}</b><span>${last?S.escapeHTML(last.text):'Pokalbis be žinučių'}</span></span>
      <small>${last?relativeTime(last.time):''}</small></button>`;
  }).join('');
}
document.querySelector('#overviewChats').addEventListener('click',e=>{ const b=e.target.closest('[data-open-chat]'); if(b){selectedChatId=b.dataset.openChat;switchView('messages');} });

function renderLowStock(){
  const items=adminProducts.slice().sort((a,b)=>totalStock(a)-totalStock(b)).slice(0,6);
  const box=document.querySelector('#lowStockList');
  box.innerHTML=items.map(p=>`<div class="low-stock-item"><b>${S.escapeHTML(p.name)}</b><span>${S.escapeHTML(p.category)} <strong>${totalStock(p)} vnt.</strong></span></div>`).join('') || '<div class="empty-mini">Prekių nėra.</div>';
}

/* ---------- prekės ---------- */
const productEditor=document.querySelector('#productEditor'), productForm=document.querySelector('#productForm');
const productImageInput=document.querySelector('#productImages');
const productImagePreviews=document.querySelector('#productImagePreviews');
const imageDropzone=document.querySelector('#imageDropzone');
let editorImages=[];
let imageProcessing=false;

function productThumb(p){
  const image=(p.images||[])[0];
  if(image) return `<img src="${S.escapeHTML(image)}" alt="" loading="lazy">`;
  return S.silhouettes[p.type] || S.silhouettes.tee;
}
function renderProductTable(){
  const q=(document.querySelector('#adminProductSearch').value||'').trim().toLowerCase();
  const items=adminProducts.filter(p=>`${p.name} ${p.category} ${p.badge}`.toLowerCase().includes(q));
  const body=document.querySelector('#productTableBody');
  if(!items.length){
    body.innerHTML=`<tr><td colspan="6"><div class="catalog-empty-admin">
      <span>EMPTY CATALOG</span><b>${q?'Nieko nerasta':'Dar nėra įkeltų prekių'}</b>
      <p>${q?'Pakeisk paiešką ir bandyk dar kartą.':'Pradėk nuo pirmos prekės — ji iškart atsiras visose parduotuvėse be perkrovimo.'}</p>
      ${q?'':'<button type="button" data-empty-add-product>+ Įkelti pirmą prekę</button>'}
    </div></td></tr>`;
    return;
  }
  body.innerHTML=items.map(p=>{
    const stock=totalStock(p), cls=stock===0?'stock-empty':stock<=2?'stock-low':'stock-good';
    const photos=(p.images||[]).length;
    return `<tr>
      <td><div class="product-main-cell"><span class="product-thumb">${productThumb(p)}</span><span><b>${S.escapeHTML(p.name)}</b><span>#${p.id} · ${photos} foto · ${S.escapeHTML(S.sizesToText(p.sizes))}</span></span></div></td>
      <td>${S.escapeHTML(p.category)}</td><td>${S.money(p.price)}</td><td class="${cls}">${stock} vnt.</td><td>${S.escapeHTML(p.badge||'—')}</td>
      <td><div class="table-actions"><button data-edit-product="${p.id}">Redaguoti</button><button class="delete" data-delete-product="${p.id}">Ištrinti</button></div></td>
    </tr>`;
  }).join('');
}
function renderEditorImages(){
  productImagePreviews.innerHTML=editorImages.map((src,index)=>`<div class="image-preview-card ${index===0?'cover':''}" data-image-index="${index}">
    <img src="${S.escapeHTML(src)}" alt="Prekės nuotrauka ${index+1}">
    <div class="image-preview-top"><span>${index===0?'PAGRINDINĖ':`#${index+1}`}</span><button type="button" data-remove-image="${index}" aria-label="Pašalinti">×</button></div>
    ${index===0?'':'<button type="button" class="set-cover" data-set-cover="'+index+'">Nustatyti pagrindine</button>'}
  </div>`).join('');
  imageDropzone.classList.toggle('has-limit',editorImages.length>=5);
  const copy=imageDropzone.querySelector('.image-dropzone-copy span');
  if(copy) copy.textContent=editorImages.length>=5?'Pasiektas 5 nuotraukų limitas.':`Įkelta ${editorImages.length}/5 · gali pridėti dar ${5-editorImages.length}`;
}
function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Nepavyko perskaityti failo'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Netinkamas paveikslėlis'));
      img.onload=()=>resolve(img);
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function compressImage(file){
  if(!file.type.startsWith('image/')) throw new Error('Pasirink paveikslėlio failą');
  if(file.size>12*1024*1024) throw new Error('Viena nuotrauka negali viršyti 12 MB');
  const img=await fileToImage(file);
  const max=1100, ratio=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const w=Math.max(1,Math.round((img.naturalWidth||img.width)*ratio));
  const h=Math.max(1,Math.round((img.naturalHeight||img.height)*ratio));
  const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:true}); ctx.drawImage(img,0,0,w,h);
  let data=canvas.toDataURL('image/webp',.76);
  if(data.startsWith('data:image/webp') && data.length>700000) data=canvas.toDataURL('image/webp',.58);
  if(!data.startsWith('data:image/webp')) data=canvas.toDataURL('image/jpeg',.76);
  return data;
}
function dataURLtoFile(dataURL, name){
  const [head, b64] = dataURL.split(',');
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
async function handleProductFiles(fileList){
  if(imageProcessing) return;
  const files=[...fileList];
  if(!files.length) return;
  const remaining=5-editorImages.length;
  if(remaining<=0){toast('Galima daugiausia 5 nuotraukas');return;}
  if(files.length>remaining) toast(`Pridėtos tik ${remaining} nuotraukos — limitas 5`);
  imageProcessing=true; imageDropzone.classList.add('processing');
  try{
    const compressed=[];
    for(const file of files.slice(0,remaining)){
      try{ compressed.push(await compressImage(file)); }
      catch(err){ toast(err.message||'Nepavyko įkelti nuotraukos'); }
    }
    if(compressed.length){
      toast('Keliama į serverį...');
      const urls = await S.uploadImages(compressed.map((d,i)=>dataURLtoFile(d,`photo${i}.jpg`)));
      editorImages.push(...urls); renderEditorImages();
    }
  }catch(err){ toast(err.message||'Nepavyko įkelti'); }
  finally{ imageProcessing=false; imageDropzone.classList.remove('processing'); productImageInput.value=''; }
}
function openProductEditor(id=null){
  const p=id?adminProducts.find(x=>Number(x.id)===Number(id)):null;
  document.querySelector('#productEditorTitle').textContent=p?'Redaguoti prekę':'Nauja prekė';
  document.querySelector('#productId').value=p?.id||'';
  document.querySelector('#productName').value=p?.name||'';
  document.querySelector('#productCategory').value=p?.category||'Sneakers';
  document.querySelector('#productPrice').value=p?.price??'';
  document.querySelector('#productBadge').value=p?.badge||'NEW';
  document.querySelector('#productType').value=p?.type||'shoe';
  document.querySelector('#productSizes').value=p?S.sizesToText(p.sizes):'';
  document.querySelector('#productBg').value=p?.bg||'#20261b';
  document.querySelector('#productHot').checked=!!p?.hot;
  document.querySelector('#productDescription').value=p?.description||'';
  editorImages=p?[...(p.images||[])]:[];
  renderEditorImages();
  productEditor.hidden=false; document.body.style.overflow='hidden'; setTimeout(()=>document.querySelector('#productName').focus(),80);
}
function closeProductEditor(){ productEditor.hidden=true; document.body.style.overflow=''; editorImages=[]; productImageInput.value=''; }
document.querySelector('#addProductBtn').addEventListener('click',()=>openProductEditor());
document.querySelector('#quickAddProduct').addEventListener('click',()=>openProductEditor());
document.querySelector('#closeProductEditor').addEventListener('click',closeProductEditor);
document.querySelector('#cancelProductEditor').addEventListener('click',closeProductEditor);
productEditor.addEventListener('click',e=>{if(e.target===productEditor)closeProductEditor();});
document.querySelector('#adminProductSearch').addEventListener('input',renderProductTable);
productImageInput.addEventListener('change',e=>handleProductFiles(e.target.files));
['dragenter','dragover'].forEach(type=>imageDropzone.addEventListener(type,e=>{e.preventDefault();imageDropzone.classList.add('dragging')}));
['dragleave','drop'].forEach(type=>imageDropzone.addEventListener(type,e=>{e.preventDefault();imageDropzone.classList.remove('dragging')}));
imageDropzone.addEventListener('drop',e=>handleProductFiles(e.dataTransfer.files));
productImagePreviews.addEventListener('click',e=>{
  const remove=e.target.closest('[data-remove-image]');
  if(remove){editorImages.splice(Number(remove.dataset.removeImage),1);renderEditorImages();return;}
  const cover=e.target.closest('[data-set-cover]');
  if(cover){const i=Number(cover.dataset.setCover);const [img]=editorImages.splice(i,1);editorImages.unshift(img);renderEditorImages();}
});
document.querySelector('#productTableBody').addEventListener('click',e=>{
  if(e.target.closest('[data-empty-add-product]')){openProductEditor();return;}
  const edit=e.target.closest('[data-edit-product]'); if(edit){openProductEditor(edit.dataset.editProduct);return;}
  const del=e.target.closest('[data-delete-product]');
  if(del){
    const id=Number(del.dataset.deleteProduct), p=adminProducts.find(x=>Number(x.id)===id); if(!p)return;
    if(confirm(`Ištrinti „${p.name}"? Prekė išnyks visose parduotuvėse iškart.`)){
      guard(async ()=>{ await S.apiAdmin(`/api/admin/products/${id}`,{method:'DELETE'}); await S.refreshProducts(); toast('Prekė ištrinta'); renderAll(); });
    }
  }
});
productForm.addEventListener('submit',e=>{
  e.preventDefault();
  guard(async ()=>{
    if(imageProcessing){toast('Palauk, kol nuotraukos bus paruoštos');return;}
    const sizes=S.parseSizes(document.querySelector('#productSizes').value);
    if(!Object.keys(sizes).length){toast('Įvesk bent vieną dydį ir likutį');return;}
    if(!editorImages.length){toast('Įkelk bent 1 prekės nuotrauką');return;}
    if(editorImages.length>5){toast('Galima daugiausia 5 nuotraukas');return;}
    const rawId=document.querySelector('#productId').value;
    const body={
      name:document.querySelector('#productName').value.trim(),category:document.querySelector('#productCategory').value,
      price:Number(document.querySelector('#productPrice').value),badge:document.querySelector('#productBadge').value.trim()||'IN STOCK',
      hot:document.querySelector('#productHot').checked,bg:document.querySelector('#productBg').value,type:document.querySelector('#productType').value,
      images:editorImages.slice(0,5),description:document.querySelector('#productDescription').value.trim(),sizes
    };
    if(rawId) await S.apiAdmin(`/api/admin/products/${Number(rawId)}`,{method:'PUT',body:JSON.stringify(body)});
    else await S.apiAdmin('/api/admin/products',{method:'POST',body:JSON.stringify(body)});
    await S.refreshProducts();
    closeProductEditor(); toast(rawId?'Prekė atnaujinta — matoma visur iškart':'Prekė pridėta — matoma visur iškart'); renderAll();
  });
});

/* ---------- užsakymai ---------- */
const STATUS_LT = { new: 'Naujas', paid: 'Apmokėtas', sent: 'Išsiųstas', cancelled: 'Atšauktas' };
function renderOrders(){
  const box=document.querySelector('#adminReservations');
  if(!adminOrders.length){box.innerHTML='<div class="reservation-empty">Užsakymų dar nėra.</div>';return;}
  box.innerHTML=adminOrders.map(o=>`
    <div class="admin-order status-${o.status}">
      <div class="admin-order-head"><b>${S.escapeHTML(o.code)}</b><span class="order-status">${STATUS_LT[o.status]||o.status}</span><strong>${S.money(o.total)}</strong></div>
      <div class="admin-order-lines">${(o.items||[]).map(i=>`<span>${S.escapeHTML(i.name)} · ${S.escapeHTML(i.size)} × ${i.qty} — ${S.money(i.price*i.qty)}</span>`).join('')}</div>
      <div class="admin-order-meta"><span>${S.escapeHTML(o.name)} · ${S.escapeHTML(o.phone)} · ${S.escapeHTML(o.email)}</span>
      <span>${S.escapeHTML(o.city)}, ${S.escapeHTML(o.address)}</span>
      <span>${o.delivery==='lpexpress'?'LP Express':o.delivery==='omniva'?'Omniva':'DPD'} · ${o.payment==='bank'?'Bankinis':'PayPal'} · ${formatDateTime(o.created_at)}</span></div>
      <div class="table-actions">
        ${o.status==='new'?`<button data-order-status="${o.id}|paid">Apmokėtas</button>`:''}
        ${o.status!=='sent'&&o.status!=='cancelled'?`<button data-order-status="${o.id}|sent">Išsiųstas</button>`:''}
        ${o.status!=='cancelled'?`<button class="delete" data-order-status="${o.id}|cancelled">Atšaukti</button>`:''}
      </div>
    </div>`).join('');
}
document.querySelector('#adminReservations').addEventListener('click',e=>{
  const b=e.target.closest('[data-order-status]'); if(!b)return;
  const [id,status]=String(b.dataset.orderStatus).split('|');
  guard(async ()=>{ await S.apiAdmin(`/api/admin/orders/${Number(id)}`,{method:'PATCH',body:JSON.stringify({status})}); await loadOrders(); renderAll(); toast('Statusas atnaujintas'); });
});
document.querySelector('#clearExpiredBtn').addEventListener('click',()=>guard(async ()=>{ await loadOrders(); await S.refreshProducts(); renderAll(); toast('Atnaujinta'); }));

/* ---------- pokalbiai ---------- */
function renderConversationList(){
  const chats=S.chats().sort((a,b)=>Number(b.lastActivity||0)-Number(a.lastActivity||0));
  document.querySelector('#conversationCount').textContent=chats.length;
  const list=document.querySelector('#conversationList');
  if(!chats.length){ list.innerHTML='<div class="empty-mini">Dar nėra pirkėjų žinučių.</div>'; return; }
  if(selectedChatId && !chats.some(c=>c.id===selectedChatId)) selectedChatId=null;
  list.innerHTML=chats.map(c=>{
    const last=(c.messages||[]).at(-1), unread=unreadForChat(c);
    return `<button class="conversation-item ${c.id===selectedChatId?'active':''}" data-chat-id="${S.escapeHTML(c.id)}">
      <span class="avatar">${S.escapeHTML((c.name||'?')[0].toUpperCase())}</span>
      <span class="conversation-copy"><b>${S.escapeHTML(c.name||'Pirkėjas')}</b><p>${last?S.escapeHTML(last.text):'Pokalbis pradėtas'}</p></span>
      <span class="conversation-side"><small>${last?relativeTime(last.time):''}</small>${unread?'<i></i>':''}</span>
    </button>`;
  }).join('');
}
function markAdminRead(id){
  const chats=S.chats(), c=chats.find(x=>x.id===id); if(!c)return; c.lastReadAdmin=Date.now(); S.saveChats(chats);
}
function renderActiveChat(markRead=false){
  const chats=S.chats(), chat=chats.find(c=>c.id===selectedChatId);
  const empty=document.querySelector('#adminChatEmpty'), content=document.querySelector('#adminChatContent');
  if(!chat){ empty.hidden=false; content.hidden=true; return; }
  if(markRead){ chat.lastReadAdmin=Date.now(); S.saveChats(chats); }
  empty.hidden=true; content.hidden=false;
  document.querySelector('#chatBuyerInitial').textContent=(chat.name||'?')[0].toUpperCase();
  document.querySelector('#chatBuyerName').textContent=chat.name||'Pirkėjas';
  document.querySelector('#chatBuyerMeta').textContent=`Pokalbis pradėtas ${formatDateTime(chat.createdAt)}`;
  const msgs=document.querySelector('#adminChatMessages');
  msgs.innerHTML=(chat.messages||[]).map(m=>`<div class="admin-message ${m.sender==='admin'?'admin':'buyer'}">${S.escapeHTML(m.text)}<small>${formatTime(m.time)}</small></div>`).join('') || '<div class="admin-chat-empty"><span>Žinučių dar nėra.</span></div>';
  msgs.scrollTop=msgs.scrollHeight;
}
function renderMessages(markRead=false){ renderConversationList(); renderActiveChat(markRead); renderMetrics(); }
document.querySelector('#conversationList').addEventListener('click',e=>{ const b=e.target.closest('[data-chat-id]'); if(!b)return; selectedChatId=b.dataset.chatId; renderMessages(true); });
document.querySelector('#adminChatForm').addEventListener('submit',e=>{
  e.preventDefault(); const input=document.querySelector('#adminChatInput'), text=input.value.trim(); if(!text||!selectedChatId)return;
  const chats=S.chats(), chat=chats.find(c=>c.id===selectedChatId); if(!chat)return;
  chat.messages ||= []; chat.messages.push({id:S.uid('msg'),sender:'admin',text,time:Date.now()}); chat.lastActivity=Date.now(); chat.lastReadAdmin=Date.now();
  S.saveChats(chats); input.value=''; renderMessages(false); renderOverviewChats();
});
document.querySelector('#deleteConversation').addEventListener('click',()=>{
  if(!selectedChatId)return; const chat=S.chats().find(c=>c.id===selectedChatId); if(!chat)return;
  if(confirm(`Ištrinti pokalbį su ${chat.name}?`)){ S.saveChats(S.chats().filter(c=>c.id!==selectedChatId)); selectedChatId=null; renderMessages(); renderMetrics(); renderOverviewChats(); toast('Pokalbis ištrintas'); }
});

/* ---------- drop ---------- */
function toLocalInput(date){
  const d=new Date(date), pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function syncDropInput(){
  const d = await S.getDropDate().catch(()=>new Date());
  document.querySelector('#dropDateInput').value=toLocalInput(d);
}
async function renderDropTimer(){
  const target=await S.getDropDate().catch(()=>new Date());
  const diff=Math.max(0,target-Date.now());
  const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
  [['adminDays',d],['adminHours',h],['adminMinutes',m],['adminSeconds',s],['dropDays',d],['dropHours',h],['dropMinutes',m],['dropSeconds',s]].forEach(([id,v])=>{const el=document.querySelector('#'+id);if(el)el.textContent=String(v).padStart(2,'0')});
  const label=new Intl.DateTimeFormat('lt-LT',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(target);
  document.querySelector('#adminDropLabel').textContent=label; document.querySelector('#dropPreviewDate').textContent=label;
  document.querySelector('#dropPreviewTitle').textContent=diff===0?'Dropas vyksta dabar':'Kitas dropas';
}
document.querySelector('#dropSettingsForm').addEventListener('submit',e=>{
  e.preventDefault();
  guard(async ()=>{
    const raw=document.querySelector('#dropDateInput').value; if(!raw)return;
    await S.apiAdmin('/api/admin/drop',{method:'PUT',body:JSON.stringify({iso:new Date(raw).toISOString()})});
    document.querySelector('#dropSaveMessage').textContent='Dropo laikas išsaugotas — matomas visur iškart.'; renderDropTimer(); toast('Dropas atnaujintas');
  });
});

/* ---------- discord reputacija ---------- */
function localDcToken(){
  try { return localStorage.getItem(S.KEYS.dcToken) || ''; } catch(e){ return ''; }
}
function loadDiscordForm(){
  const cfg = S.getDiscordConfig();
  const w = document.querySelector('#dcWorkerUrl');
  const t = document.querySelector('#dcBotToken');
  const c = document.querySelector('#dcChannelId');
  if(!w || !t || !c) return;
  w.value = cfg.worker || '';
  t.value = localDcToken();
  c.value = cfg.channel || '';
  renderDiscordStatus();
}
function renderDiscordStatus(){
  const line = document.querySelector('#dcStatusLine');
  const count = document.querySelector('#dcRepCount');
  if(!line || !count) return;
  const st = S.getDiscordStatus();
  count.textContent = st.lastCount == null ? '—' : String(st.lastCount);
  const parts = [];
  if(!st.workerSet) parts.push('Nėra Worker URL.');
  if(!st.tokenSet) parts.push('Neįvestas bot tokenas.');
  if(st.lastError) parts.push('Klaida: ' + st.lastError);
  if(st.lastCheck) parts.push('Tikrinta: ' + new Intl.DateTimeFormat('lt-LT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(st.lastCheck)));
  line.textContent = parts.length ? parts.join(' ') : 'Veikia — kanalas tikrinamas kas 30 s.';
}
document.querySelector('#discordSettingsForm').addEventListener('submit',e=>{
  e.preventDefault();
  guard(async ()=>{
    const tokenInput = document.querySelector('#dcBotToken').value.trim();
    const prev = S.getDiscordConfig();
    S.saveDiscordConfig({
      worker: document.querySelector('#dcWorkerUrl').value,
      token: tokenInput || prev.token,
      channel: document.querySelector('#dcChannelId').value
    });
    document.querySelector('#dcSaveMessage').textContent = 'Išsaugota. Tikrinama...';
    await S.getReputation();
    renderDiscordStatus();
    document.querySelector('#dcSaveMessage').textContent = 'Išsaugota.';
    toast('Discord nustatymai išsaugoti');
  });
});
document.querySelector('#discordTestBtn').addEventListener('click',()=>guard(async ()=>{
  await S.getReputation();
  renderDiscordStatus();
  toast('Patikrinta');
}));
document.querySelector('#discordForgetBtn').addEventListener('click',()=>{
  S.clearDiscordToken();
  const t = document.querySelector('#dcBotToken');
  if(t) t.value = '';
  renderDiscordStatus();
  toast('Tokenas ištrintas iš naršyklės');
});

document.querySelector('#passwordForm').addEventListener('submit',e=>{
  e.preventDefault();
  guard(async ()=>{
    const cur=document.querySelector('#pwCurrent').value;
    const next=document.querySelector('#pwNext').value;
    const next2=document.querySelector('#pwNext2').value;
    const msg=document.querySelector('#pwMessage');
    msg.textContent='';
    if(next!==next2){ msg.textContent='Nauji slaptažodžiai nesutampa.'; return; }
    await S.apiAdmin('/api/admin/password',{method:'PUT',body:JSON.stringify({current:cur,next})});
    e.target.reset();
    msg.textContent='Slaptažodis pakeistas.';
    toast('Slaptažodis pakeistas');
  });
});

function renderAll(){
  renderMetrics(); renderOverviewChats(); renderLowStock(); renderProductTable(); renderConversationList();
  if(activeView==='messages') renderActiveChat(false); renderOrders(); renderDropTimer(); syncDropInput(); renderDiscordStatus();
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!productEditor.hidden)closeProductEditor();});

/* ---------- startas ---------- */
S.onCatalog(async ()=>{ adminProducts = S.getProducts(); if(!adminShell.hidden) renderAll(); });
boot().then(async ()=>{
  try { await S.refreshProducts(); adminProducts = S.getProducts(); } catch(e){}
  try { if(await S.adminMe()) await loadOrders(); } catch(e){}
  if(!adminShell.hidden) renderAll();
  renderDropTimer(); syncDropInput();
});
try {
  const es = new EventSource('/api/events');
  es.addEventListener('orders', async ()=>{ try { if(await S.adminMe()){ await loadOrders(); if(!adminShell.hidden) renderAll(); } } catch(e){} });
  es.onerror = ()=>{ try{es.close();}catch(e){} };
} catch(e){}
setInterval(()=>{ if(!adminShell.hidden){ renderDropTimer(); if(activeView==='messages'){renderConversationList();renderActiveChat(false);} else {renderMetrics();renderOverviewChats();} if(activeView==='discord'){renderDiscordStatus();} } },5000);
