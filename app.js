'use strict';
firebase.initializeApp({apiKey:"AIzaSyDpCAXfhldRc1nCZDWlWNRbcMFjqAh8uPc",authDomain:"cloud-db-studio.firebaseapp.com",databaseURL:"https://cloud-db-studio-default-rtdb.firebaseio.com",projectId:"cloud-db-studio",storageBucket:"cloud-db-studio.firebasestorage.app",messagingSenderId:"343326148662",appId:"1:343326148662:web:987738ccc8f9d6a8253097"});
const bank=firebase.database().ref('sk-bank'),pick=selector=>document.querySelector(selector),pickAll=selector=>[...document.querySelectorAll(selector)];
const roundCents=n=>Math.round((+n+Number.EPSILON)*100)/100;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatMoney=n=>'$'+(+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const formatDate=t=>new Date(t).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
const formatShortDate=t=>new Date(t).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const state={network:{},username:null,user:null,vault:{reserve:0,tax:0,minted:0,apr:3,sales:2,xfer:.5,wage:5,loanApr:8,dailyBase:1,termApr:5},users:{},transactions:[],ledger:[],notes:[],cart:[],merchant:null,allMerchants:{},txIndex:{},txFilter:'all',noteFilter:'all',search:'',pendingPayment:null,managedUser:null,selectedTx:null,savingsMode:'deposit',serverOffset:0},listeners=[];
const ico=name=>`<svg class="i"><use href="#i-${name}"/></svg>`;
const typeLabels={transfer:'Transfer',merchant:'Payment',interest:'Interest',wage:'Wage',savings:'Savings',credit:'Credit',debit:'Debit',mint:'Mint'};
const filterTypes={all:null,transfer:['transfer','credit','debit'],merchant:['merchant'],earn:['interest','wage'],savings:['savings']};
const liveListIds=new Set(['dial','recent','hist','nList','catalog','cart','uList','mReq','ledger','bSave','pItems','netList','requestList','loanBody','salesStats','salesList','econTiles','econBar','loanQueue','loanBook','dailyBody','dailyMini','cardBody','depositBody','giftList','levelBody','portfolioBody','marketBody','jobsBody','vouchersBody','voucherManage','companyManage','deviceList','auditList','marketAdmin','spinAction']);
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
  if(state.impersonation)entry.actor=state.actor;
  const updates={['ledger/'+id]:entry};
  parties.forEach(party=>updates['userTx/'+party+'/'+id]=entry);
  if(xpFor(entry)&&parties.includes(entry.from))updates['users/'+entry.from+'/xp']=increment(xpFor(entry));
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
  if(tx.type==='reward')add('rewardsPaid',tx.amt);
  if(tx.type==='trade')add('tradeVolume',tx.amt);
  return delta;
}
function animateNumber(el,to){const from=+el.dataset.v||0;el.dataset.v=to;if(from===to){el.textContent=formatMoney(to);return}const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/500);el.textContent=formatMoney(from+(to-from)*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)}
const setInputValue=(id,v)=>{const e=pick('#'+id);if(e&&document.activeElement!==e)e.value=v};
const setText=(id,v)=>{const e=pick('#'+id);if(e&&e.textContent!==v)e.textContent=v};
const isFrozen=()=>state.user.frozen?(showToast('Account frozen','error'),true):false;

function showView(id){pickAll('#app .view').forEach(v=>v.classList.toggle('on',v.id===id));pickAll('.nav [data-v]').forEach(n=>n.classList.toggle('on',n.dataset.v===id));scrollTo(0,0);if(id==='notes')readNotes()}

const actions={
mode:t=>pick('#auth').dataset.mode=t.dataset.v,
async login(){const u=pick('#lu').value.trim().toLowerCase(),p=pick('#lp').value;if(!u||!p)return showToast('Enter username and password','error');const [s,h]=await Promise.all([bank.child('users/'+u).once('value'),hashPassword(u,p)]);if(!s.val()||s.val().ph!==h)return showToast('Invalid username or password','error');beginSession(u,h)},
async reg(){const u=pick('#ru').value.trim().toLowerCase(),p=pick('#rp').value;if(!/^[a-z0-9_]{3,20}$/.test(u))return showToast('Username: 3–20 letters, numbers or _','error');if(p.length<6)return showToast('Password needs 6+ characters','error');
const o={u,name:pick('#rn').value.trim()||u,addr:pick('#ra').value.trim(),main:0,savings:0,role:u==='admin'?'admin':'user',createdAt:Date.now(),ph:await hashPassword(u,p)};o.lastInterest=o.createdAt;
if(!(await bank.child('users/'+u).transaction(v=>v?undefined:o)).committed)return showToast('Username unavailable','error');pushNotification(u,'system','Account opened','Your account is ready.');beginSession(u,o.ph)},
async logout(options){
  if(state.loggingOut)return;
  state.loggingOut=true;
  const actor=state.actor,token=state.sessionToken,keepRemote=Boolean(options&&options.skipRemote);
  listeners.forEach(ref=>ref.off());listeners.length=0;
  contextListeners.forEach(ref=>ref.off());contextListeners.length=0;
  (state.adminRefs||[]).forEach(ref=>ref.off());
  localStorage.removeItem('skb');
  if(actor&&!keepRemote)try{await bank.child('users/'+actor+'/session').transaction(session=>session&&session.token===token?null:session)}catch(error){}
  Object.assign(state,{actor:null,actorUser:null,sessionToken:null,impersonation:null,username:null,user:null,users:{},transactions:[],notes:[],cart:[],merchant:null,requests:[],loans:[],gifts:[],vouchers:[],holdings:{},adminRefs:[],adminActive:false,allLoans:{},stats:{},audit:[]});
  pickAll('.modal').forEach(modal=>modal.classList.remove('open'));
  pick('#app').classList.remove('imp-on');pick('#impBar').classList.add('hide');
  pick('#app').classList.add('hide');pick('#auth').classList.add('on');
  pick('#lp').value='';pick('#rp').value='';
  state.loggingOut=false;
},
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

async profile(){const u={name:pick('#pName').value.trim()||state.username,addr:pick('#pAddr').value.trim()},p=pick('#pPass').value;if(p){if(state.impersonation)return showToast('Use account tools to change credentials','error');if(p.length<6)return showToast('Password needs 6+ characters','error');u.ph=await hashPassword(state.username,p);if(state.username===state.actor)localStorage.setItem('skb',JSON.stringify({u:state.username,h:u.ph,t:state.sessionToken}))}
await bank.child('users/'+state.username).update(u);pick('#pPass').value='';showToast('Saved','success')},
async apply(){const b=pick('#mBiz').value.trim(),c=pick('#mCat').value.trim();if(!b||!c)return showToast('Enter business name and sector','error');await bank.child('merchants/'+state.username).set({status:'pending',biz:b,cat:c,ts:Date.now()});showToast('Submitted','success')},
itemOpen:()=>toggleModal('item'),
async itemSave(){const n=pick('#iName').value.trim(),p=roundCents(pick('#iPrice').value);if(!n||!(p>0))return showToast('Enter name and price','error');const id='i'+Date.now().toString(36);await bank.child('merchants/'+state.username+'/items/'+id).set({id,n,p});toggleModal('item',false);pick('#iName').value='';pick('#iPrice').value='';showToast('Saved','success')},
itemDel:t=>bank.child('merchants/'+state.username+'/items/'+t.dataset.id).remove(),
add(t){const i=state.merchant.items[t.dataset.id],c=state.cart.find(x=>x.id===i.id);c?c.q++:state.cart.push({id:i.id,n:i.n,p:i.p,q:1});renderCart()},
cartDel:t=>{state.cart.splice(+t.dataset.i,1);renderCart()},
cartClear:()=>{state.cart=[];renderCart()},
async qr(){if(!state.cart.length)return showToast('Cart is empty','error');const{net:sub,tax,total:tot,discount}=cartTotals();
for(let i=0;i<6;i++){const c=randomCode(),inv={m:state.username,biz:state.merchant.biz,items:state.cart.map(({n,p,q})=>({n,p,q})),sub,tax,tot,discount,voucher:state.posVoucher?state.posVoucher.code:null,voucherTo:state.posVoucher?state.posVoucher.to:null,ts:Date.now()+(state.serverOffset||0),st:'open'};
if((await bank.child('invoices/'+c).transaction(v=>v?undefined:inv)).committed){const q=pick('#qrBox');q.innerHTML='';new QRCode(q,{text:c,width:190,height:190,colorDark:'#06214f',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.H});setText('qrCode',c);setText('qrTot',formatMoney(tot));pick('#qr').classList.remove('paid');setText('qrSt','Awaiting payment');toggleModal('qr');
const ref=bank.child('invoices/'+c);state.activeVoucher=c;const h=ref.on('value',s=>{const v=s.val();if(!v){ref.off('value',h);state.stopVoucherWatch=null;state.activeVoucher=null;pick('#qr').classList.add('paid');setText('qrSt','Paid');state.cart=[];state.posVoucher=null;renderCart();showToast('Payment received','success')}else if(v.st==='paid')setText('qrSt','Processing')});state.stopVoucherWatch=()=>ref.off('value',h);return}}showToast('Could not create code','error')},
scan(){toggleModal('scan');pick('#scCode').value='';pick('#scInfo').classList.add('hide');try{state.scanner=state.scanner||new Html5Qrcode('reader');state.scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:200,height:200}},x=>{stopScanner();loadInvoice(x)},()=>{}).catch(()=>{})}catch(e){}},
loadCode:()=>loadInvoice(pick('#scCode').value),
async pay(){const p=state.pendingPayment;if(!p||isFrozen())return;if(p.m===state.username)return showToast('Cannot pay yourself','error');
if(p.voucher&&!await voucherUsable(p))return;
const ref=bank.child('invoices/'+p.c),keep=ref.on('value',()=>{});let ok=false;try{await ref.once('value');ok=(await ref.transaction(v=>v&&v.st==='open'?{...v,st:'paid',by:state.username}:undefined)).committed}finally{ref.off('value',keep)}if(!ok)return showToast('Code expired or used','error');
if(!await adjustBalance('users/'+state.username+'/main',-p.tot)){await bank.child('invoices/'+p.c+'/st').set('open');return showToast('Insufficient balance','error')}
await adjustBalance('users/'+p.m+'/main',p.sub);await adjustBalance('vault/tax',p.tax);
await recordTransaction({type:'merchant',from:state.username,to:p.m,fromName:state.user.name,toName:p.biz,amt:p.tot,tax:p.tax,net:p.sub,note:'Checkout',code:p.c,discount:p.discount||0,voucher:p.voucher||null,items:(p.items||[]).map(item=>({n:item.n,p:item.p,q:item.q})),p:[state.username,p.m]});
pushNotification(state.username,'merchant','Payment sent',`${formatMoney(p.tot)} to ${p.biz}`);pushNotification(p.m,'merchant','Sale received',`${formatMoney(p.sub)} from @${state.username}`);if(p.voucher)await redeemVoucher(p);await bank.child('invoices/'+p.c).remove();state.pendingPayment=null;toggleModal('scan',false);stopScanner();showToast('Paid '+formatMoney(p.tot),'success')},
async mint(){const a=roundCents(pick('#aAmt').value);if(!(a>0))return showToast('Enter amount','error');await adjustBalance('vault/reserve',a);await adjustBalance('vault/minted',a);await recordTransaction({type:'mint',from:'SK Bank',to:'Reserve',fromName:'Mint',toName:'Reserve',amt:a,net:a,note:'Issuance',p:[]});pick('#aAmt').value='';showToast('Issued '+formatMoney(a),'success')},
async burn(){const a=roundCents(pick('#aAmt').value);if(!(a>0))return showToast('Enter amount','error');if(!await adjustBalance('vault/reserve',-a))return showToast('Exceeds reserve','error');await adjustBalance('vault/minted',-a);await recordTransaction({type:'mint',from:'Reserve',to:'SK Bank',fromName:'Reserve',toName:'Burn',amt:a,net:a,note:'Retirement',p:[]});pick('#aAmt').value='';showToast('Retired '+formatMoney(a),'success')},
async sweep(){const t=state.vault.tax;if(!(t>0))return showToast('Nothing to move','info');if(await adjustBalance('vault/tax',-t)){await adjustBalance('vault/reserve',t);showToast('Moved '+formatMoney(t),'success')}},
async rates(){const v={apr:+pick('#rApr').value,sales:+pick('#rSales').value,xfer:+pick('#rXfer').value,wage:+pick('#rWage').value,loanApr:+pick('#rLoan').value,dailyBase:+pick('#rDaily').value,termApr:+pick('#rTerm').value};if(Object.values(v).some(x=>isNaN(x)||x<0||x>100))return showToast('Rates must be 0–100','error');await bank.child('vault').update(v);showToast('Saved','success')},
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
  pick('#soundSwitch').classList.toggle('on',localStorage.getItem('skb-sound')!=='off');
  const hasPin=Boolean(state.user&&state.user.pinHash);
  setText('pinStatus',hasPin?'On':'Off');
  pick('#pinNotice').classList.toggle('hide',hasPin);
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
async function authorizePayment(title='Enter PIN'){
  if(state.impersonation)return true;
  if(!state.user.pinHash){
    ['send','scan','request'].forEach(id=>toggleModal(id,false));
    stopScanner();
    showView('profile');
    const row=pick('#pinRow');
    row.classList.remove('attention');
    void row.offsetWidth;
    row.classList.add('attention');
    showToast('Set up your transaction PIN in Profile before making payments','error');
    return false;
  }
  return confirmPin(title);
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
  if(isReady()&&!await authorizePayment())return;
  return action(target,event);
};
actions.send=withPin(actions.send,()=>pick('#sTo').value.trim()&&roundCents(pick('#sAmt').value)>0&&!state.user.frozen);
actions.pay=withPin(actions.pay,()=>state.pendingPayment&&!state.user.frozen);

async function transferMoney(to,amount,note){
  const me=state.username;
  if(to===me){showToast('Choose another account','error');return false}
  const recipient=(await bank.child('users/'+to).once('value')).val();
  if(!recipient){showToast('Account not found','error');return false}
  const tax=roundCents(amount*state.vault.xfer/100*(1-tierOf(state.user).feeDiscount/100)),net=roundCents(amount-tax);
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
  const held=(vault.marketHolding||0)+(vault.escrow||0)+(vault.giftHolding||0)+users.reduce((sum,user)=>sum+(user.term&&user.term.status==='active'?user.term.principal:0),0);
  const total=Math.max(personal+savings+vault.reserve+vault.tax+held,1);
  const parts=[['s1','Accounts',personal],['s2','Savings',savings],['s3','Reserve',vault.reserve],['s4','Tax vault',vault.tax],['s5','Held',held]];
  pick('#econBar').innerHTML=`<div class="bar">${parts.map(([style,,value])=>`<i class="${style}" style="width:${(Math.max(value,0)/total*100).toFixed(2)}%"></i>`).join('')}</div><div class="dist-legend">${parts.map(([style,label,value])=>`<span><i class="${style}"></i>${label} ${formatMoney(value)}</span>`).join('')}</div>`;
  const tiles=[
    ['Accounts',String(users.length)],['Merchants',String(merchants)],['Payments',String(stats.txCount||0)],['Payment volume',formatMoney(stats.volume)],
    ['Tax collected',formatMoney(stats.taxCollected)],['Wages paid',formatMoney(stats.wagesPaid)],['Interest paid',formatMoney(stats.interestPaid)],['Fines & fees',formatMoney(stats.finesCollected)],
    ['Loans issued',formatMoney(stats.loansIssued)],['Loans outstanding',formatMoney(outstanding)],['Loans repaid',formatMoney(stats.loansRepaid)],['Rewards paid',formatMoney(stats.rewardsPaid)],['Exchange volume',formatMoney(stats.tradeVolume)],['Average balance',formatMoney(users.length?(personal+savings)/users.length:0)]
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
      +line('Subtotal',plainAmount((tx.net??tx.amt)+(tx.discount||0)))+(tx.discount?line('Voucher '+escapeHtml(tx.voucher||''),'-'+plainAmount(tx.discount)):'')+line(`Sales tax (${rate}%)`,plainAmount(tx.tax||0))+rule
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
function receiptPageHeightMm(area){
  area.classList.add('measuring');
  const millimetres=Math.ceil(area.scrollHeight*25.4/96)+6;
  area.classList.remove('measuring');
  return Math.max(millimetres,90);
}
function printDocument(markup,paper='a4'){
  const area=pick('#printArea');
  let pageStyle=pick('#printPage');
  if(!pageStyle){pageStyle=document.createElement('style');pageStyle.id='printPage';document.head.append(pageStyle)}
  area.innerHTML=markup;
  pageStyle.textContent=paper==='receipt'?`@page{size:80mm ${receiptPageHeightMm(area)}mm;margin:0}`:'@page{margin:12mm}';
  const clear=()=>{area.innerHTML='';pageStyle.textContent='';removeEventListener('afterprint',clear)};
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
    if(!await authorizePayment())return;
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
    if(!await authorizePayment())return;
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
    if(!await authorizePayment())return;
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
  receiptPrint(){if(state.selectedTx)printDocument(receiptMarkup(state.selectedTx),'receipt')}
});
['#loanAmt','#loanWeeks'].forEach(selector=>pick(selector).addEventListener('input',renderLoanPreview));

const contextListeners=[];
const privilegeCatalog=[['viewAs','View user dashboards'],['actAs','Act as a user'],['users','Manage accounts'],['credentials','Reset PIN and password'],['fines','Fines and fees'],['merchants','Merchant approvals'],['loans','Loan decisions'],['money','Issue and retire currency'],['rates','Rates and policy'],['economy','Economy dashboard'],['audit','Audit log'],['announce','Announcements'],['market','Exchange moderation']];
Object.assign(state,{actor:null,actorUser:null,sessionToken:null,impersonation:null,market:{},jobs:[],holdings:{},gifts:[],vouchers:[],merchantVouchers:{},devices:{},audit:[],knownNotes:null,lastLevel:null,posVoucher:null,form:null,cardRevealed:false,openingGift:null,ensuringAssets:false});

const isStaff=user=>Boolean(user&&(user.role==='admin'||Object.values(user.privileges||{}).some(Boolean)));
const canDo=(user,spec)=>Boolean(user&&(user.role==='admin'||String(spec).split('|').some(key=>key!=='admin'&&user.privileges&&user.privileges[key])));
async function hasPrivilege(spec){
  const snapshot=await bank.child('users/'+state.actor).once('value');
  return canDo(snapshot.val(),spec);
}
function applyPrivilegeVisibility(root=document){
  root.querySelectorAll('[data-priv]').forEach(element=>element.classList.toggle('hide',!canDo(state.actorUser,element.dataset.priv)));
}
function renderAdminAccess(){
  const staff=isStaff(state.actorUser)&&!state.impersonation;
  pickAll('.adm').forEach(element=>element.classList.toggle('hide',!staff));
  applyPrivilegeVisibility(pick('#admin'));
  if(!staff&&pick('#admin').classList.contains('on'))showView('home');
}

const randomToken=length=>[...crypto.getRandomValues(new Uint8Array(length))].map(value=>'abcdefghjkmnpqrstuvwxyz23456789'[value%31]).join('');
function deviceIdentity(){
  let id=localStorage.getItem('skb-device');
  if(!id){id=randomToken(10);localStorage.setItem('skb-device',id)}
  const agent=navigator.userAgent;
  const browser=/Edg\//.test(agent)?'Edge':/OPR\//.test(agent)?'Opera':/SamsungBrowser/.test(agent)?'Samsung Internet':/Firefox\//.test(agent)?'Firefox':/Chrome\//.test(agent)?'Chrome':/Safari\//.test(agent)?'Safari':'Browser';
  const system=/Windows/.test(agent)?'Windows':/Android/.test(agent)?'Android':/iPhone|iPad|iPod/.test(agent)?'iOS':/Mac OS X/.test(agent)?'macOS':/Linux/.test(agent)?'Linux':'unknown system';
  return{id,label:`${browser} on ${system}`};
}
const serverNow=()=>Date.now()+(state.serverOffset||0);
function ago(time){
  const seconds=Math.max(0,Math.round((serverNow()-time)/1e3));
  if(seconds<60)return'just now';
  if(seconds<3600)return Math.round(seconds/60)+' min ago';
  if(seconds<86400)return Math.round(seconds/3600)+' h ago';
  return Math.round(seconds/86400)+' d ago';
}
async function establishSession(username){
  const device=deviceIdentity(),token=randomToken(18),now=serverNow();
  const registry=await bank.child('devices/'+username).once('value');
  const known=registry.val()&&registry.val()[device.id];
  await bank.update({
    ['users/'+username+'/session']:{token,deviceId:device.id,label:device.label,ts:now},
    ['devices/'+username+'/'+device.id]:{label:device.label,first:known?known.first:now,lastLogin:now,seen:now}
  });
  if(registry.exists()&&!known)pushNotification(username,'system','New device signed in',device.label);
  return token;
}
function forceSignOut(session){
  actions.logout({skipRemote:true});
  showToast(`Signed out: your account was opened on ${session.label||'another device'}`,'error');
}
function renderDevices(){
  const active=state.actorUser&&state.actorUser.session,thisDevice=deviceIdentity().id;
  const devices=Object.entries(state.devices||{}).map(([id,device])=>({id,...device})).sort((a,b)=>b.seen-a.seen);
  pick('#deviceList').innerHTML=devices.map(device=>{
    const isActive=active&&active.deviceId===device.id;
    return`<div class="row nr"><div class="ic sv">${ico('phone')}</div><div class="gr"><b>${escapeHtml(device.label)}${device.id===thisDevice?' · This device':''}</b><small>${isActive?'Active now':'Last active '+ago(device.seen)}</small><small>Signed in ${ago(device.lastLogin)}</small></div>${isActive?'<div class="btn sm danger" data-act="deviceSignOut">Sign out</div>':`<div class="x" data-act="deviceForget" data-id="${escapeHtml(device.id)}">${ico('x')}</div>`}</div>`;
  }).join('')||'<div class="empty">No devices</div>';
}
setInterval(()=>{
  if(state.actor&&!state.impersonation)bank.child('devices/'+state.actor+'/'+deviceIdentity().id+'/seen').set(serverNow());
},60000);

function logAudit(entry){
  return bank.child('audit').push({ts:serverNow(),actor:state.actor,...entry});
}
function renderAudit(){
  const list=pick('#auditList');
  if(!list)return;
  list.innerHTML=state.audit.map(entry=>`<div class="row nr"><div class="gr"><b>${escapeHtml(entry.actor)} → ${escapeHtml(entry.target||'system')}</b><small>${escapeHtml(entry.mode||'admin')} · ${escapeHtml(entry.action)}${entry.detail?' · '+escapeHtml(entry.detail):''}</small><small>${formatDate(entry.ts)}</small></div></div>`).join('')||'<div class="empty">No entries</div>';
}
function describeAdminAction(name){
  const value=selector=>{const element=pick(selector);return element?element.value.trim():''};
  const details={mint:()=>formatMoney(value('#aAmt')),burn:()=>formatMoney(value('#aAmt')),mgFund:()=>formatMoney(value('#mgAmt')),mgTake:()=>formatMoney(value('#mgAmt')),mgCharge:()=>`${formatMoney(value('#mgAmt'))} · ${value('#mgReason')}`,mgJob:()=>`${value('#mgT')} ${formatMoney(value('#mgW'))}`,mgMsg:()=>value('#mgM'),broadcast:()=>value('#bMsg'),rates:()=>['#rApr','#rSales','#rXfer','#rWage','#rLoan','#rDaily','#rTerm'].map(value).join('/')};
  return details[name]?details[name]():'';
}

async function confirmActorPin(){
  const hash=state.actorUser.pinHash;
  if(!hash){showToast('Set your own transaction PIN first','error');return false}
  const pin=await askPin('Admin PIN','Confirm to act as @'+state.impersonation.target);
  if(!pin)return false;
  if(await hashPassword('pin:'+state.actor,pin)===hash)return true;
  showToast('Incorrect PIN','error');
  return false;
}
function startImpersonation(target,mode){
  state.impersonation={target,mode,startedAt:serverNow()};
  logAudit({target,mode,action:'session started'});
  pickAll('.modal').forEach(modal=>modal.classList.remove('open'));
  enterContext(target);
  pick('#app').classList.add('imp-on');
  const bar=pick('#impBar');
  bar.classList.remove('hide');
  bar.classList.toggle('act',mode==='act');
  setText('impText',mode==='act'?`Acting as @${target}`:`Viewing @${target} · View only`);
  renderAdminAccess();
  showView('home');
}
function endImpersonation(){
  if(!state.impersonation)return;
  logAudit({target:state.impersonation.target,mode:state.impersonation.mode,action:'session ended'});
  state.impersonation=null;
  pick('#app').classList.remove('imp-on');
  pick('#impBar').classList.add('hide');
  enterContext(state.actor);
  renderAdminAccess();
  showView('admin');
}

function enterContext(username){
  contextListeners.forEach(ref=>ref.off());
  contextListeners.length=0;
  Object.assign(state,{username,user:null,transactions:[],notes:[],merchant:null,requests:[],loans:[],gifts:[],vouchers:[],merchantVouchers:{},holdings:{},cart:[],posVoucher:null,knownNotes:null,lastLevel:null});
  const watch=(ref,handler)=>{ref.on('value',handler);contextListeners.push(ref)};
  const items=snapshot=>Object.values(snapshot.val()||{});
  watch(bank.child('users/'+username),snapshot=>{
    const user=snapshot.val();
    if(!user)return state.impersonation?actions.impExit():actions.logout();
    state.user=user;
    renderUser();renderPreferences();
    if(!state.impersonation)accrueInterest();
  });
  watch(bank.child('userTx/'+username).limitToLast(150),snapshot=>{state.transactions=items(snapshot).sort((a,b)=>b.ts-a.ts);renderTx()});
  watch(bank.child('notes/'+username).limitToLast(100),snapshot=>{
    const notes=Object.entries(snapshot.val()||{}).map(([key,value])=>({k:key,...value})).sort((a,b)=>b.ts-a.ts);
    if(state.knownNotes&&!state.impersonation)notes.filter(note=>!state.knownNotes.has(note.k)&&/received|approved|reward|gift|refund|credited|prize|payout|matured/i.test(note.title)).forEach(()=>{playChaChing();celebrate()});
    state.knownNotes=new Set(notes.map(note=>note.k));
    state.notes=notes;renderNotes();
  });
  watch(bank.child('merchants/'+username),snapshot=>{state.merchant=snapshot.val();renderMerchant()});
  watch(bank.child('userRequests/'+username).limitToLast(60),snapshot=>{state.requests=items(snapshot).sort((a,b)=>b.ts-a.ts);renderRequests()});
  watch(bank.child('userLoans/'+username),snapshot=>{state.loans=items(snapshot).sort((a,b)=>b.ts-a.ts);renderLoans()});
  watch(bank.child('userGifts/'+username).limitToLast(40),snapshot=>{state.gifts=items(snapshot).sort((a,b)=>b.ts-a.ts);renderGifts()});
  watch(bank.child('userVouchers/'+username),snapshot=>{state.vouchers=items(snapshot).sort((a,b)=>b.ts-a.ts);renderVouchers()});
  watch(bank.child('vouchers/'+username),snapshot=>{state.merchantVouchers=snapshot.val()||{};renderVoucherManage()});
  watch(bank.child('userHoldings/'+username),snapshot=>{state.holdings=snapshot.val()||{};renderInvest();renderUserExtras()});
}

async function beginSession(username,passwordHash,resumeToken=null){
  state.actor=username;
  state.sessionToken=resumeToken||await establishSession(username);
  localStorage.setItem('skb',JSON.stringify({u:username,h:passwordHash,t:state.sessionToken}));
  pick('#auth').classList.remove('on');
  pick('#app').classList.remove('hide');
  showView('home');
  subscribe(bank.child('users/'+username),snapshot=>{
    const user=snapshot.val();
    if(!user||user.ph!==passwordHash)return actions.logout();
    if(user.session&&user.session.token!==state.sessionToken)return forceSignOut(user.session);
    state.actorUser=user;
    renderAdminAccess();renderDevices();adminSync();ensureAccountAssets(user);
  });
  subscribe(bank.child('devices/'+username),snapshot=>{state.devices=snapshot.val()||{};renderDevices()});
  subscribe(bank.child('network'),snapshot=>{state.network=snapshot.val()||{};renderNet();syncNetworkEntry()});
  subscribe(bank.child('jobs').limitToLast(100),snapshot=>{state.jobs=Object.values(snapshot.val()||{}).sort((a,b)=>b.ts-a.ts);renderJobs()});
  subscribe(bank.child('market'),snapshot=>{state.market=snapshot.val()||{};renderInvest();renderUserExtras();renderMarketAdmin()});
  enterContext(username);
}

function renderPrivilegeList(user){
  const granted=user.privileges||{};
  return privilegeCatalog.map(([key,label])=>`<div class="dd-item${granted[key]?' on':''}" data-act="privToggle" data-p="${key}">${label}</div>`).join('');
}
Object.assign(actions,{
  mgr(target){
    const user=state.users[target.dataset.u];
    if(!user)return;
    state.managedUser=user.u;
    const granted=Object.values(user.privileges||{}).filter(Boolean).length;
    pick('#mgBody').innerHTML=`<div class="mh"><div class="av">${escapeHtml(user.u[0].toUpperCase())}</div><div><b>${escapeHtml(user.name)}</b><small>@${escapeHtml(user.u)} · ${formatMoney(user.main)} · Savings ${formatMoney(user.savings)}</small></div></div>
<div class="two" data-priv="viewAs|actAs"><div class="btn outline" data-act="viewAs" data-priv="viewAs">${ico('eye')}View as</div><div class="btn secondary" data-act="actAs" data-priv="actAs">${ico('request')}Act as</div></div>
<div data-priv="users"><div class="sep"></div>
<label class="fld"><span>Amount</span><input id="mgAmt" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"></label>
<div class="two"><div class="btn secondary" data-act="mgFund">Credit</div><div class="btn outline" data-act="mgTake">Debit</div></div><div class="sep"></div>
<div class="two"><label class="fld"><span>Role</span><input id="mgT" placeholder="Teller" value="${escapeHtml(user.job?.title||'')}"></label><label class="fld"><span>Sector</span><input id="mgS" placeholder="Retail Banking" value="${escapeHtml(user.job?.sector||'')}"></label></div>
<label class="fld"><span>Wage</span><input id="mgW" placeholder="1850.00" type="number" inputmode="decimal" min="0" step="0.01" value="${user.job?.salary||''}"></label>
<div class="two"><div class="btn secondary" data-act="mgJob">Assign</div><div class="btn primary" data-act="mgPay">Pay Wage</div></div><div class="sep"></div>
<label class="fld"><span>Message</span><input id="mgM" placeholder="Your wage has been processed"></label>
<div class="two"><div class="btn outline" data-act="mgMsg">Send</div><div class="btn outline" data-act="mgFreeze">${user.frozen?'Unfreeze':'Freeze'}</div></div>
<div class="btn outline mt" data-act="mgFire">Remove Role</div></div>
<div data-priv="merchants"><div class="btn outline mt" data-act="mgMerch">Revoke Merchant</div></div>
<div data-priv="fines"><div class="sep"></div>
<label class="fld"><span>Fine / Fee</span><input id="mgReason" placeholder="Overdue loan repayment"></label>
<div class="two"><div class="btn outline" data-act="mgCharge" data-kind="fine">Issue Fine</div><div class="btn outline" data-act="mgCharge" data-kind="fee">Charge Fee</div></div></div>
<div data-priv="credentials"><div class="sep"></div>
<div class="two"><label class="fld"><span>New PIN</span><input id="mgNewPin" inputmode="numeric" maxlength="6" placeholder="4 to 6 digits"></label><label class="fld"><span>New password</span><input id="mgNewPassword" placeholder="6+ characters"></label></div>
<div class="two"><div class="btn outline" data-act="mgSetPin">Set PIN</div><div class="btn outline" data-act="mgSetPassword">Set Password</div></div>
<div class="btn outline mt" data-act="mgResetPin">Remove PIN</div></div>
<div data-priv="admin"><div class="sep"></div>
<div class="dd"><div class="dd-head" data-act="ddToggle"><span>Privileges</span><b id="ddCount">${granted} selected</b></div><div id="ddList" class="dd-list hide">${renderPrivilegeList(user)}</div></div>
<div class="btn secondary" data-act="mgPrivileges">Save Privileges</div>
<div class="btn danger" data-act="mgRole">${user.role==='admin'?'Demote to User':'Promote to Admin'}</div></div>`;
    applyPrivilegeVisibility(pick('#mgBody'));
    toggleModal('mg');
  },
  ddToggle:()=>pick('#ddList').classList.toggle('hide'),
  privToggle(target){
    target.classList.toggle('on');
    setText('ddCount',pickAll('#ddList .dd-item.on').length+' selected');
  },
  async mgPrivileges(){
    const privileges={};
    pickAll('#ddList .dd-item.on').forEach(item=>privileges[item.dataset.p]=true);
    await bank.child('users/'+state.managedUser+'/privileges').set(Object.keys(privileges).length?privileges:null);
    pushNotification(state.managedUser,'system','Access updated',Object.keys(privileges).length?'You have been given staff access':'Your staff access was removed');
    toggleModal('mg',false);
    showToast('Privileges saved','success');
  },
  viewAs:()=>startImpersonation(state.managedUser,'view'),
  async actAs(){
    if(state.managedUser==='admin')return showToast('The primary admin cannot be acted as','error');
    if(!state.actorUser.pinHash)return showToast('Set your own transaction PIN first','error');
    state.impersonation={target:state.managedUser,mode:'act'};
    const confirmed=await confirmActorPin();
    state.impersonation=null;
    if(confirmed)startImpersonation(state.managedUser,'act');
  },
  impExit:endImpersonation,
  async mgSetPin(){
    const pin=pick('#mgNewPin').value.trim();
    if(!/^\d{4,6}$/.test(pin))return showToast('PIN must be 4 to 6 digits','error');
    await bank.child('users/'+state.managedUser+'/pinHash').set(await hashPassword('pin:'+state.managedUser,pin));
    pushNotification(state.managedUser,'system','PIN changed','Your transaction PIN was updated by the bank');
    toggleModal('mg',false);
    showToast('PIN set','success');
  },
  async mgSetPassword(){
    const password=pick('#mgNewPassword').value;
    if(password.length<6)return showToast('Password needs 6+ characters','error');
    await bank.update({['users/'+state.managedUser+'/ph']:await hashPassword(state.managedUser,password),['users/'+state.managedUser+'/session']:null});
    toggleModal('mg',false);
    showToast('Password set. User signed out','success');
  },
  deviceSignOut:()=>actions.logout(),
  deviceForget:target=>bank.child('devices/'+state.actor+'/'+target.dataset.id).remove()
});

const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const localDay=(time=serverNow())=>Math.floor((time-new Date(time).getTimezoneOffset()*6e4)/864e5);
const awardXp=points=>bank.child('users/'+state.username+'/xp').transaction(value=>(value||0)+points);
const levelFor=xp=>Math.floor(Math.sqrt((xp||0)/50))+1;
const levelStart=level=>50*(level-1)**2;
const tiers=[{name:'Standard',min:0,aprBonus:0,feeDiscount:0,rewardBoost:1},{name:'Silver',min:1000,aprBonus:.25,feeDiscount:10,rewardBoost:1.1},{name:'Gold',min:10000,aprBonus:.5,feeDiscount:25,rewardBoost:1.25},{name:'Platinum',min:50000,aprBonus:1,feeDiscount:50,rewardBoost:1.5}];
const marketPrice=market=>market.poolCash/market.poolShares;
const holdingsValue=()=>Object.entries(state.holdings||{}).reduce((total,[symbol,holding])=>total+(state.market[symbol]?holding.shares*marketPrice(state.market[symbol]):0),0);
const netWorthOf=user=>roundCents((user.main||0)+(user.savings||0)+(user.term&&user.term.status==='active'?user.term.principal:0)+holdingsValue());
const tierOf=user=>[...tiers].reverse().find(tier=>netWorthOf(user)>=tier.min)||tiers[0];
const effectiveApr=()=>state.vault.apr+(state.user?tierOf(state.user).aprBonus:0);
const avatarOptions=['🦊','🐼','🦁','🐯','🐨','🐸','🦉','🐙','🦄','🐲','🚀','⭐'];
const titleOptions=[['Newcomer',1],['Regular',3],['Saver',5],['Investor',8],['Trusted Member',10],['Veteran',15],['Banker',20]];
const cardSkins=[['Blue',1],['Violet',3],['Green',6],['Midnight',10]];

let audioContext;
function playChaChing(){
  if(localStorage.getItem('skb-sound')==='off')return;
  try{
    audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
    const context=audioContext,start=context.currentTime;
    if(context.state==='suspended')context.resume();
    const noise=context.createBufferSource(),buffer=context.createBuffer(1,context.sampleRate*.12,context.sampleRate),data=buffer.getChannelData(0);
    for(let index=0;index<data.length;index++)data[index]=(Math.random()*2-1)*(1-index/data.length);
    const noiseGain=context.createGain();
    noise.buffer=buffer;noiseGain.gain.value=.12;noise.connect(noiseGain).connect(context.destination);noise.start(start);
    [[1318.5,.07],[1975.5,.17],[2637,.27]].forEach(([frequency,delay])=>{
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type='triangle';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,start+delay);gain.gain.linearRampToValueAtTime(.22,start+delay+.01);gain.gain.exponentialRampToValueAtTime(.001,start+delay+.55);
      oscillator.connect(gain).connect(context.destination);oscillator.start(start+delay);oscillator.stop(start+delay+.6);
    });
  }catch(error){}
}
function celebrate(){
  const box=pick('#confetti'),colors=['#47e6ff','#8b7bff','#f0c85a','#3cf5a5','#ff6b81'];
  for(let index=0;index<36;index++){
    const piece=document.createElement('i');
    piece.className='confetti-piece';
    piece.style.cssText=`left:${Math.random()*100}%;background:${colors[index%5]};--dx:${(Math.random()-.5)*160}px;--rot:${Math.random()*720}deg;animation-delay:${Math.random()*.25}s`;
    box.append(piece);
    setTimeout(()=>piece.remove(),2400);
  }
}

const luhnDigit=payload=>{
  let sum=0;
  [...payload].reverse().forEach((digit,index)=>{let value=+digit;if(index%2===0){value*=2;if(value>9)value-=9}sum+=value});
  return(10-sum%10)%10;
};
function generateCard(){
  const body='4'+[...crypto.getRandomValues(new Uint8Array(14))].map(value=>value%10).join('');
  const now=new Date();
  return{number:body+luhnDigit(body),expiry:String(now.getMonth()+1).padStart(2,'0')+'/'+String((now.getFullYear()+4)%100).padStart(2,'0'),cvv:String(100+crypto.getRandomValues(new Uint16Array(1))[0]%900),frozen:false,limit:500,skin:0};
}
async function createPersonalQr(username){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<6;attempt++){
    const code='SKU'+[...crypto.getRandomValues(new Uint8Array(8))].map(value=>alphabet[value%alphabet.length]).join('');
    if((await bank.child('qrcodes/'+code).transaction(existing=>existing?undefined:username)).committed){
      await bank.child('users/'+username+'/personalQr').set(code);
      return code;
    }
  }
}
async function ensureAccountAssets(user){
  if(state.impersonation||state.ensuringAssets||user.u!==state.actor)return;
  state.ensuringAssets=true;
  try{
    if(!user.personalQr)await createPersonalQr(user.u);
    if(!user.card)await bank.child('users/'+user.u+'/card').set(generateCard());
  }finally{state.ensuringAssets=false}
}
async function payPersonalQr(code){
  const username=(await bank.child('qrcodes/'+code).once('value')).val();
  if(!username)return showToast('Unknown QR code','error');
  if(username===state.username)return showToast('That is your own code','info');
  toggleModal('scan',false);
  stopScanner();
  pick('#sTo').value=username;
  toggleModal('send');
}

function openForm({title,fields,submit='Confirm',hint='',onChange=null,onSubmit}){
  state.form={fields,onChange,onSubmit};
  setText('formTitle',title);
  setText('formSubmit',submit);
  pick('#formBody').innerHTML=fields.map(field=>{
    if(field.type==='html')return field.html;
    if(field.type==='choice'){
      const selected=field.value??field.options[0].v;
      return`<div class="fld"><span>${field.label}</span></div><div class="choices" data-field="${field.id}">${field.options.map(option=>`<div class="rg${selected===option.v?' on':''}${option.locked?' locked':''}${option.cls?' sw '+option.cls:''}" data-act="formChoice" data-v="${escapeHtml(String(option.v))}">${option.cls?'':escapeHtml(option.label)}</div>`).join('')}</div>`;
    }
    return`<label class="fld"><span>${field.label}</span><input id="f_${field.id}" type="${field.type||'text'}"${field.mode?` inputmode="${field.mode}"`:''}${field.attrs?' '+field.attrs:''} placeholder="${escapeHtml(field.placeholder||'')}" value="${escapeHtml(field.value??'')}" autocomplete="off"></label>`;
  }).join('');
  setText('formHint',hint);
  toggleModal('form');
}
function formValues(){
  const values={};
  state.form.fields.forEach(field=>{
    if(field.type==='html')return;
    if(field.type==='choice'){const selected=pick(`#formBody .choices[data-field="${field.id}"] .rg.on`);values[field.id]=selected?selected.dataset.v:''}
    else values[field.id]=pick('#f_'+field.id).value.trim();
  });
  return values;
}
function updateFormHint(){
  if(state.form&&state.form.onChange)setText('formHint',state.form.onChange(formValues())||'');
}
document.addEventListener('input',event=>{if(event.target.closest&&event.target.closest('#formBody'))updateFormHint()});

const dailyPattern=[1,1,2,2,3,3,5];
function normalizeDaily(daily,today){
  const last=daily.lastDay??null;
  let streak=daily.streak||0,week=daily.week||1;
  if(last===today)return{streak,week,claimedToday:true};
  if(last===null||today-last>1){streak=0;week=1}
  else if(streak>=7){streak=0;week+=1}
  return{streak,week,claimedToday:false};
}
const dailyAmount=(day,week)=>roundCents(state.vault.dailyBase*dailyPattern[day-1]*(1+.25*Math.min(week-1,9))*tierOf(state.user).rewardBoost);
function renderDaily(){
  const status=normalizeDaily(state.user.daily||{},localDay());
  const cells=dailyPattern.map((_,index)=>{
    const day=index+1,done=day<=status.streak,current=!status.claimedToday&&day===status.streak+1;
    return`<div class="day${done?' done':''}${current?' today':''}"><span>${done?'✓':'Day '+day}</span><b>${plainAmount(dailyAmount(day,status.week))}</b></div>`;
  }).join('');
  const action=status.claimedToday?'<div class="btn outline disabled">Claimed · come back tomorrow</div>':`<div class="btn primary" data-act="claimDaily">Claim ${formatMoney(dailyAmount(status.streak+1,status.week))}</div>`;
  const markup=`<div class="days">${cells}</div><div class="loan-meta"><span>Week ${status.week}${status.week>1?' · +'+(Math.min(status.week-1,9)*25)+'% bonus':''}</span><span>Miss a day and it resets</span></div>${action}`;
  pick('#dailyBody').innerHTML=markup;
  pick('#dailyMini').innerHTML=markup;
}
const spinPrizes=[.1,.25,.1,.5,.25,1,.1,5],spinWeights=[22,18,22,12,18,6,22,2];
function wheelMarkup(){
  const slice=360/spinPrizes.length,point=(angle,radius)=>{const radians=(angle-90)*Math.PI/180;return[100+radius*Math.cos(radians),100+radius*Math.sin(radians)]};
  return`<svg id="wheel" class="wheel" viewBox="0 0 200 200">${spinPrizes.map((prize,index)=>{
    const[x1,y1]=point(index*slice-slice/2,96),[x2,y2]=point(index*slice+slice/2,96),[tx,ty]=point(index*slice,68);
    return`<path d="M100 100L${x1.toFixed(1)} ${y1.toFixed(1)}A96 96 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="${index%2?'#2a2f55':'#1c2142'}" stroke="rgba(255,255,255,.15)"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#e9eeff" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${index*slice} ${tx.toFixed(1)} ${ty.toFixed(1)})">${prize<1?prize.toFixed(2):prize}</text>`;
  }).join('')}<circle cx="100" cy="100" r="14" fill="#0b1226" stroke="#47e6ff"/></svg>`;
}
function renderSpin(){
  const body=pick('#spinBody');
  if(!body.querySelector('.wheel-wrap'))body.innerHTML=`<div class="wheel-wrap"><div class="wheel-pointer"></div>${wheelMarkup()}</div><div id="spinAction"></div>`;
  const spun=state.user.spinDay===localDay();
  pick('#spinAction').innerHTML=spun?'<div class="btn outline disabled">Spun today · come back tomorrow</div>':'<div class="btn secondary" data-act="spinWheel">Spin</div>';
}
function renderLevel(){
  const user=state.user,xp=user.xp||0,level=levelFor(xp),floor=levelStart(level),next=levelStart(level+1);
  const tier=tierOf(user),worth=netWorthOf(user),upcoming=tiers.find(item=>item.min>worth);
  pick('#levelBody').innerHTML=`<div class="level-top"><div><small>Level</small><h2>${level}</h2></div><span class="tag">${tier.name}</span></div>
<div class="progress"><i style="width:${Math.min(100,(xp-floor)/(next-floor)*100).toFixed(1)}%"></i></div>
<div class="loan-meta"><span>${xp-floor} / ${next-floor} XP</span><span>${upcoming?formatMoney(upcoming.min-worth)+' to '+upcoming.name:'Top tier'}</span></div>
<div class="perks"><span>+${tier.aprBonus}% savings APR</span><span>${tier.feeDiscount}% off transfer tax</span><span>${tier.rewardBoost}× rewards</span></div>`;
}
const groupedNumber=number=>number.replace(/(.{4})/g,'$1 ').trim();
function renderCard(){
  const card=state.user.card;
  if(!card)return;
  const level=levelFor(state.user.xp),revealed=state.cardRevealed;
  pick('#cardBody').innerHTML=`<div class="vcard c${card.skin||0}${card.frozen?' frozen':''}"><div class="sp"><b>SK Bank</b><span class="tag">${card.frozen?'Frozen':'Virtual'}</span></div><div class="chip-icon"></div><div class="pan">${revealed?groupedNumber(card.number):'•••• •••• •••• '+card.number.slice(-4)}</div><div class="meta"><span>${escapeHtml(state.user.name.toUpperCase())}</span><span>${revealed?'EXP '+card.expiry+' · CVV '+card.cvv:'EXP '+card.expiry}</span></div></div>
<div class="prefs mt"><div class="pref" data-act="cardFreeze"><span>Freeze card</span><div class="switch${card.frozen?' on':''}"></div></div><div class="pref" data-act="cardLimit"><span>Daily limit</span><em>${formatMoney(card.limit)}</em><b>Edit</b></div><div class="pref" data-act="cardReveal"><span>${revealed?'Hide details':'Show card details'}</span></div></div>
<div class="choices mt">${cardSkins.map(([name,required],index)=>`<div class="rg${(card.skin||0)===index?' on':''}${level<required?' locked':''}" data-act="cardSkin" data-s="${index}">${name}${level<required?' · Lv '+required:''}</div>`).join('')}</div>`;
}
function cardAllows(amount){
  const card=state.user.card;
  if(!card)return true;
  if(card.frozen){showToast('Your card is frozen','error');return false}
  const startOfDay=new Date().setHours(0,0,0,0);
  const spent=state.transactions.filter(tx=>tx.type==='merchant'&&tx.from===state.username&&tx.ts>=startOfDay).reduce((total,tx)=>total+tx.amt,0);
  if(spent+amount>card.limit){showToast('Daily card limit reached','error');return false}
  return true;
}
const termOptions=[{days:7,delta:-1},{days:30,delta:0},{days:90,delta:1},{days:180,delta:2}];
const termRate=option=>Math.max(0,state.vault.termApr+option.delta);
function renderDeposit(){
  const term=state.user.term,active=term&&term.status==='active';
  if(!active){
    pick('#depositBody').innerHTML=`<div class="tiles">${termOptions.map(option=>`<div class="tile"><small>${option.days} days</small><b>${termRate(option).toFixed(1)}%</b></div>`).join('')}</div><div class="btn primary" data-act="termOpen">Open a term deposit</div>`;
    return;
  }
  const matured=serverNow()>=term.matures,share=Math.min(100,(serverNow()-term.start)/(term.matures-term.start)*100),interest=roundCents(term.principal*term.apr/100*term.days/365);
  pick('#depositBody').innerHTML=`<div class="loan-top"><div><small>Locked</small><h2>${formatMoney(term.principal)}</h2></div><span class="tag${matured?' ok':''}">${matured?'Matured':term.apr.toFixed(1)+'% APR'}</span></div><div class="progress"><i style="width:${share.toFixed(1)}%"></i></div><div class="loan-meta"><span>${term.days} days · +${formatMoney(interest)}</span><span>${matured?'Ready':'Matures '+shortDay(term.matures)}</span></div>${matured?'<div class="btn primary" data-act="termCollect">Collect</div>':'<div class="btn outline disabled">Locked until maturity</div>'}`;
}
function renderGifts(){
  const pending=state.gifts.filter(gift=>gift.to===state.username&&gift.status==='wrapped');
  pick('#giftsCard').classList.toggle('hide',!pending.length);
  pick('#giftList').innerHTML=pending.map(gift=>`<div class="row"><div class="ic in">${escapeHtml(gift.theme||'🎁')}</div><div class="gr"><b>${escapeHtml(gift.fromName)}</b><small>sent you a gift</small></div><div class="btn sm primary" data-act="giftView" data-id="${gift.id}">Open</div></div>`).join('');
}
const saveGift=gift=>bank.update({['userGifts/'+gift.from+'/'+gift.id]:gift,['userGifts/'+gift.to+'/'+gift.id]:gift});
async function sendGift({to,amount,message,theme}){
  const recipient=to.toLowerCase().replace(/^@/,''),value=roundCents(amount),me=state.username;
  if(!recipient||!(value>0)){showToast('Enter recipient and amount','error');return false}
  if(recipient===me){showToast('Choose another account','error');return false}
  const target=(await bank.child('users/'+recipient).once('value')).val();
  if(!target){showToast('Account not found','error');return false}
  if(isFrozen()||!await authorizePayment())return false;
  if(!await adjustBalance('users/'+me+'/main',-value)){showToast('Insufficient balance','error');return false}
  await adjustBalance('vault/giftHolding',value);
  await saveGift({id:'G'+Date.now().toString(36).toUpperCase(),from:me,fromName:state.user.name,to:recipient,toName:target.name||recipient,amt:value,message:message.slice(0,80),theme,status:'wrapped',ts:serverNow()});
  await recordTransaction({type:'gift',from:me,to:recipient,fromName:state.user.name,toName:target.name||recipient,amt:value,net:value,note:'Gift sent',p:[me]});
  pushNotification(recipient,'transfers','You received a gift',`${state.user.name} sent you a gift`);
  showToast('Gift sent','success');
  return true;
}
function renderUserExtras(){
  const user=state.user;
  if(!user)return;
  ['hAv','pAv'].forEach(id=>{const element=pick('#'+id);if(!element)return;element.textContent=user.avatar||user.u[0].toUpperCase();element.classList.toggle('emoji',Boolean(user.avatar))});
  pick('#pBanner').className='banner b'+(user.banner||0);
  setText('pTitle',user.title||'');
  setText('apr',effectiveApr().toFixed(1)+'% APR');
  const level=levelFor(user.xp);
  if(state.lastLevel!==null&&level>state.lastLevel&&!state.impersonation){showToast('Level '+level+' reached','success');celebrate()}
  state.lastLevel=level;
  renderLevel();renderDaily();renderSpin();renderCard();renderDeposit();renderGifts();renderInvest();renderVouchers();renderJobs();renderDevices();
}

const voucherLabel=voucher=>voucher.kind==='percent'?voucher.value+'% off':formatMoney(voucher.value)+' off';
function renderVouchers(){
  pick('#vouchersBody').innerHTML=state.vouchers.map(voucher=>`<div class="row nr"><div class="ic sv">${ico('tag')}</div><div class="gr"><b>${escapeHtml(voucher.merchantName)} · ${escapeHtml(voucher.code)}</b><small>${escapeHtml(voucher.desc||voucherLabel(voucher))} · ${voucherLabel(voucher)}</small></div><span class="tag${voucher.status==='unused'?' ok':''}">${voucher.status==='unused'?'Unused':'Used'}</span></div>`).join('')||'<div class="empty">No vouchers</div>';
}
function renderVoucherManage(){
  const list=Object.values(state.merchantVouchers||{}).sort((a,b)=>b.ts-a.ts);
  pick('#voucherManage').innerHTML=list.map(voucher=>`<div class="row nr"><div class="gr"><b>${escapeHtml(voucher.code)} · @${escapeHtml(voucher.to)}</b><small>${escapeHtml(voucher.desc||'')} · ${voucherLabel(voucher)}</small>${voucher.status==='used'?`<small>Used by @${escapeHtml(voucher.usedBy)} · ${formatShortDate(voucher.usedAt)}</small>`:''}</div><span class="tag${voucher.status==='unused'?' ok':''}">${voucher.status==='unused'?'Unused':'Used'}</span><div class="x" data-act="voucherRemove" data-code="${escapeHtml(voucher.code)}">${ico('x')}</div></div>`).join('')||'<div class="empty">No vouchers</div>';
}
async function voucherUsable(invoice){
  const voucher=(await bank.child('vouchers/'+invoice.m+'/'+invoice.voucher).once('value')).val();
  if(!voucher||voucher.status!=='unused'||voucher.to!==state.username){showToast('This voucher is no longer valid','error');return false}
  return true;
}
async function redeemVoucher(invoice){
  const when=serverNow(),base='vouchers/'+invoice.m+'/'+invoice.voucher,mirror='userVouchers/'+state.username+'/'+invoice.m+'_'+invoice.voucher;
  await bank.update({[base+'/status']:'used',[base+'/usedBy']:state.username,[base+'/usedAt']:when,[mirror+'/status']:'used',[mirror+'/usedBy']:state.username,[mirror+'/usedAt']:when});
  pushNotification(invoice.m,'merchant','Voucher used',`${invoice.voucher} redeemed by @${state.username}`);
}
function cartTotals(){
  const subtotal=roundCents(state.cart.reduce((total,item)=>total+item.p*item.q,0)),voucher=state.posVoucher;
  const discount=voucher?Math.min(subtotal,roundCents(voucher.kind==='percent'?subtotal*voucher.value/100:voucher.value)):0;
  const net=roundCents(subtotal-discount),tax=roundCents(net*state.vault.sales/100);
  return{subtotal,discount,net,tax,total:roundCents(net+tax)};
}
function renderCart(){
  const totals=cartTotals();
  pick('#cart').innerHTML=state.cart.map((item,index)=>`<div class="row"><div class="gr"><b>${escapeHtml(item.n)}</b><small>${formatMoney(item.p)} × ${item.q}</small></div><b>${formatMoney(item.p*item.q)}</b><div class="x" data-act="cartDel" data-i="${index}">${ico('x')}</div></div>`).join('')||'<div class="empty">Empty</div>';
  setText('cSub',formatMoney(totals.subtotal));
  pick('#cDiscRow').classList.toggle('hide',!totals.discount);
  setText('cDisc','-'+formatMoney(totals.discount));
  setText('cTax',formatMoney(totals.tax));
  setText('cTot',formatMoney(totals.total));
}

const canPostJobs=()=>Boolean(state.user&&(state.user.role==='admin'||(state.merchant&&state.merchant.status==='approved')));
function renderJobs(){
  pick('#jobPostLink').classList.toggle('hide',!canPostJobs()||Boolean(state.impersonation&&state.impersonation.mode==='view'));
  const me=state.username;
  const visible=state.jobs.filter(job=>job.poster===me||job.worker===me||job.status==='open');
  const statusTag={open:'Open',taken:'In progress',submitted:'Awaiting approval',paid:'Paid',cancelled:'Cancelled'};
  pick('#jobsBody').innerHTML=visible.map(job=>{
    let controls='';
    if(job.status==='open')controls=job.poster===me?`<div class="btn sm outline" data-act="jobCancel" data-id="${job.id}">Cancel</div>`:`<div class="btn sm primary" data-act="jobAccept" data-id="${job.id}">Accept</div>`;
    else if(job.status==='taken'&&job.worker===me)controls=`<div class="btn sm primary" data-act="jobSubmit" data-id="${job.id}">Mark done</div>`;
    else if(job.status==='submitted'&&job.poster===me)controls=`<div class="btn sm primary" data-act="jobApprove" data-id="${job.id}">Pay</div><div class="x" data-act="jobReject" data-id="${job.id}">${ico('x')}</div>`;
    return`<div class="row nr"><div class="ic sv">${ico('briefcase')}</div><div class="gr"><b>${escapeHtml(job.title)} · ${formatMoney(job.pay)}</b><small>@${escapeHtml(job.poster)}${job.worker?' → @'+escapeHtml(job.worker):''} · ${statusTag[job.status]||job.status}</small>${job.desc?`<small>${escapeHtml(job.desc)}</small>`:''}</div><div class="row-actions">${controls}</div></div>`;
  }).join('')||'<div class="empty">No jobs right now</div>';
}
async function postJob({title,desc,pay}){
  const amount=roundCents(pay),me=state.username;
  if(!title||!(amount>0)){showToast('Enter a title and pay','error');return false}
  if(isFrozen()||!await authorizePayment())return false;
  if(!await adjustBalance('users/'+me+'/main',-amount)){showToast('Insufficient balance','error');return false}
  await adjustBalance('vault/escrow',amount);
  const id='J'+Date.now().toString(36).toUpperCase();
  await bank.child('jobs/'+id).set({id,poster:me,posterName:state.user.name,title,desc:desc.slice(0,120),pay:amount,status:'open',ts:serverNow()});
  await recordTransaction({type:'escrow',from:me,to:'SK Bank',fromName:state.user.name,toName:'Job escrow',amt:amount,net:amount,note:title,p:[me]});
  showToast('Job posted','success');
  return true;
}
const updateJob=(id,change)=>bank.child('jobs/'+id).transaction(job=>job?change(job):undefined);

const bannerOptions=[0,1,2,3,4,5,6,7].map(index=>({v:String(index),label:'',cls:'b'+index}));
const changeOf=market=>{const price=marketPrice(market);return market.dayOpen?(price-market.dayOpen)/market.dayOpen*100:0};
function sparkline(points){
  if(points.length<2)return'<svg class="spark" viewBox="0 0 100 40"></svg>';
  const values=points.map(point=>point.p),low=Math.min(...values),high=Math.max(...values),span=high-low||1;
  const path=points.map((point,index)=>`${index?'L':'M'}${(index/(points.length-1)*100).toFixed(1)} ${(36-(point.p-low)/span*32).toFixed(1)}`).join('');
  return`<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="${path}"/></svg>`;
}
function renderInvest(){
  if(!state.user)return;
  const markets=Object.values(state.market||{}).sort((a,b)=>b.volume-a.volume);
  const holdings=Object.entries(state.holdings||{}).filter(([symbol,holding])=>holding.shares>0&&state.market[symbol]);
  const total=holdings.reduce((sum,[symbol,holding])=>sum+holding.shares*marketPrice(state.market[symbol]),0);
  pick('#portfolioBody').innerHTML=holdings.length?`<div class="level-top"><div><small>Value</small><h2>${formatMoney(total)}</h2></div></div>`+holdings.map(([symbol,holding])=>{
    const price=marketPrice(state.market[symbol]),value=holding.shares*price,gain=holding.cost?value-holding.cost:0;
    return`<div class="row" data-act="marketTrade" data-s="${symbol}"><div class="gr"><b>${symbol} · ${holding.shares}</b><small>${formatMoney(price)} each${holding.locked?' · '+holding.locked+' locked':''}</small></div><b class="amt ${gain>=0?'pos':'down'}">${formatMoney(value)}</b></div>`;
  }).join(''):'<div class="empty">No holdings</div>';
  pick('#marketBody').innerHTML=markets.map(market=>{
    const change=changeOf(market);
    return`<div class="row" data-act="marketTrade" data-s="${market.symbol}"><div class="ic sv">${escapeHtml(market.symbol.slice(0,2))}</div><div class="gr"><b>${escapeHtml(market.symbol)} · ${escapeHtml(market.name)}</b><small>${market.status==='halted'?'Halted':formatMoney(marketPrice(market))}</small></div><b class="amt ${change>=0?'up':'down'}">${change>=0?'+':''}${change.toFixed(2)}%</b></div>`;
  }).join('')||'<div class="empty">No companies listed</div>';
  const listed=markets.find(market=>market.owner===state.username);
  const manage=pick('#companyManage');
  if(manage)manage.innerHTML=listed?`<div class="loan-top"><div><small>${escapeHtml(listed.symbol)}</small><h2>${formatMoney(marketPrice(listed))}</h2></div><span class="tag${changeOf(listed)>=0?' ok':' r'}">${changeOf(listed).toFixed(2)}%</span></div><div class="loan-meta"><span>${listed.totalShares} shares</span><span>${Math.round(listed.totalShares*.6)} held by you · locked</span></div>`:'<div class="loan-note"><span>List your business on the exchange</span><div class="btn sm secondary" data-act="companyList">List</div></div>';
}
function renderMarketAdmin(){
  const element=pick('#marketAdmin');
  if(!element)return;
  element.innerHTML=Object.values(state.market||{}).map(market=>`<div class="row nr"><div class="gr"><b>${escapeHtml(market.symbol)} · ${escapeHtml(market.name)}</b><small>${formatMoney(marketPrice(market))} · @${escapeHtml(market.owner)}</small></div><div class="btn sm outline" data-act="marketToggle" data-s="${market.symbol}">${market.status==='halted'?'Resume':'Halt'}</div></div>`).join('')||'<div class="empty">No companies</div>';
}
const buyCost=(market,shares)=>Math.ceil((market.poolCash*market.poolShares/(market.poolShares-shares)-market.poolCash)*100-1e-9)/100;
const sellPayout=(market,shares)=>Math.floor((market.poolCash-market.poolCash*market.poolShares/(market.poolShares+shares))*100+1e-9)/100;
function nextMarketState(market,poolShares,volume){
  const today=localDay(),price=marketPrice(market);
  return{...market,poolShares,poolCash:market.poolCash*market.poolShares/poolShares,dayKey:today,dayOpen:market.dayKey===today?market.dayOpen:price,volume:(market.volume||0)+volume};
}
const recordPrice=(symbol,market)=>bank.child('marketHistory/'+symbol).push({t:serverNow(),p:marketPrice(market)});
async function buyShares(symbol,shares){
  const me=state.username,quote=state.market[symbol];
  if(shares>Math.floor(quote.poolShares*.25)){showToast('Order too large','error');return false}
  const estimate=buyCost(quote,shares);
  if(!await adjustBalance('users/'+me+'/main',-estimate)){showToast('Insufficient balance','error');return false}
  let cost=0;
  const result=await bank.child('market/'+symbol).transaction(market=>{
    if(!market||market.status==='halted'||shares>=market.poolShares)return;
    const price=buyCost(market,shares);
    if(price>estimate+.005)return;
    cost=price;
    return nextMarketState(market,market.poolShares-shares,shares);
  });
  if(!result.committed){await adjustBalance('users/'+me+'/main',estimate);showToast('Price moved. Try again','error');return false}
  const refund=roundCents(estimate-cost);
  if(refund>0)await adjustBalance('users/'+me+'/main',refund);
  await adjustBalance('vault/marketHolding',cost);
  await bank.child('userHoldings/'+me+'/'+symbol).transaction(holding=>({shares:(holding?holding.shares:0)+shares,cost:roundCents((holding?holding.cost:0)+cost),locked:holding?holding.locked||0:0}));
  recordPrice(symbol,result.snapshot.val());
  await recordTransaction({type:'trade',from:me,to:'Exchange',fromName:state.user.name,toName:symbol+' shares',amt:cost,net:cost,note:`BUY ${shares} ${symbol} @ ${plainAmount(cost/shares)}`,p:[me]});
  awardXp(10);
  showToast(`Bought ${shares} ${symbol}`,'success');
  return true;
}
async function sellShares(symbol,shares){
  const me=state.username;
  let previous=null,payout=0;
  const removed=await bank.child('userHoldings/'+me+'/'+symbol).transaction(holding=>{
    previous=holding;
    if(!holding||holding.shares-(holding.locked||0)<shares)return;
    return{...holding,shares:holding.shares-shares,cost:roundCents(holding.cost*(holding.shares-shares)/holding.shares)};
  });
  if(!removed.committed){showToast('Not enough tradable shares','error');return false}
  const result=await bank.child('market/'+symbol).transaction(market=>{
    if(!market||market.status==='halted')return;
    payout=sellPayout(market,shares);
    return nextMarketState(market,market.poolShares+shares,shares);
  });
  if(!result.committed){await bank.child('userHoldings/'+me+'/'+symbol).set(previous);showToast('Trading is halted','error');return false}
  if(!await adjustBalance('vault/marketHolding',-payout))await adjustBalance('vault/reserve',-payout);
  await adjustBalance('users/'+me+'/main',payout);
  recordPrice(symbol,result.snapshot.val());
  await recordTransaction({type:'trade',from:'Exchange',to:me,fromName:symbol+' shares',toName:state.user.name,amt:payout,net:payout,note:`SELL ${shares} ${symbol} @ ${plainAmount(payout/shares)}`,p:[me]});
  awardXp(10);
  showToast(`Sold ${shares} ${symbol}`,'success');
  return true;
}

Object.assign(actions,{
  svcTab(target){
    pickAll('#svcTabs .rg').forEach(chip=>chip.classList.toggle('on',chip===target));
    pickAll('.svc').forEach(section=>section.classList.toggle('hide',section.id!=='svc-'+target.dataset.t));
  },
  svcOpen(target){showView('services');actions.svcTab(pick(`#svcTabs [data-t="${target.dataset.t}"]`))},
  formChoice(target){
    target.parentElement.querySelectorAll('.rg').forEach(chip=>chip.classList.toggle('on',chip===target));
    updateFormHint();
  },
  async formSubmit(){
    const result=await state.form.onSubmit(formValues());
    if(result!==false)toggleModal('form',false);
  },
  toggleSound(){
    const enabled=localStorage.getItem('skb-sound')!=='off';
    localStorage.setItem('skb-sound',enabled?'off':'on');
    renderPreferences();
    if(!enabled)playChaChing();
  },
  async claimDaily(){
    const today=localDay(),path='users/'+state.username+'/daily';
    let previous=null,status=null;
    const result=await bank.child(path).transaction(current=>{
      previous=current;
      const normalized=normalizeDaily(current||{},today);
      if(normalized.claimedToday)return;
      status=normalized;
      return{lastDay:today,streak:normalized.streak+1,week:normalized.week};
    });
    if(!result.committed)return showToast('Already claimed today','info');
    const amount=dailyAmount(status.streak+1,status.week);
    if(!await adjustBalance('vault/reserve',-amount)){await bank.child(path).set(previous);return showToast('Rewards are unavailable right now','error')}
    await adjustBalance('users/'+state.username+'/main',amount);
    await recordTransaction({type:'reward',from:'SK Bank',to:state.username,fromName:'Daily Reward',toName:state.user.name,amt:amount,net:amount,note:`Day ${status.streak+1} · Week ${status.week}`,p:[state.username]});
    awardXp(20);playChaChing();celebrate();
    showToast('Daily reward '+formatMoney(amount),'success');
  },
  async spinWheel(){
    const today=localDay(),path='users/'+state.username+'/spinDay';
    if(!(await bank.child(path).transaction(day=>day===today?undefined:today)).committed)return showToast('You already spun today','info');
    let roll=Math.random()*spinWeights.reduce((a,b)=>a+b,0),index=0;
    while(roll>spinWeights[index]){roll-=spinWeights[index];index++}
    const prize=spinPrizes[index];
    if(!await adjustBalance('vault/reserve',-prize)){await bank.child(path).set(null);return showToast('Prizes are unavailable right now','error')}
    await adjustBalance('users/'+state.username+'/main',prize);
    await recordTransaction({type:'reward',from:'SK Bank',to:state.username,fromName:'Daily Spin',toName:state.user.name,amt:prize,net:prize,note:'Daily spin',p:[state.username]});
    const wheel=pick('#wheel');
    wheel.style.transition='none';wheel.style.transform='rotate(0deg)';
    void wheel.getBoundingClientRect();
    wheel.classList.add('spinning');
    wheel.style.transform=`rotate(${360*5-index*(360/spinPrizes.length)}deg)`;
    await wait(4300);
    awardXp(5);playChaChing();celebrate();
    showToast('You won '+formatMoney(prize),'success');
  },
  async cardFreeze(){await bank.child('users/'+state.username+'/card/frozen').set(!state.user.card.frozen)},
  cardSkin(target){return bank.child('users/'+state.username+'/card/skin').set(Number(target.dataset.s))},
  async cardReveal(){
    if(state.cardRevealed){state.cardRevealed=false;return renderCard()}
    if(!await authorizePayment('Card details'))return;
    state.cardRevealed=true;renderCard();
    setTimeout(()=>{state.cardRevealed=false;if(state.user)renderCard()},15000);
  },
  cardLimit(){
    openForm({title:'Daily card limit',submit:'Save',fields:[{id:'limit',label:'Limit',type:'number',mode:'decimal',value:state.user.card.limit}],onSubmit:async values=>{
      const limit=roundCents(values.limit);
      if(!(limit>=0)){showToast('Enter a valid limit','error');return false}
      await bank.child('users/'+state.username+'/card/limit').set(limit);
      showToast('Limit saved','success');
    }});
  },
  termOpen(){
    openForm({title:'Term deposit',submit:'Lock funds',hint:'Cannot be withdrawn or added to until it matures',fields:[
      {id:'amount',label:'Amount',type:'number',mode:'decimal',placeholder:'1000.00'},
      {id:'days',type:'choice',label:'Term',options:termOptions.map(option=>({v:String(option.days),label:`${option.days} days · ${termRate(option).toFixed(1)}%`}))}
    ],onChange:values=>{
      const option=termOptions.find(item=>String(item.days)===values.days),amount=roundCents(values.amount);
      return amount>0&&option?`Interest at maturity ${formatMoney(amount*termRate(option)/100*option.days/365)}`:'';
    },onSubmit:async values=>{
      const option=termOptions.find(item=>String(item.days)===values.days),amount=roundCents(values.amount),me=state.username;
      if(!option||!(amount>0)){showToast('Enter an amount','error');return false}
      if(state.user.term&&state.user.term.status==='active'){showToast('You already have an active term deposit','error');return false}
      if(isFrozen()||!await authorizePayment())return false;
      if(!await adjustBalance('users/'+me+'/main',-amount)){showToast('Insufficient balance','error');return false}
      const now=serverNow(),term={principal:amount,apr:termRate(option),days:option.days,start:now,matures:now+option.days*864e5,status:'active'};
      if(!(await bank.child('users/'+me+'/term').transaction(current=>current&&current.status==='active'?undefined:term)).committed){await adjustBalance('users/'+me+'/main',amount);showToast('You already have an active term deposit','error');return false}
      await recordTransaction({type:'term',from:me,to:'SK Bank',fromName:state.user.name,toName:'Term Deposit',amt:amount,net:amount,note:`${option.days} days · ${term.apr.toFixed(1)}% APR`,p:[me]});
      showToast('Funds locked','success');
    }});
  },
  async termCollect(){
    const term=state.user.term,me=state.username;
    if(!term||term.status!=='active')return;
    if(serverNow()<term.matures)return showToast('Not matured yet','error');
    const interest=roundCents(term.principal*term.apr/100*term.days/365);
    if(!await adjustBalance('vault/reserve',-interest))return showToast('Bank reserve is low. Try again later','error');
    if(!(await bank.child('users/'+me+'/term').transaction(current=>current&&current.status==='active'?null:current)).committed){await adjustBalance('vault/reserve',interest);return}
    await adjustBalance('users/'+me+'/main',term.principal+interest);
    bank.child('network/'+me+'/nw').transaction(value=>Math.round(((+value||0)+interest)*1e8)/1e8);
    await recordTransaction({type:'term',from:'SK Bank',to:me,fromName:'Term Deposit',toName:state.user.name,amt:roundCents(term.principal+interest),net:roundCents(term.principal+interest),note:`Matured · interest ${plainAmount(interest)}`,p:[me]});
    pushNotification(me,'earnings','Term deposit matured',`${formatMoney(term.principal+interest)} returned`);
    awardXp(15);
  },
  giftSend(){
    openForm({title:'Send a gift',submit:'Send gift',fields:[
      {id:'to',label:'To',placeholder:'@username'},
      {id:'amount',label:'Amount',type:'number',mode:'decimal',placeholder:'25.00'},
      {id:'message',label:'Message',placeholder:'Happy birthday!',attrs:'maxlength="80"'},
      {id:'theme',type:'choice',label:'Wrapping',options:[{v:'🎁',label:'🎁 Gift'},{v:'🎂',label:'🎂 Birthday'},{v:'🎉',label:'🎉 Congrats'},{v:'💝',label:'💝 Thanks'}]}
    ],onSubmit:sendGift});
  },
  giftView(target){
    state.openingGift=target.dataset.id;
    pick('#giftStage').classList.remove('open','shake');
    pick('#giftReveal').innerHTML='';
    pick('#giftBtn').classList.remove('hide');
    toggleModal('giftOpen');
  },
  async giftUnwrap(){
    const gift=state.gifts.find(item=>item.id===state.openingGift),me=state.username;
    if(!gift||gift.status!=='wrapped')return;
    if(!(await bank.child('userGifts/'+me+'/'+gift.id+'/status').transaction(status=>status==='wrapped'?'opened':undefined)).committed)return;
    const stage=pick('#giftStage');
    stage.classList.add('shake');await wait(520);stage.classList.remove('shake');stage.classList.add('open');
    if(!await adjustBalance('vault/giftHolding',-gift.amt))await adjustBalance('vault/reserve',-gift.amt);
    await adjustBalance('users/'+me+'/main',gift.amt);
    await bank.update({['userGifts/'+gift.from+'/'+gift.id+'/status']:'opened',['userGifts/'+gift.from+'/'+gift.id+'/openedAt']:serverNow()});
    await recordTransaction({type:'gift',from:gift.from,to:me,fromName:gift.fromName,toName:state.user.name,amt:gift.amt,net:gift.amt,note:gift.message||'Gift',p:[me]});
    pushNotification(gift.from,'transfers','Gift opened',`${state.user.name} opened your gift`);
    pick('#giftReveal').innerHTML=`<h2>${formatMoney(gift.amt)}</h2><p>${escapeHtml(gift.message||'')}</p>`;
    pick('#giftBtn').classList.add('hide');
    playChaChing();celebrate();
  },
  myQr(){
    const code=state.user.personalQr;
    if(!code)return showToast('Your QR is being created','info');
    const box=pick('#myQrBox');
    box.innerHTML='';
    new QRCode(box,{text:code,width:190,height:190,colorDark:'#06214f',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.H});
    setText('myQrUser','@'+state.username);
    toggleModal('myQr');
  },
  identityOpen(){
    const user=state.user,level=levelFor(user.xp);
    const titles=titleOptions.filter(([,required])=>level>=required).map(([name])=>({v:name,label:name}));
    if(state.merchant&&state.merchant.status==='approved')titles.push({v:'Entrepreneur',label:'Entrepreneur'});
    openForm({title:'Customise profile',submit:'Save',fields:[
      {id:'avatar',type:'choice',label:'Avatar',value:user.avatar||'',options:[{v:'',label:'Initial'},...avatarOptions.map(avatar=>({v:avatar,label:avatar}))]},
      {id:'banner',type:'choice',label:'Banner',value:String(user.banner||0),options:bannerOptions},
      {id:'title',type:'choice',label:'Title',value:user.title||titles[0].v,options:titles}
    ],onSubmit:async values=>{
      await bank.child('users/'+state.username).update({avatar:values.avatar||null,banner:Number(values.banner),title:values.title});
      showToast('Saved','success');
    }});
  },
  voucherCreate(){
    if(!state.merchant||state.merchant.status!=='approved')return showToast('Merchants only','error');
    openForm({title:'New voucher',submit:'Send voucher',fields:[
      {id:'code',label:'Code',placeholder:'WELCOME10',attrs:'maxlength="16"'},
      {id:'to',label:'Send to',placeholder:'@username'},
      {id:'desc',label:'Description',placeholder:'Thanks for being a regular',attrs:'maxlength="60"'},
      {id:'kind',type:'choice',label:'Type',options:[{v:'percent',label:'Percent off'},{v:'amount',label:'Amount off'}]},
      {id:'value',label:'Value',type:'number',mode:'decimal',placeholder:'10'}
    ],onSubmit:async values=>{
      const code=values.code.toUpperCase().replace(/[^A-Z0-9-]/g,''),to=values.to.toLowerCase().replace(/^@/,''),value=roundCents(values.value),me=state.username;
      if(code.length<3){showToast('Code needs 3+ letters or numbers','error');return false}
      if(!(value>0)||(values.kind==='percent'&&value>100)){showToast('Enter a valid value','error');return false}
      if(!(await bank.child('users/'+to).once('value')).exists()){showToast('Account not found','error');return false}
      if((await bank.child('vouchers/'+me+'/'+code).once('value')).exists()){showToast('Code already exists','error');return false}
      const voucher={code,merchant:me,merchantName:state.merchant.biz,to,desc:values.desc,kind:values.kind,value,status:'unused',ts:serverNow()};
      await bank.update({['vouchers/'+me+'/'+code]:voucher,['userVouchers/'+to+'/'+me+'_'+code]:voucher});
      pushNotification(to,'merchant','New voucher',`${state.merchant.biz}: ${code} · ${voucherLabel(voucher)}`);
      showToast('Voucher sent','success');
    }});
  },
  voucherRemove(target){
    const voucher=state.merchantVouchers[target.dataset.code];
    if(!voucher)return;
    return bank.update({['vouchers/'+state.username+'/'+voucher.code]:null,['userVouchers/'+voucher.to+'/'+state.username+'_'+voucher.code]:null});
  },
  async posVoucherApply(){
    const code=pick('#posVoucher').value.trim().toUpperCase();
    if(!code){state.posVoucher=null;renderCart();return}
    const voucher=(await bank.child('vouchers/'+state.username+'/'+code).once('value')).val();
    if(!voucher||voucher.status!=='unused')return showToast('Voucher not valid','error');
    state.posVoucher=voucher;
    renderCart();
    showToast(`Voucher for @${voucher.to}`,'success');
  },
  jobPost(){
    openForm({title:'Post a job',submit:'Post and fund',hint:'Pay is held by the bank until you approve the work',fields:[
      {id:'title',label:'Title',placeholder:'Deliver 20 coffee orders'},
      {id:'desc',label:'Details',placeholder:'Saturday morning, Baneshwor',attrs:'maxlength="120"'},
      {id:'pay',label:'Pay',type:'number',mode:'decimal',placeholder:'60.00'}
    ],onSubmit:postJob});
  },
  async jobAccept(target){
    const me=state.username;
    const result=await updateJob(target.dataset.id,job=>job.status==='open'&&job.poster!==me?{...job,status:'taken',worker:me,workerName:state.user.name}:undefined);
    if(!result.committed)return showToast('Job is no longer available','error');
    showToast('Job accepted','success');
  },
  async jobSubmit(target){
    const me=state.username;
    if((await updateJob(target.dataset.id,job=>job.status==='taken'&&job.worker===me?{...job,status:'submitted'}:undefined)).committed){
      const job=state.jobs.find(item=>item.id===target.dataset.id);
      if(job)pushNotification(job.poster,'merchant','Job ready for review',job.title);
      showToast('Sent for approval','success');
    }
  },
  async jobReject(target){
    const me=state.username,job=state.jobs.find(item=>item.id===target.dataset.id);
    if((await updateJob(target.dataset.id,current=>current.status==='submitted'&&current.poster===me?{...current,status:'open',worker:null,workerName:null}:undefined)).committed&&job){
      pushNotification(job.worker,'merchant','Work not accepted',job.title);
      showToast('Job reopened','info');
    }
  },
  async jobCancel(target){
    const me=state.username,job=state.jobs.find(item=>item.id===target.dataset.id);
    if(!job||!(await updateJob(job.id,current=>current.status==='open'&&current.poster===me?{...current,status:'cancelled'}:undefined)).committed)return;
    if(!await adjustBalance('vault/escrow',-job.pay))await adjustBalance('vault/reserve',-job.pay);
    await adjustBalance('users/'+me+'/main',job.pay);
    await recordTransaction({type:'escrow',from:'SK Bank',to:me,fromName:'Job escrow',toName:state.user.name,amt:job.pay,net:job.pay,note:'Refund · '+job.title,p:[me]});
    showToast('Job cancelled','info');
  },
  async jobApprove(target){
    const me=state.username,job=state.jobs.find(item=>item.id===target.dataset.id);
    if(!job||!(await updateJob(job.id,current=>current.status==='submitted'&&current.poster===me?{...current,status:'paid'}:undefined)).committed)return;
    const tax=roundCents(job.pay*state.vault.wage/100),net=roundCents(job.pay-tax);
    if(!await adjustBalance('vault/escrow',-job.pay))await adjustBalance('vault/reserve',-job.pay);
    await adjustBalance('users/'+job.worker+'/main',net);
    if(tax)await adjustBalance('vault/tax',tax);
    await recordTransaction({type:'job',from:me,to:job.worker,fromName:state.user.name,toName:job.workerName,amt:job.pay,tax,net,note:job.title,p:[me,job.worker]});
    pushNotification(job.worker,'earnings','Job payment received',`${formatMoney(net)} for ${job.title}`);
    showToast('Paid '+formatMoney(job.pay),'success');
  },
  companyList(){
    if(!state.merchant||state.merchant.status!=='approved')return showToast('Merchants only','error');
    openForm({title:'List on the exchange',submit:'List company',hint:'You keep 60% of shares, locked. 40% is offered to the public',fields:[
      {id:'symbol',label:'Symbol',placeholder:'HJAVA',attrs:'maxlength="5"'},
      {id:'shares',label:'Total shares',type:'number',mode:'numeric',placeholder:'10000'},
      {id:'price',label:'Starting price',type:'number',mode:'decimal',placeholder:'2.50'}
    ],onSubmit:async values=>{
      const symbol=values.symbol.toUpperCase().replace(/[^A-Z]/g,''),total=Math.floor(+values.shares),price=roundCents(values.price),me=state.username;
      if(symbol.length<2||symbol.length>5){showToast('Symbol needs 2 to 5 letters','error');return false}
      if(!(total>=100&&total<=1e6)||!(price>0)){showToast('Shares 100 to 1,000,000 and a price','error');return false}
      if(Object.values(state.market).some(market=>market.owner===me)){showToast('You already listed a company','error');return false}
      const founder=Math.floor(total*.6),pool=total-founder;
      const market={symbol,name:state.merchant.biz,owner:me,totalShares:total,poolShares:pool,poolCash:roundCents(pool*price),dayKey:localDay(),dayOpen:price,volume:0,status:'open',ts:serverNow()};
      if(!(await bank.child('market/'+symbol).transaction(existing=>existing?undefined:market)).committed){showToast('Symbol already taken','error');return false}
      await bank.child('userHoldings/'+me+'/'+symbol).set({shares:founder,cost:0,locked:founder});
      recordPrice(symbol,market);
      showToast(symbol+' is now listed','success');
    }});
  },
  async marketTrade(target){
    const symbol=target.dataset.s,market=state.market[symbol];
    if(!market)return;
    const history=Object.values((await bank.child('marketHistory/'+symbol).limitToLast(40).once('value')).val()||{});
    const held=state.holdings[symbol],tradable=held?held.shares-(held.locked||0):0;
    openForm({title:`${symbol} · ${formatMoney(marketPrice(market))}`,submit:'Place order',fields:[
      {type:'html',html:sparkline(history)},
      {id:'side',type:'choice',label:'Order',options:[{v:'buy',label:'Buy'},{v:'sell',label:`Sell (${tradable})`}]},
      {id:'shares',label:'Shares',type:'number',mode:'numeric',placeholder:'10'}
    ],onChange:values=>{
      const shares=Math.floor(+values.shares),current=state.market[symbol];
      if(!(shares>0)||!current)return'';
      if(values.side==='buy')return shares<current.poolShares?`Cost ${formatMoney(buyCost(current,shares))}`:'Too many shares';
      return`Receive ${formatMoney(sellPayout(current,shares))}`;
    },onSubmit:async values=>{
      const shares=Math.floor(+values.shares);
      if(!(shares>0)){showToast('Enter shares','error');return false}
      if(state.market[symbol].status==='halted'){showToast('Trading is halted','error');return false}
      if(isFrozen()||!await authorizePayment())return false;
      return values.side==='buy'?buyShares(symbol,shares):sellShares(symbol,shares);
    }});
  },
  marketToggle(target){
    const symbol=target.dataset.s,market=state.market[symbol];
    if(market)return bank.child('market/'+symbol+'/status').set(market.status==='halted'?'open':'halted');
  }
});

const payBeforeCard=actions.pay;
actions.pay=async(target,event)=>{
  if(state.pendingPayment&&!cardAllows(state.pendingPayment.tot))return;
  return payBeforeCard(target,event);
};
const actionPrivileges={mint:'money',burn:'money',sweep:'money',rates:'rates',approve:'merchants',reject:'merchants',broadcast:'announce',mgr:'users|viewAs|actAs|credentials|fines',mgFund:'users',mgTake:'users',mgJob:'users',mgPay:'users',mgMsg:'users',mgFreeze:'users',mgFire:'users',mgMerch:'merchants',mgRole:'admin',mgPrivileges:'admin',mgCharge:'fines',mgResetPin:'credentials',mgSetPin:'credentials',mgSetPassword:'credentials',loanApprove:'loans',loanReject:'loans',viewAs:'viewAs',actAs:'actAs',marketToggle:'market'};
Object.entries(actionPrivileges).forEach(([name,requirement])=>{
  const original=actions[name];
  actions[name]=async(target,event)=>{
    if(state.impersonation)return showToast('Exit the account session first','error');
    if(!await hasPrivilege(requirement))return showToast('Not allowed','error');
    if(name!=='mgr')logAudit({target:state.managedUser||target.dataset.u||target.dataset.id||target.dataset.s||'',mode:'admin',action:name,detail:describeAdminAction(name)});
    return original(target,event);
  };
});

const stopScanner=()=>{try{state.scanner&&state.scanner.isScanning&&state.scanner.stop().catch(()=>{})}catch(e){}};
async function loadInvoice(x){const c=String(x).trim().toUpperCase();if(/^SKU[A-Z0-9]{8}$/.test(c))return payPersonalQr(c);if(!/^[A-Z0-9]{6}$/.test(c))return showToast('Invalid code','error');const v=(await bank.child('invoices/'+c).once('value')).val();if(!v||v.st!=='open'||Date.now()+(state.serverOffset||0)-v.ts>9e5)return showToast('Code expired or used','error');if(v.voucherTo&&v.voucherTo!==state.username)return showToast('This voucher belongs to @'+v.voucherTo,'error');state.pendingPayment={c,...v};
setText('pBiz',v.biz);setText('pSub',formatMoney(v.sub));setText('pTax',formatMoney(v.tax));setText('pTot',formatMoney(v.tot));pick('#pItems').innerHTML=(v.items||[]).map(i=>`<div><span>${escapeHtml(i.n)} × ${i.q}</span><span>${formatMoney(i.p*i.q)}</span></div>`).join('')+(v.discount?`<div><span>Voucher ${escapeHtml(v.voucher)}</span><span>-${formatMoney(v.discount)}</span></div>`:'');pick('#scInfo').classList.remove('hide')}
const increment=firebase.database.ServerValue.increment;
async function accrueInterest(){const u=state.user;if(!u||state.impersonation||state.accruing||!(u.savings>0)||!(state.vault.apr>0))return;state.accruing=1;
try{const now=Date.now(),last=u.lastInterest||u.createdAt,elapsedSeconds=(now-last)/1e3;if(elapsedSeconds<.9)return;
const a=Math.round(u.savings*effectiveApr()/100/12/604800*elapsedSeconds*1e8)/1e8;if(!(a>0)||state.vault.reserve<a)return;
if(!(await bank.child('users/'+u.u+'/lastInterest').transaction(v=>(v||last)===last?now:undefined)).committed)return;
await bank.update({['users/'+u.u+'/savings']:increment(a),['network/'+u.u+'/nw']:increment(a),['users/'+u.u+'/pend']:increment(a),['vault/reserve']:increment(-a),['stats/interestPaid']:increment(a)});
const pe=(u.pend||0)+a;
if(pe>=.01&&now-(u.lastLog||0)>=6e4){const c=Math.floor(pe*100+1e-6)/100;
if((await bank.child('users/'+u.u+'/pend').transaction(v=>(v||0)>=c?Math.round((v-c)*1e8)/1e8:undefined)).committed){await bank.child('users/'+u.u+'/lastLog').set(now);await recordTransaction({type:'interest',from:'SK Bank',to:u.u,fromName:'Savings Interest',toName:u.name,amt:c,net:c,note:state.vault.apr+'% APR · added to savings',p:[u.u]})}}}finally{state.accruing=0}}
setInterval(accrueInterest,1000);
function renderVault(){setText('apr',effectiveApr().toFixed(1)+'% APR');['Apr:apr','Sales:sales','Xfer:xfer','Wage:wage','Loan:loanApr','Daily:dailyBase','Term:termApr'].forEach(p=>{const[a,b]=p.split(':');setInputValue('r'+a,state.vault[b])});renderCart();renderAdmin()}
function renderUser(){const u=state.user;animateNumber(pick('#bMain'),u.main||0);{const sv=Math.floor((u.savings||0)*1e6)/1e6;pick('#bSave').innerHTML=formatMoney(Math.floor(sv*100+1e-6)/100)+'<i class="frac">'+sv.toFixed(6).slice(-4)+'</i>'}setText('hName',u.name);setText('hAv',u.u[0].toUpperCase());setText('pAv',u.u[0].toUpperCase());setText('pUser','@'+u.u);setText('pAcc','SK-'+u.createdAt.toString().slice(-8));
setText('pRole',u.role==='admin'?'Administrator':state.merchant&&state.merchant.status==='approved'?'Merchant':'Personal Account');setText('pJob',u.job?`${u.job.title}${u.job.sector?' · '+u.job.sector:''}`:'');setInputValue('pName',u.name);setInputValue('pAddr',u.addr||'');
pick('#frz').classList.toggle('hide',!u.frozen);
pick('#dial').innerHTML=(u.fav||[]).map(f=>`<div class="chip" data-act="dial" data-u="${escapeHtml(f)}"><i>${escapeHtml(f[0].toUpperCase())}</i>@${escapeHtml(f)}<div class="rm" data-act="unfav" data-u="${escapeHtml(f)}">×</div></div>`).join('')||'<small class="mut">Empty</small>';renderUserExtras();syncNetworkEntry()}
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
function renderAdmin(){if(!isStaff(state.actorUser))return;const us=Object.values(state.users),V=state.vault;setText('sMint',formatMoney(V.minted));setText('sRes',formatMoney(V.reserve));setText('sTax',formatMoney(V.tax));setText('sCirc',formatMoney(us.reduce((a,u)=>a+(u.main||0)+(u.savings||0),0)));
pick('#uList').innerHTML=us.sort((a,b)=>(b.main||0)-(a.main||0)).map(u=>`<div class="row" data-act="mgr" data-u="${escapeHtml(u.u)}"><div class="av sm">${escapeHtml(u.u[0].toUpperCase())}</div><div class="gr"><b>${escapeHtml(u.name)}${u.role==='admin'?' <em class="tag">Admin</em>':''}${u.frozen?' <em class="tag r">Frozen</em>':''}</b><small>@${escapeHtml(u.u)}${u.job?' · '+escapeHtml(u.job.title):''}</small></div><b>${formatMoney(u.main)}</b></div>`).join('');
const pm=Object.entries(state.allMerchants||{}).filter(([,m])=>m.status==='pending');pick('#mReq').innerHTML=pm.map(([u,m])=>`<div class="row"><div class="gr"><b>${escapeHtml(m.biz)}</b><small>@${escapeHtml(u)} · ${escapeHtml(m.cat)}</small></div><div class="btn sm primary" data-act="approve" data-u="${escapeHtml(u)}">Approve</div><div class="x" data-act="reject" data-u="${escapeHtml(u)}">${ico('x')}</div></div>`).join('')||'<div class="empty">No requests</div>';
pick('#ledger').innerHTML=state.ledger.slice(0,40).map(t=>`<div class="row" data-act="tx" data-id="${escapeHtml(t.id)}"><div class="gr"><b>${escapeHtml(t.fromName||t.from)} → ${escapeHtml(t.toName||t.to)}</b><small>${typeLabels[t.type]||t.type} · ${formatShortDate(t.ts)}</small></div><b>${formatMoney(t.amt)}</b></div>`).join('')||'<div class="empty">No activity</div>';renderTx();renderAdminExtras();renderAudit();renderMarketAdmin();syncNetworkEntry()}
function renderNet(){
  const me=state.username;
  pick('#netList').innerHTML=Object.values(state.network||{}).filter(entry=>entry&&entry.u&&entry.u!=='admin').sort((a,b)=>(b.nw||0)-(a.nw||0)||a.u.localeCompare(b.u)).map(entry=>`<div class="row nr${entry.u===me?' me':''}"><div class="av sm${entry.avatar?' emoji':''}">${escapeHtml(entry.avatar||entry.u[0].toUpperCase())}</div><div class="gr"><b>${escapeHtml(entry.name||entry.u)}</b><small>@${escapeHtml(entry.u)}${entry.title?' · '+escapeHtml(entry.title):''}</small>${entry.job&&entry.job.title?`<small>${escapeHtml(entry.job.title)}${entry.job.sector?' @'+escapeHtml(entry.job.sector):''}</small>`:''}</div><b class="amt">${formatMoney(entry.nw)}</b></div>`).join('')||'<div class="empty">No accounts</div>';
}
function syncNetworkEntry(){
  if(state.networkSyncTimer||!state.user||state.impersonation)return;
  state.networkSyncTimer=setTimeout(()=>{
    state.networkSyncTimer=0;
    if(!state.user||state.impersonation)return;
    const check=(account,isSelf)=>{
      if(!account||!account.u||account.u==='admin')return;
      const entry=state.network[account.u],job=account.job||{};
      const worth=Math.round((isSelf?netWorthOf(account):(account.main||0)+(account.savings||0))*1e8)/1e8;
      const stale=!entry||(isSelf&&(entry.name!==account.name||Math.abs((entry.nw||0)-worth)>1e-6||(entry.avatar||'')!==(account.avatar||'')||(entry.title||'')!==(account.title||'')||(entry.job&&entry.job.title||'')!==(job.title||'')||(entry.job&&entry.job.sector||'')!==(job.sector||'')));
      if(!stale)return;
      const next={u:account.u,name:account.name,nw:worth};
      if(account.job)next.job={title:account.job.title,sector:account.job.sector||''};
      if(account.avatar)next.avatar=account.avatar;
      if(account.title)next.title=account.title;
      state.network[account.u]=next;
      bank.child('network/'+account.u).set(next);
    };
    check(state.user,true);
    if(isStaff(state.actorUser))Object.values(state.users).forEach(account=>check(account,false));
  },1500);
}
function adminSync(){
  const active=isStaff(state.actorUser);
  if(active===Boolean(state.adminActive))return;
  state.adminActive=active;
  if(active){
    state.adminRefs=[bank.child('users'),bank.child('merchants'),bank.child('ledger').limitToLast(100),bank.child('loans'),bank.child('stats'),bank.child('audit').limitToLast(150)];
    const [users,merchants,ledger,loans,stats,audit]=state.adminRefs;
    users.on('value',snapshot=>{state.users=snapshot.val()||{};renderAdmin()});
    merchants.on('value',snapshot=>{state.allMerchants=snapshot.val()||{};renderAdmin()});
    ledger.on('value',snapshot=>{state.ledger=Object.values(snapshot.val()||{}).sort((a,b)=>b.ts-a.ts);renderAdmin()});
    loans.on('value',snapshot=>{state.allLoans=snapshot.val()||{};renderAdmin()});
    stats.on('value',snapshot=>{state.stats=snapshot.val()||{};renderAdmin()});
    audit.on('value',snapshot=>{state.audit=Object.values(snapshot.val()||{}).sort((a,b)=>b.ts-a.ts);renderAdmin()});
  }else{
    (state.adminRefs||[]).forEach(ref=>ref.off());
    Object.assign(state,{adminRefs:[],users:{},allMerchants:{},ledger:[],allLoans:{},stats:{},audit:[]});
    toggleModal('mg',false);
  }
}

const xpFor=tx=>({transfer:10,merchant:10,trade:10,gift:10,job:10,repayment:10,term:10})[tx.type]||0;
const paymentActions=new Set(['send','pay','requestPay','loanRepay','refundSale','formSubmit','claimDaily','spinWheel','termCollect','giftUnwrap','jobAccept','jobApprove','jobCancel','jobReject','jobSubmit','loanApprove','loanReject','mgFund','mgTake','mgPay','mgCharge']);
const submitActions=new Set([...paymentActions,'requestSend','loanApply','saveGo','qr','apply','itemSave','exportPrint','exportCsv','profile','mint','burn','sweep','rates','approve','reject','broadcast','mgJob','mgMsg','mgFreeze','mgFire','mgMerch','mgRole','mgPrivileges','mgSetPin','mgSetPassword','mgResetPin','changePin','cardFreeze','cardSkin','voucherRemove','marketToggle','deviceForget','requestDecline','requestCancel']);
function describeActorAction(name,target){
  if(name==='formSubmit'&&state.form)return state.form.title;
  return Object.entries(target.dataset).filter(([key])=>key!=='act').map(([,value])=>value).join(' ');
}
async function dispatchAction(target,event){
  const name=target.dataset.act,isPayment=paymentActions.has(name),isSubmit=submitActions.has(name),session=state.impersonation;
  if(target.classList.contains('busy')||(isPayment&&state.paymentLock))return;
  if(session&&session.mode==='view'&&isSubmit)return showToast('View only','info');
  if(isSubmit)target.classList.add('busy');
  if(isPayment)state.paymentLock=true;
  try{
    if(session&&session.mode==='act'&&isSubmit){
      if(!await confirmActorPin())return;
      logAudit({target:session.target,mode:'act',action:name,detail:describeActorAction(name,target)});
    }
    await actions[name](target,event);
  }catch(error){
    console.error(error);
    showToast('Something went wrong. Please try again','error');
  }finally{
    if(isSubmit)target.classList.remove('busy');
    if(isPayment)state.paymentLock=false;
  }
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-act]');
  if(target&&actions[target.dataset.act]){haptic('tap');dispatchAction(target,event)}
  else if(event.target.classList.contains('modal'))actions.close(event.target);
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.enter){e.preventDefault();pick(e.target.dataset.enter).click()}});
pick('#hq').addEventListener('input',e=>{state.search=e.target.value.trim();renderTx()});
pick('#scCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase());
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,event=>event.preventDefault()));
document.addEventListener('touchmove',event=>{if(event.touches.length>1)event.preventDefault()},{passive:false});
addEventListener('load',async()=>{navigator.serviceWorker?.register('sw.js').catch(()=>{});
firebase.database().ref('.info/serverTimeOffset').on('value',x=>state.serverOffset=x.val()||0);
bank.child('vault').transaction(v=>v||{reserve:0,tax:0,minted:0,apr:3,sales:2,xfer:.5,wage:5,loanApr:8,dailyBase:1,termApr:5});bank.child('vault').on('value',s=>{if(s.val()){state.vault={...state.vault,...s.val()};renderVault()}});
let s=null;try{s=JSON.parse(localStorage.getItem('skb'))}catch(e){}
if(s&&s.u){const v=(await bank.child('users/'+s.u).once('value')).val();if(v&&v.ph===s.h){if(!v.session)return beginSession(s.u,s.h);if(s.t&&v.session.token===s.t)return beginSession(s.u,s.h,s.t);showToast('Signed out: your account was opened on another device','error')}}
pick('#auth').classList.add('on')});