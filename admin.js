'use strict';
const firebaseConfig={apiKey:"AIzaSyDpCAXfhldRc1nCZDWlWNRbcMFjqAh8uPc",authDomain:"cloud-db-studio.firebaseapp.com",databaseURL:"https://cloud-db-studio-default-rtdb.firebaseio.com",projectId:"cloud-db-studio",storageBucket:"cloud-db-studio.firebasestorage.app",messagingSenderId:"343326148662",appId:"1:343326148662:web:987738ccc8f9d6a8253097"};
firebase.initializeApp(firebaseConfig);
const ADMIN_USERNAME='admin',MAIN_APP_URL='/';
const bank=firebase.database().ref('sk-bank'),increment=firebase.database.ServerValue.increment;
const pick=selector=>document.querySelector(selector);
const state={unlocked:false,busy:false,failures:0,lockedUntil:0,requests:{},idleTimer:null,listener:null};
const formatMoney=value=>'$'+(+value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const escapeHtml=text=>String(text??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
async function sha256(text){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
const hashPassword=(username,password)=>sha256('skb|'+username+'|'+password);
function ago(time){
  const seconds=Math.max(0,Math.round((Date.now()-time)/1e3));
  if(seconds<60)return'just now';
  if(seconds<3600)return Math.round(seconds/60)+' min ago';
  if(seconds<86400)return Math.round(seconds/3600)+' h ago';
  return Math.round(seconds/86400)+' d ago';
}
let toastTimer;
function showToast(message,type='info'){
  const toast=pick('#toast');
  toast.className='toast '+type;
  toast.textContent=message;
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),2800);
}
function navigateTo(address){
  document.body.classList.add('leaving');
  setTimeout(()=>{window.location.href=address},260);
}
function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  localStorage.setItem('skb-theme',theme);
  pick('meta[name=theme-color]').content=theme==='light'?'#e9eff9':'#060a14';
}
function evaluateLock(){
  pick('#unlock').classList.toggle('ready',pick('#password').value.length>0&&/^\d{4,6}$/.test(pick('#pin').value));
}
function touchSession(){
  clearTimeout(state.idleTimer);
  if(state.unlocked)state.idleTimer=setTimeout(lock,10*60*1000);
}
function showView(unlocked){
  pick('#lockView').classList.toggle('hide',unlocked);
  pick('#lockView').classList.toggle('on',!unlocked);
  pick('#consoleView').classList.toggle('hide',!unlocked);
  pick('#consoleView').classList.toggle('on',unlocked);
}
async function unlock(){
  const button=pick('#unlock');
  if(state.busy||!button.classList.contains('ready'))return;
  if(Date.now()<state.lockedUntil)return showToast('Too many attempts. Try again in a minute','error');
  state.busy=true;
  button.classList.add('busy');
  try{
    const[storedPassword,storedPin]=(await Promise.all([bank.child('users/'+ADMIN_USERNAME+'/ph').once('value'),bank.child('users/'+ADMIN_USERNAME+'/pinHash').once('value')])).map(snapshot=>snapshot.val());
    if(!storedPin)return showToast('Set the admin transaction PIN in SK Bank first','error');
    const[passwordHash,pinHash]=await Promise.all([hashPassword(ADMIN_USERNAME,pick('#password').value),hashPassword('pin:'+ADMIN_USERNAME,pick('#pin').value)]);
    if(passwordHash!==storedPassword||pinHash!==storedPin){
      if(++state.failures>=5){state.failures=0;state.lockedUntil=Date.now()+6e4}
      return showToast('Incorrect password or PIN','error');
    }
    state.failures=0;
    state.unlocked=true;
    pick('#password').value='';pick('#pin').value='';
    showView(true);
    listen();
    touchSession();
  }catch(error){
    console.error(error);
    showToast('Something went wrong. Please try again','error');
  }finally{
    state.busy=false;
    button.classList.remove('busy');
    evaluateLock();
  }
}
function lock(){
  state.unlocked=false;
  clearTimeout(state.idleTimer);
  if(state.listener)state.listener.off();
  state.listener=null;
  state.requests={};
  showView(false);
  evaluateLock();
}
function listen(){
  state.listener=bank.child('withdrawals');
  state.listener.on('value',snapshot=>{state.requests=snapshot.val()||{};render()});
}
function render(){
  const all=Object.values(state.requests).sort((a,b)=>b.ts-a.ts);
  const pending=all.filter(request=>request.status==='pending').sort((a,b)=>a.ts-b.ts);
  const decided=all.filter(request=>request.status!=='pending').slice(0,10);
  const total=pending.reduce((sum,request)=>sum+request.amount,0);
  pick('#summary').textContent=pending.length?`${pending.length} pending · ${formatMoney(total)}`:'Nothing pending';
  pick('#pendingList').innerHTML=pending.map(request=>`<div class="row static pending"><div class="av sm">${escapeHtml(request.username[0].toUpperCase())}</div><div class="gr"><b>@${escapeHtml(request.username)}</b><small>${escapeHtml(request.name||'')} · ${ago(request.ts)}</small></div><b class="amt">${formatMoney(request.amount)}</b><div class="row-actions"><div class="btn sm primary" data-act="approve" data-id="${escapeHtml(request.id)}" role="button">Approve</div><div class="btn sm danger" data-act="decline" data-id="${escapeHtml(request.id)}" role="button" style="margin-top:0">Decline</div></div></div>`).join('')||'<div class="empty">No pending requests</div>';
  pick('#historyList').innerHTML=decided.map(request=>`<div class="row static"><div class="av sm">${escapeHtml(request.username[0].toUpperCase())}</div><div class="gr"><b>@${escapeHtml(request.username)}</b><small>${ago(request.decidedAt||request.ts)}</small></div><b class="amt">${formatMoney(request.amount)}</b><span class="tag ${request.status==='approved'?'ok':'r'}">${request.status==='approved'?'Approved':'Declined'}</span></div>`).join('')||'<div class="empty">No decisions yet</div>';
}
async function decide(id,approved,button){
  const request=state.requests[id];
  if(!request||request.status!=='pending'||state.busy)return;
  state.busy=true;
  button.classList.add('busy');
  try{
    const claim=await bank.child('withdrawals/'+id+'/status').transaction(status=>status==='pending'?(approved?'approved':'declined'):undefined);
    if(!claim.committed)return showToast('Already decided','info');
    const now=Date.now(),user=request.username,amount=request.amount;
    const updates={
      ['withdrawals/'+id+'/decidedAt']:now,
      ['pendingWithdrawals/'+user]:null,
      ['vault/withdrawalHold']:increment(-amount),
      ['userTx/'+user+'/'+id+'/note']:approved?'Approved':'Declined',
      ['ledger/'+id+'/note']:approved?'Approved':'Declined'
    };
    if(approved){
      updates['vault/minted']=increment(-amount);
      updates['stats/withdrawn']=increment(amount);
    }else{
      const refundId='R'+id,entry={id:refundId,ts:now,type:'withdrawal',from:'Withdrawal',to:user,fromName:'Withdrawal refund',toName:request.name||user,amt:amount,tax:0,net:amount,note:'Declined · refunded'};
      updates['users/'+user+'/main']=increment(amount);
      updates['network/'+user+'/nw']=increment(amount);
      updates['ledger/'+refundId]=entry;
      updates['userTx/'+user+'/'+refundId]=entry;
    }
    await bank.update(updates);
    bank.child('notes/'+user).push({ts:now,cat:'system',title:approved?'Withdrawal completed':'Withdrawal declined',msg:approved?formatMoney(amount)+' has been paid out':formatMoney(amount)+' was returned to your balance',read:false});
    bank.child('audit').push({ts:now,actor:ADMIN_USERNAME,target:user,mode:'admin',action:approved?'withdrawal approved':'withdrawal declined',detail:formatMoney(amount)});
    showToast(approved?'Approved':'Declined and refunded','success');
  }catch(error){
    console.error(error);
    showToast('Something went wrong. Please try again','error');
  }finally{
    state.busy=false;
    button.classList.remove('busy');
  }
}
const actions={
  unlock,
  lock,
  approve:target=>decide(target.dataset.id,true,target),
  decline:target=>decide(target.dataset.id,false,target),
  home:()=>navigateTo(MAIN_APP_URL),
  toggleTheme:()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light')
};
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-act]');
  if(target&&actions[target.dataset.act]){touchSession();actions[target.dataset.act](target)}
});
['#password','#pin'].forEach(selector=>pick(selector).addEventListener('input',evaluateLock));
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,event=>event.preventDefault()));
addEventListener('pageshow',event=>{if(event.persisted)document.body.classList.remove('leaving')});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&!state.unlocked)unlock()});