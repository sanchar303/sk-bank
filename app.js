'use strict';
firebase.initializeApp({apiKey:"AIzaSyDpCAXfhldRc1nCZDWlWNRbcMFjqAh8uPc",authDomain:"cloud-db-studio.firebaseapp.com",databaseURL:"https://cloud-db-studio-default-rtdb.firebaseio.com",projectId:"cloud-db-studio",storageBucket:"cloud-db-studio.firebasestorage.app",messagingSenderId:"343326148662",appId:"1:343326148662:web:987738ccc8f9d6a8253097"});
const bank=firebase.database().ref('sk-bank'),pick=selector=>document.querySelector(selector),pickAll=selector=>[...document.querySelectorAll(selector)];
const roundCents=n=>Math.round((+n+Number.EPSILON)*100)/100;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatMoney=n=>'$'+(+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const formatDate=t=>new Date(t).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
const formatShortDate=t=>new Date(t).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const state={network:{},username:null,user:null,vault:{reserve:0,tax:0,minted:0,apr:3,sales:2,xfer:.5,wage:5},users:{},transactions:[],ledger:[],notes:[],cart:[],merchant:null,allMerchants:{},txIndex:{},txFilter:'all',noteFilter:'all',search:'',pendingPayment:null,managedUser:null,selectedTx:null,savingsMode:'deposit',serverOffset:0},listeners=[];
const ico=name=>`<svg class="i"><use href="#i-${name}"/></svg>`;
const typeLabels={transfer:'Transfer',merchant:'Payment',interest:'Interest',wage:'Wage',savings:'Savings',credit:'Credit',debit:'Debit',mint:'Mint'};
const filterTypes={all:null,transfer:['transfer','credit','debit'],merchant:['merchant'],earn:['interest','wage'],savings:['savings']};
const liveListIds=new Set(['dial','recent','hist','nList','catalog','cart','uList','mReq','ledger','bSave','pItems','netList']);
{const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{get:d.get,set(v){if(liveListIds.has(this.id)&&this.__h===v)return;this.__h=v;d.set.call(this,v)},configurable:true})}
let toastTimer;
function showToast(m,t='info'){const e=pick('#toast');e.className='toast '+t;e.textContent=m;void e.offsetWidth;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),2200)}
const toggleModal=(id,open=true)=>pick('#'+id).classList.toggle('open',open);
const subscribe=(ref,handler)=>{ref.on('value',handler);listeners.push(ref)};
const adjustBalance=(p,d,min=0)=>bank.child(p).transaction(v=>{const n=Math.round(((+v||0)+d)*1e8)/1e8;return n<min?undefined:n}).then(x=>{const m=p.match(/^users\/([^/]+)\/(main|savings)$/);if(x.committed&&m)bank.child('network/'+m[1]+'/nw').transaction(v=>Math.round(((+v||0)+d)*1e8)/1e8);return x.committed});
async function hashPassword(u,p){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('skb|'+u+'|'+p));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const randomCode=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(6));return[...r].map(x=>a[x%a.length]).join('')};
const pushNotification=(u,cat,title,msg)=>bank.child('notes/'+u).push({ts:Date.now(),cat,title,msg,read:false});
function recordTransaction(t){const id='TX'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase(),o={id,ts:Date.now(),tax:0,note:'',...t},p=o.p||[];delete o.p;const u={['ledger/'+id]:o};p.forEach(x=>u['userTx/'+x+'/'+id]=o);return bank.update(u)}
function animateNumber(el,to){const from=+el.dataset.v||0;el.dataset.v=to;if(from===to){el.textContent=formatMoney(to);return}const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/500);el.textContent=formatMoney(from+(to-from)*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)}
const setInputValue=(id,v)=>{const e=pick('#'+id);if(e&&document.activeElement!==e)e.value=v};
const setText=(id,v)=>{const e=pick('#'+id);if(e&&e.textContent!==v)e.textContent=v};
const isFrozen=()=>state.user.frozen?(showToast('Account frozen','error'),true):false;

function showView(id){pickAll('#app .view').forEach(v=>v.classList.toggle('on',v.id===id));pickAll('.nav [data-v]').forEach(n=>n.classList.toggle('on',n.dataset.v===id));scrollTo(0,0);if(id==='notes')readNotes()}

function beginSession(u,h){localStorage.setItem('skb',JSON.stringify({u,h}));state.username=u;pick('#auth').classList.remove('on');pick('#app').classList.remove('hide');showView('home');
subscribe(bank.child('users/'+u),s=>{const v=s.val();if(!v||v.ph!==h)return actions.logout();state.user=v;renderUser();adminSync();accrueInterest()});
subscribe(bank.child('userTx/'+u).limitToLast(150),s=>{state.transactions=Object.values(s.val()||{}).sort((a,b)=>b.ts-a.ts);renderTx()});
subscribe(bank.child('notes/'+u).limitToLast(100),s=>{const o=s.val()||{};state.notes=Object.entries(o).map(([k,v])=>({k,...v})).sort((a,b)=>b.ts-a.ts);renderNotes()});
subscribe(bank.child('merchants/'+u),s=>{state.merchant=s.val();renderMerchant()});
subscribe(bank.child('network'),s=>{state.network=s.val()||{};renderNet();syncNetworkEntry()});
}
const actions={
mode:t=>pick('#auth').dataset.mode=t.dataset.v,
async login(){const u=pick('#lu').value.trim().toLowerCase(),p=pick('#lp').value;if(!u||!p)return showToast('Enter username and password','error');const [s,h]=await Promise.all([bank.child('users/'+u).once('value'),hashPassword(u,p)]);if(!s.val()||s.val().ph!==h)return showToast('Invalid username or password','error');beginSession(u,h)},
async reg(){const u=pick('#ru').value.trim().toLowerCase(),p=pick('#rp').value;if(!/^[a-z0-9_]{3,20}$/.test(u))return showToast('Username: 3–20 letters, numbers or _','error');if(p.length<6)return showToast('Password needs 6+ characters','error');
const o={u,name:pick('#rn').value.trim()||u,addr:pick('#ra').value.trim(),main:0,savings:0,role:u==='admin'?'admin':'user',createdAt:Date.now(),ph:await hashPassword(u,p)};o.lastInterest=o.createdAt;
if(!(await bank.child('users/'+u).transaction(v=>v?undefined:o)).committed)return showToast('Username unavailable','error');pushNotification(u,'system','Account opened','Your account is ready.');beginSession(u,o.ph)},
logout(){listeners.forEach(r=>r.off());listeners.length=0;(state.adminRefs||[]).forEach(r=>r.off());state.adminRefs=[];state.adminActive=false;localStorage.removeItem('skb');Object.assign(state,{username:null,user:null,users:{},transactions:[],notes:[],cart:[],merchant:null});pickAll('.modal').forEach(m=>m.classList.remove('open'));pick('#app').classList.add('hide');pick('#auth').classList.add('on');pick('#lp').value='';pick('#rp').value=''},
go:t=>showView(t.dataset.v),
async refresh(t){t.classList.add('spin');const s=await bank.child('users/'+state.username).once('value');if(s.val()){state.user=s.val();renderUser()}setTimeout(()=>t.classList.remove('spin'),600);showToast('Updated','success')},
close:t=>{const m=t.closest('.modal');m.classList.remove('open');if(m.id==='scan')stopScanner();if(m.id==='qr'){if(state.stopVoucherWatch){state.stopVoucherWatch();state.stopVoucherWatch=null}if(state.activeVoucher){bank.child('invoices/'+state.activeVoucher).transaction(v=>v&&v.st==='open'?null:v);state.activeVoucher=null}}},
sendOpen:()=>{toggleModal('send')},
dial:t=>{pick('#sTo').value=t.dataset.u;toggleModal('send')},
async send(){if(isFrozen())return;const to=pick('#sTo').value.trim().toLowerCase().replace(/^@/,''),amt=roundCents(pick('#sAmt').value),me=state.username;if(!to||!(amt>0))return showToast('Enter recipient and amount','error');if(to===me)return showToast('Choose another account','error');
const rec=(await bank.child('users/'+to).once('value')).val();if(!rec)return showToast('Account not found','error');const tax=roundCents(amt*state.vault.xfer/100),net=roundCents(amt-tax);
if(!await adjustBalance('users/'+me+'/main',-amt))return showToast('Insufficient balance','error');await adjustBalance('users/'+to+'/main',net);if(tax)await adjustBalance('vault/tax',tax);
await recordTransaction({type:'transfer',from:me,to,fromName:state.user.name,toName:rec.name||to,amt,tax,net,note:pick('#sNote').value.trim(),p:[me,to]});
pushNotification(me,'transfers','Transfer sent',`${formatMoney(amt)} to @${to}`);pushNotification(to,'transfers','Funds received',`${formatMoney(net)} from @${me}`);
toggleModal('send',false);['#sTo','#sAmt','#sNote'].forEach(x=>pick(x).value='');showToast('Sent '+formatMoney(amt),'success')},
sv:t=>{state.savingsMode=t.dataset.m;pick('#svTitle').textContent=state.savingsMode==='deposit'?'Deposit':'Withdraw';toggleModal('save')},
async saveGo(){const amt=roundCents(pick('#svAmt').value),d=state.savingsMode==='deposit';if(!(amt>0))return showToast('Enter amount','error');if(isFrozen())return;
await accrueInterest();await bank.child('users/'+state.username+'/lastInterest').set(Date.now());if(!await adjustBalance('users/'+state.username+'/'+(d?'main':'savings'),-amt))return showToast('Insufficient balance','error');await adjustBalance('users/'+state.username+'/'+(d?'savings':'main'),amt);
await recordTransaction({type:'savings',from:state.username,to:state.username,fromName:state.user.name,toName:'Savings Vault',amt,net:amt,note:d?'Deposit to Savings':'Withdrawal from Savings',p:[state.username]});toggleModal('save',false);pick('#svAmt').value='';showToast(d?'Deposited':'Withdrawn','success')},
tx:t=>{const x=state.txIndex[t.dataset.id];if(!x)return;state.selectedTx=x;const me=state.username;
setText('rId',x.id);setText('rTime',formatDate(x.ts));setText('rFrom',`${x.fromName||x.from} (@${x.from})`);setText('rTo',`${x.toName||x.to} (@${x.to})`);setText('rType',typeLabels[x.type]||x.type);setText('rAmt',formatMoney(x.amt));setText('rTax',formatMoney(x.tax));setText('rNet',formatMoney(x.net??x.amt));setText('rNote',x.note||'—');
pick('#rFav').classList.toggle('hide',!(x.type==='transfer'&&x.from===me));toggleModal('rec')},
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
await recordTransaction({type:'merchant',from:state.username,to:p.m,fromName:state.user.name,toName:p.biz,amt:p.tot,tax:p.tax,net:p.sub,note:'Checkout',p:[state.username,p.m]});
pushNotification(state.username,'merchant','Payment sent',`${formatMoney(p.tot)} to ${p.biz}`);pushNotification(p.m,'merchant','Sale received',`${formatMoney(p.sub)} from @${state.username}`);await bank.child('invoices/'+p.c).remove();state.pendingPayment=null;toggleModal('scan',false);stopScanner();showToast('Paid '+formatMoney(p.tot),'success')},
async mint(){const a=roundCents(pick('#aAmt').value);if(!(a>0))return showToast('Enter amount','error');await adjustBalance('vault/reserve',a);await adjustBalance('vault/minted',a);await recordTransaction({type:'mint',from:'SK Bank',to:'Reserve',fromName:'Mint',toName:'Reserve',amt:a,net:a,note:'Issuance',p:[]});pick('#aAmt').value='';showToast('Issued '+formatMoney(a),'success')},
async burn(){const a=roundCents(pick('#aAmt').value);if(!(a>0))return showToast('Enter amount','error');if(!await adjustBalance('vault/reserve',-a))return showToast('Exceeds reserve','error');await adjustBalance('vault/minted',-a);await recordTransaction({type:'mint',from:'Reserve',to:'SK Bank',fromName:'Reserve',toName:'Burn',amt:a,net:a,note:'Retirement',p:[]});pick('#aAmt').value='';showToast('Retired '+formatMoney(a),'success')},
async sweep(){const t=state.vault.tax;if(!(t>0))return showToast('Nothing to move','info');if(await adjustBalance('vault/tax',-t)){await adjustBalance('vault/reserve',t);showToast('Moved '+formatMoney(t),'success')}},
async rates(){const v={apr:+pick('#rApr').value,sales:+pick('#rSales').value,xfer:+pick('#rXfer').value,wage:+pick('#rWage').value};if(Object.values(v).some(x=>isNaN(x)||x<0||x>100))return showToast('Rates must be 0–100','error');await bank.child('vault').update(v);showToast('Saved','success')},
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
const callerIsAdmin=async()=>(await bank.child('users/'+state.username+'/role').once('value')).val()==='admin';
['mint','burn','sweep','rates','approve','reject','broadcast','mgr','mgFund','mgTake','mgJob','mgPay','mgMsg','mgFreeze','mgFire','mgMerch','mgRole'].forEach(k=>{const f=actions[k];actions[k]=async(t,e)=>{if(!await callerIsAdmin())return showToast('Not allowed','error');return f(t,e)}});
const stopScanner=()=>{try{state.scanner&&state.scanner.isScanning&&state.scanner.stop().catch(()=>{})}catch(e){}};
async function loadInvoice(x){const c=String(x).trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(c))return showToast('Invalid code','error');const v=(await bank.child('invoices/'+c).once('value')).val();if(!v||v.st!=='open'||Date.now()+(state.serverOffset||0)-v.ts>9e5)return showToast('Code expired or used','error');state.pendingPayment={c,...v};
setText('pBiz',v.biz);setText('pSub',formatMoney(v.sub));setText('pTax',formatMoney(v.tax));setText('pTot',formatMoney(v.tot));pick('#pItems').innerHTML=(v.items||[]).map(i=>`<div><span>${escapeHtml(i.n)} × ${i.q}</span><span>${formatMoney(i.p*i.q)}</span></div>`).join('');pick('#scInfo').classList.remove('hide')}
const increment=firebase.database.ServerValue.increment;
async function accrueInterest(){const u=state.user;if(!u||state.accruing||!(u.savings>0)||!(state.vault.apr>0))return;state.accruing=1;
try{const now=Date.now(),last=u.lastInterest||u.createdAt,elapsedSeconds=(now-last)/1e3;if(elapsedSeconds<.9)return;
const a=Math.round(u.savings*state.vault.apr/100/12/604800*elapsedSeconds*1e8)/1e8;if(!(a>0)||state.vault.reserve<a)return;
if(!(await bank.child('users/'+u.u+'/lastInterest').transaction(v=>(v||last)===last?now:undefined)).committed)return;
await bank.update({['users/'+u.u+'/savings']:increment(a),['network/'+u.u+'/nw']:increment(a),['users/'+u.u+'/pend']:increment(a),['vault/reserve']:increment(-a)});
const pe=(u.pend||0)+a;
if(pe>=.01&&now-(u.lastLog||0)>=6e4){const c=Math.floor(pe*100+1e-6)/100;
if((await bank.child('users/'+u.u+'/pend').transaction(v=>(v||0)>=c?Math.round((v-c)*1e8)/1e8:undefined)).committed){await bank.child('users/'+u.u+'/lastLog').set(now);await recordTransaction({type:'interest',from:'SK Bank',to:u.u,fromName:'Savings Interest',toName:u.name,amt:c,net:c,note:state.vault.apr+'% APR · added to savings',p:[u.u]})}}}finally{state.accruing=0}}
setInterval(accrueInterest,1000);
function renderVault(){setText('apr',state.vault.apr.toFixed(1)+'% APR');['Apr:apr','Sales:sales','Xfer:xfer','Wage:wage'].forEach(p=>{const[a,b]=p.split(':');setInputValue('r'+a,state.vault[b])});renderCart();renderAdmin()}
function renderUser(){const u=state.user;animateNumber(pick('#bMain'),u.main||0);{const sv=Math.floor((u.savings||0)*1e6)/1e6;pick('#bSave').innerHTML=formatMoney(Math.floor(sv*100+1e-6)/100)+'<i class="frac">'+sv.toFixed(6).slice(-4)+'</i>'}setText('hName',u.name);setText('hAv',u.u[0].toUpperCase());setText('pAv',u.u[0].toUpperCase());setText('pUser','@'+u.u);setText('pAcc','SK-'+u.createdAt.toString().slice(-8));
setText('pRole',u.role==='admin'?'Administrator':state.merchant&&state.merchant.status==='approved'?'Merchant':'Personal Account');setText('pJob',u.job?`${u.job.title}${u.job.sector?' · '+u.job.sector:''}`:'');setInputValue('pName',u.name);setInputValue('pAddr',u.addr||'');
pickAll('.adm').forEach(e=>e.classList.toggle('hide',u.role!=='admin'));pick('#frz').classList.toggle('hide',!u.frozen);
pick('#dial').innerHTML=(u.fav||[]).map(f=>`<div class="chip" data-act="dial" data-u="${escapeHtml(f)}"><i>${escapeHtml(f[0].toUpperCase())}</i>@${escapeHtml(f)}<div class="rm" data-act="unfav" data-u="${escapeHtml(f)}">×</div></div>`).join('')||'<small class="mut">Empty</small>';syncNetworkEntry()}
function transactionRow(t){const sv=t.type==='savings',inc=t.to===state.username&&!sv,who=sv?t.note:inc?t.fromName||t.from:t.toName||t.to,ic=sv?'wallet':inc?'down':t.type==='interest'?'percent':'up';
return`<div class="row" data-act="tx" data-id="${escapeHtml(t.id)}"><div class="ic ${inc?'in':sv?'sv':'out'}">${ico(ic)}</div><div class="gr"><b>${escapeHtml(who)}</b><small>${typeLabels[t.type]||t.type} · ${formatShortDate(t.ts)}</small></div><b class="amt ${inc?'pos':''}">${sv?'':inc?'+':'−'}${formatMoney(inc?t.net??t.amt:t.amt)}</b></div>`}
function renderTx(){state.txIndex={};[...state.ledger,...state.transactions].forEach(t=>state.txIndex[t.id]=t);pick('#recent').innerHTML=state.transactions.slice(0,5).map(transactionRow).join('')||'<div class="empty">No transactions</div>';
const q=state.search.toLowerCase(),ft=filterTypes[state.txFilter];pick('#hist').innerHTML=state.transactions.filter(t=>(!ft||ft.includes(t.type))&&(!q||[t.id,t.from,t.to,t.fromName,t.toName,t.note].join(' ').toLowerCase().includes(q))).map(transactionRow).join('')||'<div class="empty">No transactions</div>'}
function renderNotes(){const n=state.notes,un=n.filter(x=>!x.read).length,b=pick('#badge');b.textContent=un;b.classList.toggle('hide',!un);
const IC={transfers:'send',merchant:'store',earnings:'percent',system:'bell'};
pick('#nList').innerHTML=n.filter(x=>state.noteFilter==='all'||x.cat===state.noteFilter).map(x=>`<div class="row nt ${x.read?'':'un'}"><div class="ic sv">${ico(IC[x.cat]||'bell')}</div><div class="gr"><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.msg)}</small><small>${formatDate(x.ts)}</small></div></div>`).join('')||'<div class="empty">No notifications</div>';if(un&&pick('#notes').classList.contains('on'))readNotes()}
function readNotes(){const u={};state.notes.forEach(n=>{if(!n.read)u['notes/'+state.username+'/'+n.k+'/read']=true});if(Object.keys(u).length)bank.update(u)}
function renderMerchant(){const m=state.merchant,ok=m&&m.status==='approved';pick('#mApply').classList.toggle('hide',!!m);pick('#mWait').classList.toggle('hide',!(m&&m.status==='pending'));pick('#mConsole').classList.toggle('hide',!ok);setText('mBadge',ok?m.biz:m?'Pending':'');
if(ok)pick('#catalog').innerHTML=Object.values(m.items||{}).map(i=>`<div class="row"><div class="gr"><b>${escapeHtml(i.n)}</b><small>${formatMoney(i.p)}</small></div><div class="btn sm secondary" data-act="add" data-id="${escapeHtml(i.id)}">Add</div><div class="x" data-act="itemDel" data-id="${escapeHtml(i.id)}">${ico('trash')}</div></div>`).join('')||'<div class="empty">No items</div>';
if(state.user)renderUser();renderCart()}
function renderCart(){const sub=roundCents(state.cart.reduce((a,i)=>a+i.p*i.q,0)),tax=roundCents(sub*state.vault.sales/100);pick('#cart').innerHTML=state.cart.map((i,x)=>`<div class="row"><div class="gr"><b>${escapeHtml(i.n)}</b><small>${formatMoney(i.p)} × ${i.q}</small></div><b>${formatMoney(i.p*i.q)}</b><div class="x" data-act="cartDel" data-i="${x}">${ico('x')}</div></div>`).join('')||'<div class="empty">Empty</div>';setText('cSub',formatMoney(sub));setText('cTax',formatMoney(tax));setText('cTot',formatMoney(sub+tax))}
function renderAdmin(){if(!state.user||state.user.role!=='admin')return;const us=Object.values(state.users),V=state.vault;setText('sMint',formatMoney(V.minted));setText('sRes',formatMoney(V.reserve));setText('sTax',formatMoney(V.tax));setText('sCirc',formatMoney(us.reduce((a,u)=>a+(u.main||0)+(u.savings||0),0)));
pick('#uList').innerHTML=us.sort((a,b)=>(b.main||0)-(a.main||0)).map(u=>`<div class="row" data-act="mgr" data-u="${escapeHtml(u.u)}"><div class="av sm">${escapeHtml(u.u[0].toUpperCase())}</div><div class="gr"><b>${escapeHtml(u.name)}${u.role==='admin'?' <em class="tag">Admin</em>':''}${u.frozen?' <em class="tag r">Frozen</em>':''}</b><small>@${escapeHtml(u.u)}${u.job?' · '+escapeHtml(u.job.title):''}</small></div><b>${formatMoney(u.main)}</b></div>`).join('');
const pm=Object.entries(state.allMerchants||{}).filter(([,m])=>m.status==='pending');pick('#mReq').innerHTML=pm.map(([u,m])=>`<div class="row"><div class="gr"><b>${escapeHtml(m.biz)}</b><small>@${escapeHtml(u)} · ${escapeHtml(m.cat)}</small></div><div class="btn sm primary" data-act="approve" data-u="${escapeHtml(u)}">Approve</div><div class="x" data-act="reject" data-u="${escapeHtml(u)}">${ico('x')}</div></div>`).join('')||'<div class="empty">No requests</div>';
pick('#ledger').innerHTML=state.ledger.slice(0,40).map(t=>`<div class="row" data-act="tx" data-id="${escapeHtml(t.id)}"><div class="gr"><b>${escapeHtml(t.fromName||t.from)} → ${escapeHtml(t.toName||t.to)}</b><small>${typeLabels[t.type]||t.type} · ${formatShortDate(t.ts)}</small></div><b>${formatMoney(t.amt)}</b></div>`).join('')||'<div class="empty">No activity</div>';renderTx();syncNetworkEntry()}
function renderNet(){const me=state.username;pick('#netList').innerHTML=Object.values(state.network).filter(e=>e&&e.u&&e.u!=='admin').sort((a,b)=>(b.nw||0)-(a.nw||0)||a.u.localeCompare(b.u)).map(e=>`<div class="row nr${e.u===me?' me':''}"><div class="av sm">${escapeHtml(e.u[0].toUpperCase())}</div><div class="gr"><b>${escapeHtml(e.name||e.u)}</b><small>@${escapeHtml(e.u)}</small>${e.job&&e.job.title?`<small>${escapeHtml(e.job.title)}${e.job.sector?' @'+escapeHtml(e.job.sector):''}</small>`:''}</div><b class="amt">${formatMoney(e.nw)}</b></div>`).join('')||'<div class="empty">No accounts</div>'}
function syncNetworkEntry(){if(state.networkSyncTimer||!state.user)return;state.networkSyncTimer=setTimeout(()=>{state.networkSyncTimer=0;if(!state.user)return;
const chk=u=>{if(!u||!u.u||u.u==='admin')return;const nw=Math.round(((u.main||0)+(u.savings||0))*1e8)/1e8,n=state.network[u.u],j=u.job||{};
if(!n||n.name!==u.name||Math.abs((n.nw||0)-nw)>1e-6||(n.job&&n.job.title||'')!==(j.title||'')||(n.job&&n.job.sector||'')!==(j.sector||'')){const w={u:u.u,name:u.name,nw};if(u.job)w.job={title:u.job.title,sector:u.job.sector||''};state.network[u.u]=w;bank.child('network/'+u.u).set(w)}};
chk(state.user);if(state.user.role==='admin')Object.values(state.users).forEach(chk)},1500)}
function adminSync(){const ad=state.user.role==='admin';if(ad===!!state.adminActive)return;state.adminActive=ad;
if(ad){state.adminRefs=[bank.child('users'),bank.child('merchants'),bank.child('ledger').limitToLast(100)];
state.adminRefs[0].on('value',x=>{state.users=x.val()||{};renderAdmin()});state.adminRefs[1].on('value',x=>{state.allMerchants=x.val()||{};renderAdmin()});state.adminRefs[2].on('value',x=>{state.ledger=Object.values(x.val()||{}).sort((a,b)=>b.ts-a.ts);renderAdmin()})}
else{(state.adminRefs||[]).forEach(r=>r.off());state.adminRefs=[];state.users={};state.allMerchants={};state.ledger=[];toggleModal('mg',false);if(pick('#admin').classList.contains('on'))showView('home');renderTx()}}
document.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(t&&actions[t.dataset.act])actions[t.dataset.act](t,e);else if(e.target.classList.contains('modal'))actions.close(e.target)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.enter){e.preventDefault();pick(e.target.dataset.enter).click()}});
pick('#hq').addEventListener('input',e=>{state.search=e.target.value.trim();renderTx()});
pick('#scCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase());
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,event=>event.preventDefault()));
document.addEventListener('touchmove',event=>{if(event.touches.length>1)event.preventDefault()},{passive:false});
addEventListener('load',async()=>{navigator.serviceWorker?.register('sw.js').catch(()=>{});
firebase.database().ref('.info/serverTimeOffset').on('value',x=>state.serverOffset=x.val()||0);
bank.child('vault').transaction(v=>v||{reserve:0,tax:0,minted:0,apr:3,sales:2,xfer:.5,wage:5});bank.child('vault').on('value',s=>{if(s.val()){state.vault={...state.vault,...s.val()};renderVault()}});
let s=null;try{s=JSON.parse(localStorage.getItem('skb'))}catch(e){}
if(s&&s.u){const v=(await bank.child('users/'+s.u).once('value')).val();if(v&&v.ph===s.h)return beginSession(s.u,s.h)}
pick('#auth').classList.add('on')});