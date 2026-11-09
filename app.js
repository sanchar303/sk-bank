'use strict';
firebase.initializeApp({apiKey:"AIzaSyDpCAXfhldRc1nCZDWlWNRbcMFjqAh8uPc",authDomain:"cloud-db-studio.firebaseapp.com",databaseURL:"https://cloud-db-studio-default-rtdb.firebaseio.com",projectId:"cloud-db-studio",storageBucket:"cloud-db-studio.firebasestorage.app",messagingSenderId:"343326148662",appId:"1:343326148662:web:987738ccc8f9d6a8253097"});
const bank=firebase.database().ref('sk-bank'),pick=selector=>document.querySelector(selector),pickAll=selector=>[...document.querySelectorAll(selector)];
const roundCents=n=>Math.round((+n+Number.EPSILON)*100)/100;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatMoney=n=>'$'+(+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const formatDate=t=>new Date(t).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
const formatShortDate=t=>new Date(t).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const state={network:{},username:null,user:null,vault:{reserve:0,tax:0,minted:0,apr:3,sales:2,xfer:.5,wage:5,loanApr:8},users:{},transactions:[],ledger:[],notes:[],cart:[],merchant:null,allMerchants:{},txIndex:{},txFilter:'all',noteFilter:'all',search:'',pendingPayment:null,managedUser:null,selectedTx:null,savingsMode:'deposit',serverOffset:0},listeners=[];
const ico=name=>`<svg class="i"><use href="#i-${name}"/></svg>`;
const typeLabels={transfer:'Transfer',merchant:'Payment',interest:'Interest',wage:'Wage',savings:'Savings',credit:'Credit',debit:'Debit',mint:'Mint'};
const filterTypes={all:null,transfer:['transfer','credit','debit'],merchant:['merchant'],earn:['interest','wage'],savings:['savings']};
const liveListIds=new Set(['dial','recent','hist','nList','catalog','cart','uList','mReq','ledger','bSave','pItems','netList','requestList','loanBody','salesStats','salesList','econTiles','econBar','loanQueue','loanBook']);
{const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{get:d.get,set(v){if(liveListIds.has(this.id)&&this.__h===v)return;this.__h=v;d.set.call(this,v)},configurable:true})}
let toastTimer;
function showToast(m,t='info'){if(t==='success')haptic('success');else if(t==='error')haptic('error');const e=pick('#toast');e.className='toast '+t;e.textContent=m;void e.offsetWidth;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),2200)}
const toggleModal=(id,open=true)=>pick('#'+id).classList.toggle('open',open);
const subscribe=(ref,handler)=>{ref.on('value',handler);listeners.push(ref)};
const adjustBalance=(p,d,min=0)=>bank.child(p).transaction(v=>{const n=Math.round(((+v||0)+d)*1e8)/1e8;return n<min?undefined:n}).then(x=>{const m=p.match(/^users\/([^/]+)\/(main|savings)$/);if(x.committed&&m)bank.child('network/'+m[1]+'/nw').transaction(v=>Math.round(((+v||0)+d)*1e8)/1e8);return x.committed});
async function hashPassword(u,p){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('skb|'+u+'|'+p));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const randomCode=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(6));return[...r].map(x=>a[x%a.length]).join('')};
const pushNotification=(u,cat,title,msg)=>bank.child('notes/'+u).push({ts:Date.now(),cat,title,msg,read:false});
function recordTransaction(t){
  const id='TX'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase(),entry={id,ts:Date.now(),tax:0,note:'',...t},parties=entry.p||[];
  delete entry.p;
  const updates={['ledger/'+id]:entry};
  parties.forEach(party=>updates['userTx/'+party+'/'+id]=entry);
  Object.entries(statsDelta(entry)).forEach(([key,value])=>updates['stats/'+key]=increment(value));
  return bank.update(updates);
}
function statsDelta(tx){
  const delta={},add=(key,value)=>{if(value)delta[key]=(delta[key]||0)+value};
  if(tx.type==='transfer'||tx.type==='merchant'){add('txCount',1);add('volume',tx.amt)}
  add('taxCollected',tx.type==='refund'?-tx.tax:tx.tax);
  if(tx.type==='wage')add('wagesPaid',tx.amt);
  if(tx.type==='fine'||tx.type==='fee')add('finesCollected',tx.amt);
  if(tx.type==='loan')add('loansIssued',tx.amt);
  if(tx.type==='repayment')add('loansRepaid',tx.amt);
  return delta;
}
function animateNumber(el,to){const from=+el.dataset.v||0;el.dataset.v=to;if(from===to){el.textContent=formatMoney(to);return}const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/500);el.textContent=formatMoney(from+(to-from)*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)}
const setInputValue=(id,v)=>{const e=pick('#'+id);if(e&&document.activeElement!==e)e.value=v};
const setText=(id,v)=>{const e=pick('#'+id);if(e&&e.textContent!==v)e.textContent=v};
const isFrozen=()=>state.user.frozen?(showToast('Account frozen','error'),true):false;

function showView(id){pickAll('#app .view').forEach(v=>v.classList.toggle('on',v.id===id));pickAll('.nav [data-v]').forEach(n=>n.classList.toggle('on',n.dataset.v===id));scrollTo(0,0);if(id==='notes')readNotes()}

function beginSession(u,h){localStorage.setItem('skb',JSON.stringify({u,h}));state.username=u;pick('#auth').classList.remove('on');pick('#app').classList.remove('hide');showView('home');
subscribe(bank.child('users/'+u),s=>{const v=s.val();if(!v||v.ph!==h)return actions.logout();state.user=v;renderUser();renderPreferences();adminSync();accrueInterest()});
subscribe(bank.child('userTx/'+u).limitToLast(150),s=>{state.transactions=Object.values(s.val()||{}).sort((a,b)=>b.ts-a.ts);renderTx()});
subscribe(bank.child('notes/'+u).limitToLast(100),s=>{const o=s.val()||{};state.notes=Object.entries(o).map(([k,v])=>({k,...v})).sort((a,b)=>b.ts-a.ts);renderNotes()});
subscribe(bank.child('merchants/'+u),s=>{state.merchant=s.val();renderMerchant()});
subscribe(bank.child('userRequests/'+u).limitToLast(60),s=>{state.requests=Object.values(s.val()||{}).sort((a,b)=>b.ts-a.ts);renderRequests()});
subscribe(bank.child('userLoans/'+u),s=>{state.loans=Object.values(s.val()||{}).sort((a,b)=>b.ts-a.ts);renderLoans()});
subscribe(bank.child('network'),s=>{state.network=s.val()||{};renderNet();syncNetworkEntry()});
}
const actions={
mode:t=>pick('#auth').dataset.mode=t.dataset.v,
async login(){const u=pick('#lu').value.trim().toLowerCase(),p=pick('#lp').value;if(!u||!p)return showToast('Enter username and password','error');const [s,h]=await Promise.all([bank.child('users/'+u).once('value'),hashPassword(u,p)]);if(!s.val()||s.val().ph!==h)return showToast('Invalid username or password','error');beginSession(u,h)},
async reg(){const u=pick('#ru').value.trim().toLowerCase(),p=pick('#rp').value;if(!/^[a-z0-9_]{3,20}$/.test(u))return showToast('Username: 3–20 letters, numbers or _','error');if(p.length<6)return showToast('Password needs 6+ characters','error');
const o={u,name:pick('#rn').value.trim()||u,addr:pick('#ra').value.trim(),main:0,savings:0,role:u==='admin'?'admin':'user',createdAt:Date.now(),ph:await hashPassword(u,p)};o.lastInterest=o.createdAt;
if(!(await bank.child('users/'+u).transaction(v=>v?undefined:o)).committed)return showToast('Username unavailable','error');pushNotification(u,'system','Account opened','Your account is ready.');beginSession(u,o.ph)},
logout(){listeners.forEach(r=>r.off());listeners.length=0;(state.adminRefs||[]).forEach(r=>r.off());state.adminRefs=[];state.adminActive=false;localStorage.removeItem('skb');Object.assign(state,{username:null,user:null,users:{},transactions:[],notes:[],cart:[],merchant:null,requests:[],loans:[],allLoans:{},stats:{}});pickAll('.modal').forEach(m=>m.classList.remove('open'));pick('#app').classList.add('hide');pick('#auth').classList.add('on');pick('#lp').value='';pick('#rp').value=''},
go:t=>showView(t.dataset.v),
async refresh(t){t.classList.add('spin');const s=await bank.child('users/'+state.username).once('value');if(s.val()){state.user=s.val();renderUser()}setTimeout(()=>t.classList.remove('spin'),600);showToast('Updated','success')},
close:t=>{const m=t.closest('.modal');m.classList.remove('open');if(m.id==='pin'&&state.pinResolver)closePin(null);if(m.id==='scan')stopScanner();if(m.id==='qr'){if(state.stopVoucherWatch){state.stopVoucherWatch();state.stopVoucherWatch=null}if(state.activeVoucher){bank.child('invoices/'+state.activeVoucher).transaction(v=>v&&v.st==='open'?null:v);state.activeVoucher=null}}},
sendOpen:()=>{toggleModal('send')},
dial:t=>{pick('#sTo').value=t.dataset.u;toggleModal('send')},
async send(){if(isFrozen())return;const to=pick('#sTo').value.trim().toLowerCase().replace(/^@/,''),amt=roundCents(pick('#sAmt').value);if(!to||!(amt>0))return showToast('Enter recipient and amount','error');
if(await transferMoney(to,amt,pick('#sNote').value.trim())){toggleModal('send',false);['#sTo','#sAmt','#sNote'].forEach(x=>pick(x).value='');showToast('Sent '+formatMoney(amt),'success')}},
sv:t=>{state.savingsMode=t.dataset.m;pick('#svTitle').textContent=state.savingsMode==='deposit'?'Deposit':'Withdraw';toggleModal('save')},
async saveGo(){const amt=roundCents(pick('#svAmt').value),d=state.savingsMode==='deposit';if(!(amt>0))return showToast('Enter amount','error');if(isFrozen())return;
await accrueInterest();await bank.child('users/'+state.username+'/lastInterest').set(Date.now());if(!await adjustBalance('users/'+state.username+'/'+(d?'main':'savings'),-amt))return showToast('Insufficient balance','error');await adjustBalance('users/'+state.username+'/'+(d?'savings':'main'),amt);
await recordTransaction({type:'savings',from:state.username,to:state.username,fromName:state.user.name,toName:'Savings Vault',amt,net:amt,note:d?'Deposit to Savings':'Withdrawal from Savings',p:[state.username]});toggleModal('save',false);pick('#svAmt').value='';showToast(d?'Deposited':'Withdrawn','success')},
tx:t=>{const x=state.txIndex[t.dataset.id];if(!x)return;state.selectedTx=x;const me=state.username;
setText('rId',x.id);setText('rTime',formatDate(x.ts));setText('rFrom',`${x.fromName||x.from} (@${x.from})`);setText('rTo',`${x.toName||x.to} (@${x.to})`);setText('rType',typeLabels[x.type]||x.type);setText('rAmt',formatMoney(x.amt));setText('rTax',formatMoney(x.tax));setText('rNet',formatMoney(x.net??x.amt));setText('rNote',x.note||'—');
pick('#rFav').classList.toggle('hide',!(x.type==='transfer'&&x.from===me));pick('#rRefund').classList.toggle('hide',!(x.type==='merchant'&&x.to===me&&!x.refunded));pick('#rStatusRow').classList.toggle('hide',!x.refunded);toggleModal('rec')},
async fav(){const x=state.selectedTx;if(!x)return;const f=state.user.fav||[];if(f.includes(x.to)){toggleModal('rec',false);return showToast('Already saved','info')}await bank.child('users/'+state.username+'/fav').set([...f,x.to]);toggleModal('rec',false);showToast('Added to speed dial','success')},
unfav:(t,e)=>{e.stopPropagation();bank.child('users/'+state.username+'/fav').set((state.user.fav||[]).filter(x=>x!==t.dataset.u))},
tf:t=>{state.txFilter=t.dataset.f;pickAll('.tf').forEach(x=>x.classList.toggle('on',x===t));renderTx()},
nf:t=>{state.noteFilter=t.dataset.f;pickAll('.nfb').forEach(x=>x.classList.toggle('on',x===t));renderNotes()},

async profile(){const u={name:pick('#pName').value.trim()||state.username,addr:pick('#pAddr').value.trim()},p=pick('#pPass').value;if(p){if(p.length<6)return showToast('Password needs 6+ characters','error');u.ph=await hashPassword(state.username,p);localStorage.setItem('skb',JSON.stringify({u:state.username,h:u.ph}))}
await bank.child('users/'+state.username).update(u);pick('#pPass').value='';showToast('Saved','success')},
async apply(){const b=pick('#mBiz').value.trim(),c=pick('#mCat').value.trim();if(!b||!c)return showToast('Enter business name and sector','error');await bank.child('merchants/'+state.username).set({status:'pending',biz:b,cat:c,ts:Date.now()});showToast('Submitted','success')},
itemOpen:()=>toggleModal('item'),
async itemSave(){const n=pick('#iName').value.trim(),p=roundCents(pick('#iPrice').value);if(!n||!(p>0))return showToast('Enter name and price','error');const id='i'+Date.now().toString(36);await bank.child('merchants/'+state.username+'/items/'+id).set({id,n,p});toggleModal('item',false);pick('#iName').value='';pick('#iPrice').value='';showToast('Saved','success')},
itemDel:t=>bank.child('merchants/'+state.username+'/items/'+t.dataset.id).remove(),
add(t){const i=state.merchant.items[t.dataset.id],c=state.cart.find(x=>x.id===i.id);c?c.q++:state.cart.push({id:i.id,n:i.n,p:i.p,q:1});renderCart()},
cartDel:t=>{state.cart.splice(+t.dataset.i,1);renderCart()},
cartClear:()=>{state.cart=[];renderCart()},
async qr(){if(!state.cart.length)return showToast('Cart is empty','error');const sub=roundCents(state.cart.reduce((a,i)=>a+i.p*i.q,0)),tax=roundCents(sub*state.vault.sales/100),tot=roundCents(sub+tax);
for(let i=0;i<6;i++){const c=randomCode(),inv={m:state.username,biz:state.merchant.biz,items:state.cart.map(({n,p,q})=>({n,p,q})),sub,tax,tot,ts:Date.now()+(state.serverOffset||0),st:'open'};
if((await bank.child('invoices/'+c).transaction(v=>v?undefined:inv)).committed){const q=pick('#qrBox');q.innerHTML='';new QRCode(q,{text:c,width:190,height:190,colorDark:'#06214f',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.H});setText('qrCode',c);setText('qrTot',formatMoney(tot));pick('#qr').classList.remove('paid');setText('qrSt','Awaiting payment');toggleModal('qr');
const ref=bank.child('invoices/'+c);state.activeVoucher=c;const h=ref.on('value',s=>{const v=s.val();if(!v){ref.off('value',h);state.stopVoucherWatch=null;state.activeVoucher=null;pick('#qr').classList.add('paid');setText('qrSt','Paid');state.cart=[];renderCart();showToast('Payment received','success')}else if(v.st==='paid')setText('qrSt','Processing')});state.stopVoucherWatch=()=>ref.off('value',h);return}}showToast('Could not create code','error')},
scan(){toggleModal('scan');pick('#scCode').value='';pick('#scInfo').classList.add('hide');try{state.scanner=state.scanner||new Html5Qrcode('reader');state.scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:200,height:200}},x=>{stopScanner();loadInvoice(x)},()=>{}).catch(()=>{})}catch(e){}},
loadCode:()=>loadInvoice(pick('#scCode').value),
async pay(){const p=state.pendingPayment;if(!p||isFrozen())return;if(p.m===state.username)return showToast('Cannot pay yourself','error');
const ref=bank.child('invoices/'+p.c),keep=ref.on('value',()=>{});let ok=false;try{await ref.once('value');ok=(await ref.transaction(v=>v&&v.st==='open'?{...v,st:'paid',by:state.username}:undefined)).committed}finally{ref.off('value',keep)}if(!ok)return showToast('Code expired or used','error');
if(!await adjustBalance('users/'+state.username+'/main',-p.tot)){await bank.child('invoices/'+p.c+'/st').set('open');return showToast('Insufficient balance','error')}
await adjustBalance('users/'+p.m+'/main',p.sub);await adjustBalance('vault/tax',p.tax);
await recordTransaction({type:'merchant',from:state.username,to:p.m,fromName:state.user.name,toName:p.biz,amt:p.tot,tax:p.tax,net:p.sub,note:'Checkout',code:p.c,items:(p.items||[]).map(item=>({n:item.n,p:item.p,q:item.q})),p:[state.username,p.m]});
pushNotification(state.username,'merchant','Payment sent',`${formatMoney(p.tot)} to ${p.biz}`);pushNotification(p.m,'merchant','Sale received',`${formatMoney(p.sub)} from @${state.username}`);await bank.child('invoices/'+p.c).remove();state.pendingPayment=null;toggleModal('scan',false);stopScanner();showToast('Paid '+formatMoney(p.tot),'success')},
async mint(){const a=roundCents(pick('#aAmt').value);if(!(a>0))return showToast('Enter amount','error');await adjustBalance('vault/reserve',a);await adjustBalance('vault/minted',a);await recordTransaction({type:'mint',from:'SK Bank',to:'Reserve',fromName:'Mint',toName:'Reserve',amt:a,net:a,note:'Issuance',p:[]});pick('#aAmt').value='';showToast('Issued '+formatMoney(a),'success')},
async burn(){const a=roundCents(pick('#aAmt').value);if(!(a>0))return showToast('Enter amount','error');if(!await adjustBalance('vault/reserve',-a))return showToast('Exceeds reserve','error');await adjustBalance('vault/minted',-a);await recordTransaction({type:'mint',from:'Reserve',to:'SK Bank',fromName:'Reserve',toName:'Burn',amt:a,net:a,note:'Retirement',p:[]});pick('#aAmt').value='';showToast('Retired '+formatMoney(a),'success')},
async sweep(){const t=state.vault.tax;if(!(t>0))return showToast('Nothing to move','info');if(await adjustBalance('vault/tax',-t)){await adjustBalance('vault/reserve',t);showToast('Moved '+formatMoney(t),'success')}},
async rates(){const v={apr:+pick('#rApr').value,sales:+pick('#rSales').value,xfer:+pick('#rXfer').value,wage:+pick('#rWage').value,loanApr:+pick('#rLoan').value};if(Object.values(v).some(x=>isNaN(x)||x<0||x>100))return showToast('Rates must be 0–100','error');await bank.child('vault').update(v);showToast('Saved','success')},
async approve(t){await bank.child('merchants/'+t.dataset.u+'/status').set('approved');pushNotification(t.dataset.u,'merchant','Merchant approved','Your business is active.');showToast('Approved','success')},
async reject(t){await bank.child('merchants/'+t.dataset.u).remove();pushNotification(t.dataset.u,'merchant','Application declined','Your application was not approved.');showToast('Declined','info')},
async broadcast(){const m=pick('#bMsg').value.trim();if(!m)return;const u={};Object.keys(state.users).forEach(x=>{u['notes/'+x+'/n'+Date.now().toString(36)]={ts:Date.now(),cat:'system',title:'Announcement',msg:m,read:false}});await bank.update(u);pick('#bMsg').value='';showToast('Sent','success')},
mgr(t){const u=state.users[t.dataset.u];if(!u)return;state.managedUser=u.u;pick('#mgBody').innerHTML=`<div class="mh"><div class="av">${escapeHtml(u.u[0].toUpperCase())}</div><div><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.u)} · ${formatMoney(u.main)} · Savings ${formatMoney(u.savings)}</small></div></div>
<label class="fld"><span>Amount</span><input id="mgAmt" type="number" inputmode="decimal" min="0" step="0.01"></label>
<div class="two"><div class="btn secondary" data-act="mgFund">Credit</div><div class="btn outline" data-act="mgTake">Debit</div></div><div class="sep"></div>
<div class="two"><label class="fld"><span>Role</span><input id="mgT" placeholder="Teller" value="${escapeHtml(u.job?.title||'')}"></label><label class="fld"><span>Sector</span><input id="mgS" placeholder="Retail Banking" value="${escapeHtml(u.job?.sector||'')}"></label></div>
<label class="fld"><span>Wage</span><input id="mgW" placeholder="1850.00" type="number" inputmode="decimal" min="0" step="0.01" value="${u.job?.salary||''}"></label>
<div class="two"><div class="btn secondary" data-act="mgJob">Assign</div><div class="btn primary" data-act="mgPay">Pay Wage</div></div><div class="sep"></div>
<label class="fld"><span>Message</span><input id="mgM" placeholder="Your wage has been processed"></label>
<div class="two"><div class="btn outline" data-act="mgMsg">Send</div><div class="btn outline" data-act="mgFreeze">${u.frozen?'Unfreeze':'Freeze'}</div></div>
<div class="two"><div class="btn outline" data-act="mgFire">Remove Role</div><div class="btn outline" data-act="mgMerch">Revoke Merchant</div></div>
<div class="sep"></div>
<label class="fld"><span>Fine / Fee</span><input id="mgReason" placeholder="Overdue loan repayment"></label>
<div class="two"><div class="btn outline" data-act="mgCharge" data-kind="fine">Issue Fine</div><div class="btn outline" data-act="mgCharge" data-kind="fee">Charge Fee</div></div>
<div class="btn outline mt" data-act="mgResetPin">Reset PIN</div>
<div class="btn danger" data-act="mgRole">${u.role==='admin'?'Demote to User':'Promote to Admin'}</div>`;toggleModal('mg')},
async mgFund(){const a=roundCents(pick('#mgAmt').value),u=state.users[state.managedUser];if(!(a>0))return showToast('Enter amount','error');if(!await adjustBalance('vault/reserve',-a))return showToast('Exceeds reserve','error');await adjustBalance('users/'+u.u+'/main',a);await recordTransaction({type:'credit',from:'SK Bank',to:u.u,fromName:'SK Bank',toName:u.name,amt:a,net:a,note:'Bank credit',p:[u.u]});pushNotification(u.u,'earnings','Account credited',formatMoney(a));toggleModal('mg',false);showToast('Credited','success')},
async mgTake(){const a=roundCents(pick('#mgAmt').value),u=state.users[state.managedUser];if(!(a>0))return showToast('Enter amount','error');if(!await adjustBalance('users/'+u.u+'/main',-a))return showToast('Exceeds balance','error');await adjustBalance('vault/reserve',a);await recordTransaction({type:'debit',from:u.u,to:'SK Bank',fromName:u.name,toName:'SK Bank',amt:a,net:a,note:'Bank debit',p:[u.u]});pushNotification(u.u,'system','Account debited',formatMoney(a));toggleModal('mg',false);showToast('Debited','success')},
async mgJob(){const t=pick('#mgT').value.trim(),s=pick('#mgS').value.trim(),w=roundCents(pick('#mgW').value);if(!t||!(w>=0))return showToast('Enter role and wage','error');await bank.child('users/'+state.managedUser+'/job').set({title:t,sector:s,salary:w});bank.child('network/'+state.managedUser+'/job').set({title:t,sector:s});pushNotification(state.managedUser,'system','Role assigned',`${t} · ${formatMoney(w)} wage`);toggleModal('mg',false);showToast('Assigned','success')},
async mgPay(){const u=state.users[state.managedUser];if(!u.job?.salary)return showToast('No wage set','error');const g=u.job.salary,tax=roundCents(g*state.vault.wage/100),net=roundCents(g-tax);if(!await adjustBalance('vault/reserve',-g))return showToast('Exceeds reserve','error');await adjustBalance('users/'+u.u+'/main',net);if(tax)await adjustBalance('vault/tax',tax);
await recordTransaction({type:'wage',from:'SK Bank',to:u.u,fromName:u.job.title,toName:u.name,amt:g,tax,net,note:u.job.title,p:[u.u]});pushNotification(u.u,'earnings','Wage paid',formatMoney(net)+' net');toggleModal('mg',false);showToast('Wage paid','success')},
async mgMsg(){const m=pick('#mgM').value.trim();if(!m)return;await pushNotification(state.managedUser,'system','Message',m);pick('#mgM').value='';showToast('Sent','success')},
async mgFreeze(){if(state.managedUser===state.username)return showToast('Not your own account','error');const f=!state.users[state.managedUser].frozen;await bank.child('users/'+state.managedUser+'/frozen').set(f||null);toggleModal('mg',false);showToast(f?'Frozen':'Unfrozen','info')},
async mgFire(){await bank.child('users/'+state.managedUser+'/job').remove();bank.child('network/'+state.managedUser+'/job').remove();toggleModal('mg',false);showToast('Removed','info')},
async mgMerch(){await bank.child('merchants/'+state.managedUser).remove();toggleModal('mg',false);showToast('Revoked','info')},
async mgRole(){if(state.managedUser===state.username)return showToast('Not your own account','error');if(state.managedUser==='admin')return showToast('Primary admin is protected','error');const u=state.users[state.managedUser];if(!u)return;const r=u.role==='admin'?'user':'admin',ref=bank.child('users/'+state.managedUser+'/role');
try{await ref.set(r);if((await ref.once('value')).val()!==r)throw 0;toggleModal('mg',false);showToast(r==='admin'?'Promoted':'Demoted','success')}catch(e){showToast('Update failed','error')}}
};
const weekMs=6048e5;
Object.assign(state,{requests:[],loans:[],allLoans:{},stats:{},exportRange:'month',pinResolver:null,pinFailures:0,pinLockedUntil:0});
Object.assign(typeLabels,{fine:'Fine',fee:'Fee',loan:'Loan',repayment:'Repayment',refund:'Refund'});
filterTypes.transfer.push('fine','fee','loan','repayment');
filterTypes.merchant.push('refund');

const hapticSwitch=(()=>{
  const label=document.createElement('label');
  label.setAttribute('aria-hidden','true');
  label.style.cssText='position:fixed;left:-99px;top:0;opacity:0;pointer-events:none';
  const input=document.createElement('input');
  input.type='checkbox';
  input.setAttribute('switch','');
  label.append(input);
  document.body.append(label);
  return label;
})();
function haptic(pattern='tap'){
  if(localStorage.getItem('skb-haptics')==='off')return;
  const patterns={tap:8,success:[10,40,14],error:[28,36,28]};
  if(navigator.vibrate)navigator.vibrate(patterns[pattern]);
  else hapticSwitch.click();
}

function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  localStorage.setItem('skb-theme',theme);
  pick('meta[name=theme-color]').content=theme==='light'?'#e9eff9':'#060a14';
  renderPreferences();
}
function renderPreferences(){
  pick('#themeSwitch').classList.toggle('on',document.documentElement.dataset.theme==='light');
  pick('#hapticSwitch').classList.toggle('on',localStorage.getItem('skb-haptics')!=='off');
  const hasPin=Boolean(state.user&&state.user.pinHash);
  setText('pinStatus',hasPin?'On':'Off');
  setText('pinAction',hasPin?'Change':'Set up');
}

const hashPin=pin=>hashPassword('pin:'+state.username,pin);
let pinBuffer='';
function renderPinDots(){
  pick('#pinDots').innerHTML=Array.from({length:6},(_,index)=>`<i class="${index<pinBuffer.length?'on':''}"></i>`).join('');
}
function askPin(title,hint=''){
  return new Promise(resolve=>{
    pinBuffer='';
    setText('pinTitle',title);
    setText('pinHint',hint);
    renderPinDots();
    state.pinResolver=resolve;
    toggleModal('pin');
  });
}
function closePin(value){
  const resolve=state.pinResolver;
  state.pinResolver=null;
  toggleModal('pin',false);
  if(resolve)resolve(value);
}
async function confirmPin(title='Enter PIN'){
  const storedHash=state.user.pinHash;
  if(!storedHash)return true;
  if(Date.now()<state.pinLockedUntil){showToast('PIN locked. Try again shortly','error');return false}
  const pin=await askPin(title);
  if(!pin)return false;
  if(await hashPin(pin)===storedHash){state.pinFailures=0;return true}
  if(++state.pinFailures>=5){
    state.pinFailures=0;
    state.pinLockedUntil=Date.now()+6e4;
    showToast('Too many attempts. Locked for 1 minute','error');
  }else showToast('Incorrect PIN','error');
  return false;
}
async function changePin(){
  if(state.user.pinHash&&!await confirmPin('Current PIN'))return;
  const first=await askPin('New PIN','4 to 6 digits');
  if(!first)return;
  const second=await askPin('Confirm PIN');
  if(!second)return;
  if(first!==second)return showToast('PINs do not match','error');
  await bank.child('users/'+state.username+'/pinHash').set(await hashPin(first));
  showToast('PIN saved','success');
}
const withPin=(action,isReady)=>async(target,event)=>{
  if(isReady()&&!await confirmPin())return;
  return action(target,event);
};
actions.send=withPin(actions.send,()=>pick('#sTo').value.trim()&&roundCents(pick('#sAmt').value)>0&&!state.user.frozen);
actions.pay=withPin(actions.pay,()=>state.pendingPayment&&!state.user.frozen);

async function transferMoney(to,amount,note){
  const me=state.username;
  if(to===me){showToast('Choose another account','error');return false}
  const recipient=(await bank.child('users/'+to).once('value')).val();
  if(!recipient){showToast('Account not found','error');return false}
  const tax=roundCents(amount*state.vault.xfer/100),net=roundCents(amount-tax);
  if(!await adjustBalance('users/'+me+'/main',-amount)){showToast('Insufficient balance','error');return false}
  await adjustBalance('users/'+to+'/main',net);
  if(tax)await adjustBalance('vault/tax',tax);
  await recordTransaction({type:'transfer',from:me,to,fromName:state.user.name,toName:recipient.name||to,amt:amount,tax,net,note,p:[me,to]});
  pushNotification(me,'transfers','Transfer sent',`${formatMoney(amount)} to @${to}`);
  pushNotification(to,'transfers','Funds received',`${formatMoney(net)} from @${me}`);
  return true;
}

const saveRequest=request=>bank.update({
  ['userRequests/'+request.requester+'/'+request.id]:request,
  ['userRequests/'+request.payer+'/'+request.id]:request
});
const findRequest=id=>state.requests.find(request=>request.id===id);
function renderRequests(){
  const pending=state.requests.filter(request=>request.status==='pending');
  pick('#requestsCard').classList.toggle('hide',!pending.length);
  pick('#requestList').innerHTML=pending.map(request=>{
    const incoming=request.payer===state.username,name=incoming?request.requesterName:request.payerName;
    const actionsMarkup=incoming
      ?`<div class="btn sm primary" data-act="requestPay" data-id="${request.id}">Pay</div><div class="x" data-act="requestDecline" data-id="${request.id}">${ico('x')}</div>`
      :`<div class="btn sm outline" data-act="requestCancel" data-id="${request.id}">Cancel</div>`;
    return`<div class="row"><div class="ic ${incoming?'out':'in'}">${ico('request')}</div><div class="gr"><b>${escapeHtml(name)}</b><small>${formatMoney(request.amt)}${request.note?' · '+escapeHtml(request.note):''}</small></div><div class="row-actions">${actionsMarkup}</div></div>`;
  }).join('');
}
async function closeRequest(id,status,notifyUser,title,message){
  const request=findRequest(id);
  if(!request||request.status!=='pending')return;
  await saveRequest({...request,status,closedAt:Date.now()});
  pushNotification(notifyUser(request),'transfers',title,message(request));
}

const saveLoan=loan=>bank.update({['loans/'+loan.id]:loan,['userLoans/'+loan.borrower+'/'+loan.id]:loan});
const loanTotal=(principal,apr,weeks)=>roundCents(principal*(1+apr/100*weeks/52));
const currentLoan=()=>state.loans.find(loan=>loan.status==='active'||loan.status==='pending');
const shortDay=time=>new Date(time).toLocaleDateString([],{day:'numeric',month:'short'});
function renderLoanPreview(){
  const amount=roundCents(pick('#loanAmt').value),weeks=Math.round(+pick('#loanWeeks').value);
  if(!(amount>0)||!(weeks>=1)){setText('loanPreview','');return}
  const total=loanTotal(amount,state.vault.loanApr,weeks);
  setText('loanPreview',`Repay ${formatMoney(total)} · ${formatMoney(roundCents(total/weeks))} a week at ${state.vault.loanApr}% APR`);
}
function renderLoans(){
  const loan=currentLoan(),body=pick('#loanBody');
  if(!loan){
    body.innerHTML='<div class="loan-note"><span>No active loan</span><div class="btn sm secondary" data-act="loanOpen">Apply</div></div>';
    return;
  }
  if(loan.status==='pending'){
    body.innerHTML=`<div class="loan-note"><span>${formatMoney(loan.principal)} over ${loan.weeks} weeks</span><span class="tag">Pending</span></div>`;
    return;
  }
  const due=Math.min(loan.installment,loan.owed),overdue=Date.now()>loan.nextDue,paidShare=Math.min(100,Math.max(0,(1-loan.owed/loan.total)*100));
  body.innerHTML=`<div class="loan-top"><div><small>Outstanding</small><h2>${formatMoney(loan.owed)}</h2></div><span class="tag ${overdue?'r':''}">${overdue?'Overdue':loan.apr+'% APR'}</span></div>
<div class="progress"><i style="width:${paidShare.toFixed(1)}%"></i></div>
<div class="loan-meta"><span>Next ${formatMoney(due)}</span><span>Due ${shortDay(loan.nextDue)}</span></div>
<div class="two"><div class="btn primary" data-act="loanRepay" data-id="${loan.id}" data-mode="installment">Pay ${formatMoney(due)}</div><div class="btn outline" data-act="loanRepay" data-id="${loan.id}" data-mode="full">Pay Off</div></div>`;
}

function renderSales(){
  const merchant=state.merchant;
  if(!merchant||merchant.status!=='approved')return;
  const me=state.username,startOfDay=new Date().setHours(0,0,0,0),weekAgo=Date.now()-7*864e5;
  const sales=state.transactions.filter(tx=>tx.type==='merchant'&&tx.to===me);
  const kept=sales.filter(tx=>!tx.refunded);
  const sumNet=list=>list.reduce((total,tx)=>total+(tx.net??tx.amt),0);
  const refunded=state.transactions.filter(tx=>tx.type==='refund'&&tx.from===me).reduce((total,tx)=>total+tx.amt,0);
  const tiles=[
    ['Today',formatMoney(sumNet(kept.filter(tx=>tx.ts>=startOfDay)))],
    ['7 days',formatMoney(sumNet(kept.filter(tx=>tx.ts>=weekAgo)))],
    ['All time',formatMoney(sumNet(kept))],
    ['Sales',String(kept.length)],
    ['Average sale',formatMoney(kept.length?sumNet(kept)/kept.length:0)],
    ['Tax collected',formatMoney(kept.reduce((total,tx)=>total+(tx.tax||0),0))],
    ['Refunded',formatMoney(refunded)]
  ];
  pick('#salesStats').innerHTML=tiles.map(([label,value])=>`<div class="tile"><small>${label}</small><b>${value}</b></div>`).join('');
  pick('#salesList').innerHTML=sales.slice(0,12).map(transactionRow).join('')||'<div class="empty">No sales yet</div>';
}

function renderEconomy(){
  const users=Object.values(state.users).filter(user=>user.u!=='admin'),stats=state.stats||{},vault=state.vault;
  const personal=users.reduce((total,user)=>total+(user.main||0),0),savings=users.reduce((total,user)=>total+(user.savings||0),0);
  const loans=Object.values(state.allLoans||{}),outstanding=loans.filter(loan=>loan.status==='active').reduce((total,loan)=>total+loan.owed,0);
  const merchants=Object.values(state.allMerchants||{}).filter(merchant=>merchant.status==='approved').length;
  const total=Math.max(personal+savings+vault.reserve+vault.tax,1);
  const parts=[['s1','Accounts',personal],['s2','Savings',savings],['s3','Reserve',vault.reserve],['s4','Tax vault',vault.tax]];
  pick('#econBar').innerHTML=`<div class="bar">${parts.map(([style,,value])=>`<i class="${style}" style="width:${(Math.max(value,0)/total*100).toFixed(2)}%"></i>`).join('')}</div><div class="dist-legend">${parts.map(([style,label,value])=>`<span><i class="${style}"></i>${label} ${formatMoney(value)}</span>`).join('')}</div>`;
  const tiles=[
    ['Accounts',String(users.length)],['Merchants',String(merchants)],['Payments',String(stats.txCount||0)],['Payment volume',formatMoney(stats.volume)],
    ['Tax collected',formatMoney(stats.taxCollected)],['Wages paid',formatMoney(stats.wagesPaid)],['Interest paid',formatMoney(stats.interestPaid)],['Fines & fees',formatMoney(stats.finesCollected)],
    ['Loans issued',formatMoney(stats.loansIssued)],['Loans outstanding',formatMoney(outstanding)],['Loans repaid',formatMoney(stats.loansRepaid)],['Average balance',formatMoney(users.length?(personal+savings)/users.length:0)]
  ];
  pick('#econTiles').innerHTML=tiles.map(([label,value])=>`<div class="tile"><small>${label}</small><b>${value}</b></div>`).join('');
}
function renderAdminExtras(){
  const loans=Object.values(state.allLoans||{}).sort((a,b)=>b.ts-a.ts);
  pick('#loanQueue').innerHTML=loans.filter(loan=>loan.status==='pending').map(loan=>`<div class="row"><div class="gr"><b>${escapeHtml(loan.borrowerName)}</b><small>${formatMoney(loan.principal)} · ${loan.weeks} wks · @${escapeHtml(loan.borrower)}</small></div><div class="row-actions"><div class="btn sm primary" data-act="loanApprove" data-id="${loan.id}">Approve</div><div class="x" data-act="loanReject" data-id="${loan.id}">${ico('x')}</div></div></div>`).join('')||'<div class="empty">No applications</div>';
  pick('#loanBook').innerHTML=loans.filter(loan=>loan.status==='active').map(loan=>`<div class="row"><div class="gr"><b>${escapeHtml(loan.borrowerName)}</b><small>${loan.apr}% · due ${shortDay(loan.nextDue)}</small></div>${Date.now()>loan.nextDue?'<span class="tag r">Overdue</span>':''}<b class="amt">${formatMoney(loan.owed)}</b></div>`).join('')||'<div class="empty">No active loans</div>';
  renderEconomy();
}

const exportLabels={month:'This month',30:'Last 30 days',90:'Last 90 days',all:'All time'};
function exportStart(range){
  if(range==='all')return 0;
  if(range==='month'){const now=new Date();return new Date(now.getFullYear(),now.getMonth(),1).getTime()}
  return Date.now()-Number(range)*864e5;
}
async function loadStatementTransactions(){
  const snapshot=await bank.child('userTx/'+state.username).once('value');
  const start=exportStart(state.exportRange);
  return Object.values(snapshot.val()||{}).filter(tx=>tx.ts>=start).sort((a,b)=>a.ts-b.ts);
}
function describeTransaction(tx){
  if(tx.type==='savings')return tx.note;
  if(tx.type==='interest')return'Savings interest';
  const label=typeLabels[tx.type]||tx.type;
  return tx.to===state.username?`${label} from ${tx.fromName||tx.from}`:`${label} to ${tx.toName||tx.to}`;
}
function moneyColumns(tx){
  if(tx.type==='savings')return{debit:0,credit:0};
  return tx.to===state.username?{debit:0,credit:tx.net??tx.amt}:{debit:tx.amt,credit:0};
}
const documentDate=time=>new Date(time).toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'});
const documentFooter='<div class="doc-foot">© 2026 Sanchar Koirala | All rights reserved</div>';
function statementMarkup(list,label){
  const user=state.user;
  const totals=list.reduce((sum,tx)=>{const columns=moneyColumns(tx);sum.debit+=columns.debit;sum.credit+=columns.credit;return sum},{debit:0,credit:0});
  const rows=list.map(tx=>{
    const columns=moneyColumns(tx);
    return`<tr><td>${documentDate(tx.ts)}</td><td>${escapeHtml(describeTransaction(tx))}${tx.note&&tx.type!=='savings'?`<br><small>${escapeHtml(tx.note)}</small>`:''}</td><td>${typeLabels[tx.type]||tx.type}</td><td class="n">${columns.debit?formatMoney(columns.debit):''}</td><td class="n">${columns.credit?formatMoney(columns.credit):''}</td></tr>`;
  }).join('')||'<tr><td colspan="5">No transactions in this period</td></tr>';
  return`<div class="doc"><div class="doc-head"><div><h1>SK Bank</h1><p>Statement of Account</p></div><div><p>${label}</p><p>Generated ${formatDate(Date.now())}</p></div></div>
<div class="doc-grid"><div><small>Account holder</small><b>${escapeHtml(user.name)}</b></div><div><small>Username</small><b>@${escapeHtml(user.u)}</b></div><div><small>Account no.</small><b>SK-${String(user.createdAt).slice(-8)}</b></div><div><small>Address</small><b>${escapeHtml(user.addr||'—')}</b></div></div>
<div class="doc-grid"><div><small>Money in</small><b>${formatMoney(totals.credit)}</b></div><div><small>Money out</small><b>${formatMoney(totals.debit)}</b></div><div><small>Main balance</small><b>${formatMoney(user.main)}</b></div><div><small>Savings balance</small><b>${formatMoney(user.savings)}</b></div></div>
<table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>${rows}</tbody></table>${documentFooter}</div>`;
}
const code39Patterns={0:'nnnwwnwnn',1:'wnnwnnnnw',2:'nnwwnnnnw',3:'wnwwnnnnn',4:'nnnwwnnnw',5:'wnnwwnnnn',6:'nnwwwnnnn',7:'nnnwnnwnw',8:'wnnwnnwnn',9:'nnwwnnwnn',
  A:'wnnnnwnnw',B:'nnwnnwnnw',C:'wnwnnwnnn',D:'nnnnwwnnw',E:'wnnnwwnnn',F:'nnwnwwnnn',G:'nnnnnwwnw',H:'wnnnnwwnn',I:'nnwnnwwnn',J:'nnnnwwwnn',K:'wnnnnnnww',L:'nnwnnnnww',M:'wnwnnnnwn',
  N:'nnnnwnnww',O:'wnnnwnnwn',P:'nnwnwnnwn',Q:'nnnnnnwww',R:'wnnnnnwwn',S:'nnwnnnwwn',T:'nnnnwnwwn',U:'wwnnnnnnw',V:'nwwnnnnnw',W:'wwwnnnnnn',X:'nwnnwnnnw',Y:'wwnnwnnnn',Z:'nwwnwnnnn','*':'nwnnwnwnn'};
function barcodeMarkup(value){
  const text='*'+String(value).toUpperCase().replace(/[^0-9A-Z]/g,'')+'*',narrow=1,wide=2.5;
  let x=0,bars='';
  [...text].forEach(char=>{
    [...code39Patterns[char]].forEach((width,index)=>{
      const size=width==='w'?wide:narrow;
      if(index%2===0)bars+=`<rect x="${x}" y="0" width="${size}" height="40"/>`;
      x+=size;
    });
    x+=narrow;
  });
  return`<svg class="r-barcode" viewBox="0 0 ${x} 40" preserveAspectRatio="none">${bars}</svg>`;
}
function receiptDate(time){
  const date=new Date(time),pad=number=>String(number).padStart(2,'0');
  return`${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()}  ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const plainAmount=value=>formatMoney(value).replace('$','');
function receiptMarkup(tx){
  const line=(left,right,extra='')=>`<div class="r-line${extra}"><span>${left}</span><span>${right}</span></div>`;
  const rule='<div class="r-rule"></div>',isSale=tx.type==='merchant';
  const title=isSale?'TAX INVOICE':(typeLabels[tx.type]||tx.type).toUpperCase()+' RECEIPT';
  const header=`<svg class="i r-logo"><use href="#i-landmark"/></svg><div class="r-center"><div class="r-store">${escapeHtml(isSale?tx.toName||tx.to:'SK Bank')}</div><div class="r-title">${title}</div>${isSale?'<div class="r-muted">Processed by SK Bank</div>':''}</div>`;
  const parties=isSale?line('Customer',escapeHtml(tx.fromName||tx.from)):line('From',escapeHtml(tx.fromName||tx.from))+line('To',escapeHtml(tx.toName||tx.to));
  const details=line('Date',receiptDate(tx.ts))+line('Receipt',escapeHtml(tx.id))+parties;
  let body;
  if(isSale){
    const items=tx.items&&tx.items.length?tx.items:[{n:'Purchase',p:tx.net??tx.amt,q:1}];
    const rate=tx.net?Math.round((tx.tax||0)/tx.net*1000)/10:0;
    body=line('QTY ITEM','AMOUNT',' r-head')+items.map(item=>line(`${item.q} x ${escapeHtml(item.n)}`,plainAmount(item.p*item.q))).join('')+rule
      +line('Subtotal',plainAmount(tx.net??tx.amt))+line(`Sales tax (${rate}%)`,plainAmount(tx.tax||0))+rule
      +line('TOTAL',formatMoney(tx.amt),' r-total')+line('Paid - SK Bank Account',plainAmount(tx.amt))+line('Change','0.00')
      +(tx.code?line('Auth code',escapeHtml(tx.code)):'');
  }else{
    body=line('Amount',plainAmount(tx.amt))+(tx.tax?line('Tax',plainAmount(tx.tax)):'')+line('Net',plainAmount(tx.net??tx.amt))+rule
      +line('TOTAL',formatMoney(tx.amt),' r-total')+(tx.note?line('Note',escapeHtml(tx.note)):'');
  }
  if(tx.refunded)body+=line('Status','REFUNDED',' r-head');
  const thanks=isSale?'THANK YOU FOR SHOPPING WITH US':'THANK YOU FOR BANKING WITH SK BANK';
  const advice=isSale?'Please keep this receipt for refunds.':'Keep this receipt for your records.';
  return`<div class="receipt">${header}${rule}${details}${rule}${body}${rule}<div class="r-thanks">${thanks}</div><div class="r-center r-muted">${advice}</div>${barcodeMarkup(tx.id)}<div class="r-code">${escapeHtml(tx.id)}</div><div class="r-foot">© 2026 Sanchar Koirala | All rights reserved</div></div>`;
}
function printDocument(markup){
  const area=pick('#printArea');
  area.innerHTML=markup;
  const clear=()=>{area.innerHTML='';removeEventListener('afterprint',clear)};
  addEventListener('afterprint',clear);
  requestAnimationFrame(()=>window.print());
}
const csvCell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
function downloadFile(name,text,type){
  const link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([text],{type}));
  link.download=name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}

Object.assign(actions,{
  toggleTheme:()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light'),
  toggleHaptics(){
    const enabled=localStorage.getItem('skb-haptics')!=='off';
    localStorage.setItem('skb-haptics',enabled?'off':'on');
    renderPreferences();
    if(!enabled)haptic('success');
  },
  changePin,
  pinKey(target){if(pinBuffer.length<6){pinBuffer+=target.dataset.k;renderPinDots()}},
  pinBack(){pinBuffer=pinBuffer.slice(0,-1);renderPinDots()},
  pinOk(){
    if(pinBuffer.length<4)return showToast('PIN needs 4 to 6 digits','error');
    closePin(pinBuffer);
  },

  requestOpen:()=>toggleModal('request'),
  async requestSend(){
    const payer=pick('#qTo').value.trim().toLowerCase().replace(/^@/,''),amount=roundCents(pick('#qAmt').value);
    if(!payer||!(amount>0))return showToast('Enter account and amount','error');
    if(payer===state.username)return showToast('Choose another account','error');
    const target=(await bank.child('users/'+payer).once('value')).val();
    if(!target)return showToast('Account not found','error');
    await saveRequest({id:'R'+Date.now().toString(36).toUpperCase(),requester:state.username,requesterName:state.user.name,payer,payerName:target.name||payer,amt:amount,note:pick('#qNote').value.trim(),status:'pending',ts:Date.now()});
    pushNotification(payer,'transfers','Payment request',`${state.user.name} requested ${formatMoney(amount)}`);
    toggleModal('request',false);
    ['#qTo','#qAmt','#qNote'].forEach(selector=>pick(selector).value='');
    showToast('Request sent','success');
  },
  async requestPay(target){
    const request=findRequest(target.dataset.id);
    if(!request||request.status!=='pending'||request.payer!==state.username||isFrozen())return;
    if(!await confirmPin())return;
    if(await transferMoney(request.requester,request.amt,request.note||'Payment request')){
      await saveRequest({...request,status:'paid',closedAt:Date.now()});
      pushNotification(request.requester,'transfers','Request paid',`${state.user.name} paid ${formatMoney(request.amt)}`);
      showToast('Paid '+formatMoney(request.amt),'success');
    }
  },
  async requestDecline(target){
    await closeRequest(target.dataset.id,'declined',request=>request.requester,'Request declined',request=>`${request.payerName} declined ${formatMoney(request.amt)}`);
    showToast('Declined','info');
  },
  async requestCancel(target){
    await closeRequest(target.dataset.id,'cancelled',request=>request.payer,'Request cancelled',request=>`${request.requesterName} cancelled a ${formatMoney(request.amt)} request`);
    showToast('Cancelled','info');
  },

  loanOpen:()=>toggleModal('loanApply'),
  async loanApply(){
    if(currentLoan())return showToast('You already have a loan','error');
    const principal=roundCents(pick('#loanAmt').value),weeks=Math.round(+pick('#loanWeeks').value);
    if(!(principal>0)||!(weeks>=1&&weeks<=104))return showToast('Enter amount and 1 to 104 weeks','error');
    await saveLoan({id:'L'+Date.now().toString(36).toUpperCase(),borrower:state.username,borrowerName:state.user.name,principal,weeks,status:'pending',ts:Date.now()});
    pushNotification('admin','system','Loan application',`${state.user.name} requested ${formatMoney(principal)}`);
    toggleModal('loanApply',false);
    ['#loanAmt','#loanWeeks'].forEach(selector=>pick(selector).value='');
    renderLoanPreview();
    showToast('Application sent','success');
  },
  async loanApprove(target){
    const loan=(await bank.child('loans/'+target.dataset.id).once('value')).val();
    if(!loan||loan.status!=='pending')return showToast('Already handled','info');
    const apr=state.vault.loanApr;
    if(!await adjustBalance('vault/reserve',-loan.principal))return showToast('Exceeds reserve','error');
    await adjustBalance('users/'+loan.borrower+'/main',loan.principal);
    const total=loanTotal(loan.principal,apr,loan.weeks),now=Date.now();
    await saveLoan({...loan,status:'active',apr,total,owed:total,installment:roundCents(total/loan.weeks),nextDue:now+weekMs,approvedAt:now});
    await recordTransaction({type:'loan',from:'SK Bank',to:loan.borrower,fromName:'SK Bank Lending',toName:loan.borrowerName,amt:loan.principal,net:loan.principal,note:`${apr}% APR · ${loan.weeks} weeks`,p:[loan.borrower]});
    pushNotification(loan.borrower,'earnings','Loan approved',`${formatMoney(loan.principal)} deposited at ${apr}% APR`);
    showToast('Loan approved','success');
  },
  async loanReject(target){
    const loan=(await bank.child('loans/'+target.dataset.id).once('value')).val();
    if(!loan||loan.status!=='pending')return;
    await saveLoan({...loan,status:'rejected'});
    pushNotification(loan.borrower,'system','Loan declined',`Your ${formatMoney(loan.principal)} application was not approved`);
    showToast('Declined','info');
  },
  async loanRepay(target){
    const loan=state.loans.find(item=>item.id===target.dataset.id);
    if(!loan||loan.status!=='active'||isFrozen())return;
    const amount=roundCents(target.dataset.mode==='full'?loan.owed:Math.min(loan.installment,loan.owed));
    if(!await confirmPin())return;
    if(!await adjustBalance('users/'+state.username+'/main',-amount))return showToast('Insufficient balance','error');
    await adjustBalance('vault/reserve',amount);
    const owed=roundCents(loan.owed-amount),settled=owed<=.004;
    await saveLoan({...loan,owed:settled?0:owed,status:settled?'paid':'active',nextDue:settled?null:loan.nextDue+(target.dataset.mode==='full'?0:weekMs)});
    await recordTransaction({type:'repayment',from:state.username,to:'SK Bank',fromName:state.user.name,toName:'SK Bank Lending',amt:amount,net:amount,note:settled?'Loan paid off':'Loan repayment',p:[state.username]});
    pushNotification('admin','system',settled?'Loan paid off':'Loan repayment',`${state.user.name} paid ${formatMoney(amount)}`);
    showToast(settled?'Loan paid off':'Repayment made','success');
  },

  async refundSale(){
    const sale=state.selectedTx;
    if(!sale||sale.type!=='merchant'||sale.to!==state.username||sale.refunded)return;
    if(!await confirmPin())return;
    const net=sale.net??sale.amt;
    if(!await adjustBalance('users/'+state.username+'/main',-net))return showToast('Insufficient balance','error');
    if(sale.tax&&!await adjustBalance('vault/tax',-sale.tax))await adjustBalance('vault/reserve',-sale.tax);
    await adjustBalance('users/'+sale.from+'/main',sale.amt);
    await bank.update({['ledger/'+sale.id+'/refunded']:true,['userTx/'+sale.from+'/'+sale.id+'/refunded']:true,['userTx/'+sale.to+'/'+sale.id+'/refunded']:true});
    await recordTransaction({type:'refund',from:state.username,to:sale.from,fromName:state.merchant.biz,toName:sale.fromName,amt:sale.amt,tax:sale.tax||0,net:sale.amt,note:'Refund of '+sale.id,p:[state.username,sale.from]});
    pushNotification(sale.from,'merchant','Refund received',`${formatMoney(sale.amt)} from ${state.merchant.biz}`);
    toggleModal('rec',false);
    showToast('Refunded','success');
  },

  async mgCharge(target){
    const user=state.users[state.managedUser],amount=roundCents(pick('#mgAmt').value),reason=pick('#mgReason').value.trim(),kind=target.dataset.kind;
    if(!(amount>0)||!reason)return showToast('Enter amount and reason','error');
    if(!await adjustBalance('users/'+user.u+'/main',-amount))return showToast('Insufficient balance','error');
    await adjustBalance('vault/tax',amount);
    await recordTransaction({type:kind,from:user.u,to:'SK Bank',fromName:user.name,toName:'SK Bank',amt:amount,net:amount,note:reason,p:[user.u]});
    pushNotification(user.u,'system',kind==='fine'?'Fine issued':'Fee charged',`${formatMoney(amount)} · ${reason}`);
    toggleModal('mg',false);
    showToast('Charged '+formatMoney(amount),'success');
  },
  async mgResetPin(){
    await bank.child('users/'+state.managedUser+'/pinHash').remove();
    toggleModal('mg',false);
    showToast('PIN reset','success');
  },

  exportOpen(){
    pickAll('#exportRanges .rg').forEach(chip=>chip.classList.toggle('on',chip.dataset.r===state.exportRange));
    toggleModal('export');
  },
  exportRange(target){
    state.exportRange=target.dataset.r;
    pickAll('#exportRanges .rg').forEach(chip=>chip.classList.toggle('on',chip===target));
  },
  async exportPrint(){
    printDocument(statementMarkup(await loadStatementTransactions(),exportLabels[state.exportRange]));
    toggleModal('export',false);
  },
  async exportCsv(){
    const list=await loadStatementTransactions(),rows=[['Date','Transaction ID','Type','Description','Debit','Credit','Note']];
    list.forEach(tx=>{const columns=moneyColumns(tx);rows.push([new Date(tx.ts).toISOString(),tx.id,typeLabels[tx.type]||tx.type,describeTransaction(tx),columns.debit||'',columns.credit||'',tx.note||''])});
    downloadFile(`sk-bank-statement-${state.username}.csv`,rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv');
    toggleModal('export',false);
    showToast('Statement downloaded','success');
  },
  receiptPrint(){if(state.selectedTx)printDocument(receiptMarkup(state.selectedTx))}
});
['#loanAmt','#loanWeeks'].forEach(selector=>pick(selector).addEventListener('input',renderLoanPreview));

const callerIsAdmin=async()=>(await bank.child('users/'+state.username+'/role').once('value')).val()==='admin';
['mint','burn','sweep','rates','approve','reject','broadcast','mgr','mgFund','mgTake','mgJob','mgPay','mgMsg','mgFreeze','mgFire','mgMerch','mgRole','loanApprove','loanReject','mgCharge','mgResetPin'].forEach(k=>{const f=actions[k];actions[k]=async(t,e)=>{if(!await callerIsAdmin())return showToast('Not allowed','error');return f(t,e)}});
const stopScanner=()=>{try{state.scanner&&state.scanner.isScanning&&state.scanner.stop().catch(()=>{})}catch(e){}};
async function loadInvoice(x){const c=String(x).trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(c))return showToast('Invalid code','error');const v=(await bank.child('invoices/'+c).once('value')).val();if(!v||v.st!=='open'||Date.now()+(state.serverOffset||0)-v.ts>9e5)return showToast('Code expired or used','error');state.pendingPayment={c,...v};
setText('pBiz',v.biz);setText('pSub',formatMoney(v.sub));setText('pTax',formatMoney(v.tax));setText('pTot',formatMoney(v.tot));pick('#pItems').innerHTML=(v.items||[]).map(i=>`<div><span>${escapeHtml(i.n)} × ${i.q}</span><span>${formatMoney(i.p*i.q)}</span></div>`).join('');pick('#scInfo').classList.remove('hide')}
const increment=firebase.database.ServerValue.increment;
async function accrueInterest(){const u=state.user;if(!u||state.accruing||!(u.savings>0)||!(state.vault.apr>0))return;state.accruing=1;
try{const now=Date.now(),last=u.lastInterest||u.createdAt,elapsedSeconds=(now-last)/1e3;if(elapsedSeconds<.9)return;
const a=Math.round(u.savings*state.vault.apr/100/12/604800*elapsedSeconds*1e8)/1e8;if(!(a>0)||state.vault.reserve<a)return;
if(!(await bank.child('users/'+u.u+'/lastInterest').transaction(v=>(v||last)===last?now:undefined)).committed)return;
await bank.update({['users/'+u.u+'/savings']:increment(a),['network/'+u.u+'/nw']:increment(a),['users/'+u.u+'/pend']:increment(a),['vault/reserve']:increment(-a),['stats/interestPaid']:increment(a)});
const pe=(u.pend||0)+a;
if(pe>=.01&&now-(u.lastLog||0)>=6e4){const c=Math.floor(pe*100+1e-6)/100;
if((await bank.child('users/'+u.u+'/pend').transaction(v=>(v||0)>=c?Math.round((v-c)*1e8)/1e8:undefined)).committed){await bank.child('users/'+u.u+'/lastLog').set(now);await recordTransaction({type:'interest',from:'SK Bank',to:u.u,fromName:'Savings Interest',toName:u.name,amt:c,net:c,note:state.vault.apr+'% APR · added to savings',p:[u.u]})}}}finally{state.accruing=0}}
setInterval(accrueInterest,1000);
function renderVault(){setText('apr',state.vault.apr.toFixed(1)+'% APR');['Apr:apr','Sales:sales','Xfer:xfer','Wage:wage','Loan:loanApr'].forEach(p=>{const[a,b]=p.split(':');setInputValue('r'+a,state.vault[b])});renderCart();renderAdmin()}
function renderUser(){const u=state.user;animateNumber(pick('#bMain'),u.main||0);{const sv=Math.floor((u.savings||0)*1e6)/1e6;pick('#bSave').innerHTML=formatMoney(Math.floor(sv*100+1e-6)/100)+'<i class="frac">'+sv.toFixed(6).slice(-4)+'</i>'}setText('hName',u.name);setText('hAv',u.u[0].toUpperCase());setText('pAv',u.u[0].toUpperCase());setText('pUser','@'+u.u);setText('pAcc','SK-'+u.createdAt.toString().slice(-8));
setText('pRole',u.role==='admin'?'Administrator':state.merchant&&state.merchant.status==='approved'?'Merchant':'Personal Account');setText('pJob',u.job?`${u.job.title}${u.job.sector?' · '+u.job.sector:''}`:'');setInputValue('pName',u.name);setInputValue('pAddr',u.addr||'');
pickAll('.adm').forEach(e=>e.classList.toggle('hide',u.role!=='admin'));pick('#frz').classList.toggle('hide',!u.frozen);
pick('#dial').innerHTML=(u.fav||[]).map(f=>`<div class="chip" data-act="dial" data-u="${escapeHtml(f)}"><i>${escapeHtml(f[0].toUpperCase())}</i>@${escapeHtml(f)}<div class="rm" data-act="unfav" data-u="${escapeHtml(f)}">×</div></div>`).join('')||'<small class="mut">Empty</small>';syncNetworkEntry()}
function transactionRow(t){const sv=t.type==='savings',inc=t.to===state.username&&!sv,who=sv?t.note:inc?t.fromName||t.from:t.toName||t.to,ic=sv?'wallet':inc?'down':t.type==='interest'?'percent':'up';
return`<div class="row" data-act="tx" data-id="${escapeHtml(t.id)}"><div class="ic ${inc?'in':sv?'sv':'out'}">${ico(ic)}</div><div class="gr"><b>${escapeHtml(who)}</b><small>${typeLabels[t.type]||t.type} · ${formatShortDate(t.ts)}${t.refunded?' · Refunded':''}</small></div><b class="amt ${inc?'pos':''}">${sv?'':inc?'+':'−'}${formatMoney(inc?t.net??t.amt:t.amt)}</b></div>`}
function renderTx(){renderSales();state.txIndex={};[...state.ledger,...state.transactions].forEach(t=>state.txIndex[t.id]=t);pick('#recent').innerHTML=state.transactions.slice(0,5).map(transactionRow).join('')||'<div class="empty">No transactions</div>';
const q=state.search.toLowerCase(),ft=filterTypes[state.txFilter];pick('#hist').innerHTML=state.transactions.filter(t=>(!ft||ft.includes(t.type))&&(!q||[t.id,t.from,t.to,t.fromName,t.toName,t.note].join(' ').toLowerCase().includes(q))).map(transactionRow).join('')||'<div class="empty">No transactions</div>'}
function renderNotes(){const n=state.notes,un=n.filter(x=>!x.read).length,b=pick('#badge');b.textContent=un;b.classList.toggle('hide',!un);
const IC={transfers:'send',merchant:'store',earnings:'percent',system:'bell'};
pick('#nList').innerHTML=n.filter(x=>state.noteFilter==='all'||x.cat===state.noteFilter).map(x=>`<div class="row nt ${x.read?'':'un'}"><div class="ic sv">${ico(IC[x.cat]||'bell')}</div><div class="gr"><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.msg)}</small><small>${formatDate(x.ts)}</small></div></div>`).join('')||'<div class="empty">No notifications</div>';if(un&&pick('#notes').classList.contains('on'))readNotes()}
function readNotes(){const u={};state.notes.forEach(n=>{if(!n.read)u['notes/'+state.username+'/'+n.k+'/read']=true});if(Object.keys(u).length)bank.update(u)}
function renderMerchant(){const m=state.merchant,ok=m&&m.status==='approved';pick('#mApply').classList.toggle('hide',!!m);pick('#mWait').classList.toggle('hide',!(m&&m.status==='pending'));pick('#mConsole').classList.toggle('hide',!ok);setText('mBadge',ok?m.biz:m?'Pending':'');
if(ok)pick('#catalog').innerHTML=Object.values(m.items||{}).map(i=>`<div class="row"><div class="gr"><b>${escapeHtml(i.n)}</b><small>${formatMoney(i.p)}</small></div><div class="btn sm secondary" data-act="add" data-id="${escapeHtml(i.id)}">Add</div><div class="x" data-act="itemDel" data-id="${escapeHtml(i.id)}">${ico('trash')}</div></div>`).join('')||'<div class="empty">No items</div>';
if(state.user)renderUser();renderCart();renderSales()}
function renderCart(){const sub=roundCents(state.cart.reduce((a,i)=>a+i.p*i.q,0)),tax=roundCents(sub*state.vault.sales/100);pick('#cart').innerHTML=state.cart.map((i,x)=>`<div class="row"><div class="gr"><b>${escapeHtml(i.n)}</b><small>${formatMoney(i.p)} × ${i.q}</small></div><b>${formatMoney(i.p*i.q)}</b><div class="x" data-act="cartDel" data-i="${x}">${ico('x')}</div></div>`).join('')||'<div class="empty">Empty</div>';setText('cSub',formatMoney(sub));setText('cTax',formatMoney(tax));setText('cTot',formatMoney(sub+tax))}
function renderAdmin(){if(!state.user||state.user.role!=='admin')return;const us=Object.values(state.users),V=state.vault;setText('sMint',formatMoney(V.minted));setText('sRes',formatMoney(V.reserve));setText('sTax',formatMoney(V.tax));setText('sCirc',formatMoney(us.reduce((a,u)=>a+(u.main||0)+(u.savings||0),0)));
pick('#uList').innerHTML=us.sort((a,b)=>(b.main||0)-(a.main||0)).map(u=>`<div class="row" data-act="mgr" data-u="${escapeHtml(u.u)}"><div class="av sm">${escapeHtml(u.u[0].toUpperCase())}</div><div class="gr"><b>${escapeHtml(u.name)}${u.role==='admin'?' <em class="tag">Admin</em>':''}${u.frozen?' <em class="tag r">Frozen</em>':''}</b><small>@${escapeHtml(u.u)}${u.job?' · '+escapeHtml(u.job.title):''}</small></div><b>${formatMoney(u.main)}</b></div>`).join('');
const pm=Object.entries(state.allMerchants||{}).filter(([,m])=>m.status==='pending');pick('#mReq').innerHTML=pm.map(([u,m])=>`<div class="row"><div class="gr"><b>${escapeHtml(m.biz)}</b><small>@${escapeHtml(u)} · ${escapeHtml(m.cat)}</small></div><div class="btn sm primary" data-act="approve" data-u="${escapeHtml(u)}">Approve</div><div class="x" data-act="reject" data-u="${escapeHtml(u)}">${ico('x')}</div></div>`).join('')||'<div class="empty">No requests</div>';
pick('#ledger').innerHTML=state.ledger.slice(0,40).map(t=>`<div class="row" data-act="tx" data-id="${escapeHtml(t.id)}"><div class="gr"><b>${escapeHtml(t.fromName||t.from)} → ${escapeHtml(t.toName||t.to)}</b><small>${typeLabels[t.type]||t.type} · ${formatShortDate(t.ts)}</small></div><b>${formatMoney(t.amt)}</b></div>`).join('')||'<div class="empty">No activity</div>';renderTx();renderAdminExtras();syncNetworkEntry()}
function renderNet(){const me=state.username;pick('#netList').innerHTML=Object.values(state.network).filter(e=>e&&e.u&&e.u!=='admin').sort((a,b)=>(b.nw||0)-(a.nw||0)||a.u.localeCompare(b.u)).map(e=>`<div class="row nr${e.u===me?' me':''}"><div class="av sm">${escapeHtml(e.u[0].toUpperCase())}</div><div class="gr"><b>${escapeHtml(e.name||e.u)}</b><small>@${escapeHtml(e.u)}</small>${e.job&&e.job.title?`<small>${escapeHtml(e.job.title)}${e.job.sector?' @'+escapeHtml(e.job.sector):''}</small>`:''}</div><b class="amt">${formatMoney(e.nw)}</b></div>`).join('')||'<div class="empty">No accounts</div>'}
function syncNetworkEntry(){if(state.networkSyncTimer||!state.user)return;state.networkSyncTimer=setTimeout(()=>{state.networkSyncTimer=0;if(!state.user)return;
const chk=u=>{if(!u||!u.u||u.u==='admin')return;const nw=Math.round(((u.main||0)+(u.savings||0))*1e8)/1e8,n=state.network[u.u],j=u.job||{};
if(!n||n.name!==u.name||Math.abs((n.nw||0)-nw)>1e-6||(n.job&&n.job.title||'')!==(j.title||'')||(n.job&&n.job.sector||'')!==(j.sector||'')){const w={u:u.u,name:u.name,nw};if(u.job)w.job={title:u.job.title,sector:u.job.sector||''};state.network[u.u]=w;bank.child('network/'+u.u).set(w)}};
chk(state.user);if(state.user.role==='admin')Object.values(state.users).forEach(chk)},1500)}
function adminSync(){const ad=state.user.role==='admin';if(ad===!!state.adminActive)return;state.adminActive=ad;
if(ad){state.adminRefs=[bank.child('users'),bank.child('merchants'),bank.child('ledger').limitToLast(100),bank.child('loans'),bank.child('stats')];
state.adminRefs[0].on('value',x=>{state.users=x.val()||{};renderAdmin()});state.adminRefs[1].on('value',x=>{state.allMerchants=x.val()||{};renderAdmin()});state.adminRefs[2].on('value',x=>{state.ledger=Object.values(x.val()||{}).sort((a,b)=>b.ts-a.ts);renderAdmin()});state.adminRefs[3].on('value',x=>{state.allLoans=x.val()||{};renderAdmin()});state.adminRefs[4].on('value',x=>{state.stats=x.val()||{};renderAdmin()})}
else{(state.adminRefs||[]).forEach(r=>r.off());state.adminRefs=[];state.users={};state.allMerchants={};state.ledger=[];state.allLoans={};state.stats={};toggleModal('mg',false);if(pick('#admin').classList.contains('on'))showView('home');renderTx()}}
document.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(t&&actions[t.dataset.act]){haptic('tap');actions[t.dataset.act](t,e)}else if(e.target.classList.contains('modal'))actions.close(e.target)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.enter){e.preventDefault();pick(e.target.dataset.enter).click()}});
pick('#hq').addEventListener('input',e=>{state.search=e.target.value.trim();renderTx()});
pick('#scCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase());
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,event=>event.preventDefault()));
document.addEventListener('touchmove',event=>{if(event.touches.length>1)event.preventDefault()},{passive:false});
addEventListener('load',async()=>{navigator.serviceWorker?.register('sw.js').catch(()=>{});
firebase.database().ref('.info/serverTimeOffset').on('value',x=>state.serverOffset=x.val()||0);
bank.child('vault').transaction(v=>v||{reserve:0,tax:0,minted:0,apr:3,sales:2,xfer:.5,wage:5,loanApr:8});bank.child('vault').on('value',s=>{if(s.val()){state.vault={...state.vault,...s.val()};renderVault()}});
let s=null;try{s=JSON.parse(localStorage.getItem('skb'))}catch(e){}
if(s&&s.u){const v=(await bank.child('users/'+s.u).once('value')).val();if(v&&v.ph===s.h)return beginSession(s.u,s.h)}
pick('#auth').classList.add('on')});