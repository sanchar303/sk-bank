'use strict';
const firebaseConfig={apiKey:"AIzaSyDpCAXfhldRc1nCZDWlWNRbcMFjqAh8uPc",authDomain:"cloud-db-studio.firebaseapp.com",databaseURL:"https://cloud-db-studio-default-rtdb.firebaseio.com",projectId:"cloud-db-studio",storageBucket:"cloud-db-studio.firebasestorage.app",messagingSenderId:"343326148662",appId:"1:343326148662:web:987738ccc8f9d6a8253097"};
firebase.initializeApp(firebaseConfig);
const MAIN_APP_URL='index.html';
const bank=firebase.database().ref('sk-bank'),increment=firebase.database.ServerValue.increment;
const pick=selector=>document.querySelector(selector);
const state={accounts:[],names:{},pending:{},selected:null,balance:0,useMax:false,busy:false,failures:0,lockedUntil:0,balanceRef:null,accountsReady:false,pendingReady:false,requestedHandled:false};
const roundCents=value=>Math.round((+value+Number.EPSILON)*100)/100;
const floorCents=value=>Math.floor((+value+1e-9)*100)/100;
const formatMoney=value=>'$'+(+value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const escapeHtml=text=>String(text??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
async function sha256(text){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
const hashPassword=(username,password)=>sha256('skb|'+username+'|'+password);
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
async function loadAccounts(){
  try{
    const response=await fetch(firebaseConfig.databaseURL+'/sk-bank/users.json?shallow=true');
    state.accounts=Object.keys(await response.json()||{}).filter(username=>username!=='admin').sort();
  }catch(error){showToast('Could not load accounts','error')}
  state.accountsReady=true;
  renderDropdown();
  applyRequestedAccount();
}
function applyRequestedAccount(){
  if(state.requestedHandled||!state.accountsReady||!state.pendingReady)return;
  state.requestedHandled=true;
  const requested=new URLSearchParams(window.location.search).get('account');
  if(!requested||!state.accounts.includes(requested))return;
  if(state.pending[requested])return showToast('This account already has a pending request','info');
  selectAccount(requested);
}
function renderDropdown(){
  const query=pick('#ddSearch').value.trim().toLowerCase();
  pick('#ddItems').innerHTML=state.accounts.filter(username=>!query||username.includes(query)||(state.names[username]||'').toLowerCase().includes(query)).map(username=>{
    const pending=Boolean(state.pending[username]);
    return`<div class="row acct${pending?' off':''}" ${pending?'':'data-act="select" '}data-u="${escapeHtml(username)}"><div class="av sm">${escapeHtml(username[0].toUpperCase())}</div><div class="gr"><b>@${escapeHtml(username)}</b><small>${escapeHtml(state.names[username]||'')}</small></div>${pending?'<span class="tag">Pending</span>':''}</div>`;
  }).join('')||'<div class="empty">No accounts</div>';
}
function selectAccount(username){
  if(state.balanceRef)state.balanceRef.off();
  state.selected=username;
  state.useMax=false;
  pick('#amount').value='';
  pick('#ddLabel').textContent='@'+username;
  pick('#dd').classList.remove('open');
  pick('#ddList').classList.add('hide');
  pick('#balanceBox').classList.remove('hide');
  state.balanceRef=bank.child('users/'+username+'/main');
  state.balanceRef.on('value',snapshot=>{
    state.balance=+snapshot.val()||0;
    pick('#balance').textContent=formatMoney(state.balance);
    if(state.useMax)pick('#amount').value=floorCents(state.balance).toFixed(2);
    evaluate();
  });
  evaluate();
}
const currentAmount=()=>state.useMax?floorCents(state.balance):roundCents(pick('#amount').value);
function evaluate(){
  const amount=currentAmount();
  const ready=state.selected&&!state.pending[state.selected]&&amount>0&&amount<=floorCents(state.balance)&&pick('#password').value.length>0&&/^\d{4,6}$/.test(pick('#pin').value);
  pick('#submit').classList.toggle('ready',Boolean(ready));
}
async function readValue(path){return(await bank.child(path).once('value')).val()}
async function submitRequest(){
  const button=pick('#submit');
  if(state.busy||!button.classList.contains('ready'))return;
  if(Date.now()<state.lockedUntil)return showToast('Too many attempts. Try again in a minute','error');
  state.busy=true;
  button.classList.add('busy');
  try{
    const username=state.selected,amount=currentAmount();
    const[storedPassword,storedPin,name]=await Promise.all([readValue('users/'+username+'/ph'),readValue('users/'+username+'/pinHash'),readValue('users/'+username+'/name')]);
    if(!storedPin)return showToast('Set a transaction PIN in SK Bank first','error');
    const[passwordHash,pinHash]=await Promise.all([hashPassword(username,pick('#password').value),hashPassword('pin:'+username,pick('#pin').value)]);
    if(passwordHash!==storedPassword||pinHash!==storedPin){
      if(++state.failures>=5){state.failures=0;state.lockedUntil=Date.now()+6e4}
      return showToast('Incorrect password or PIN','error');
    }
    state.failures=0;
    const id='W'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,4).toUpperCase(),now=Date.now();
    const slot=await bank.child('pendingWithdrawals/'+username).transaction(current=>current?undefined:{id,amount,ts:now});
    if(!slot.committed)return showToast('This account already has a pending request','error');
    await bank.child('users/'+username+'/main').once('value');
    const debit=await bank.child('users/'+username+'/main').transaction(balance=>{
      const next=Math.round(((+balance||0)-amount)*1e8)/1e8;
      return next<0?undefined:next;
    });
    if(!debit.committed){await bank.child('pendingWithdrawals/'+username).remove();return showToast('Insufficient balance','error')}
    const entry={id,ts:now,type:'withdrawal',from:username,to:'Withdrawal',fromName:name||username,toName:'Real money withdrawal',amt:amount,tax:0,net:amount,note:'Pending approval'};
    await bank.update({
      ['withdrawals/'+id]:{id,username,name:name||username,amount,status:'pending',ts:now},
      ['vault/withdrawalHold']:increment(amount),
      ['ledger/'+id]:entry,
      ['userTx/'+username+'/'+id]:entry,
      ['network/'+username+'/nw']:increment(-amount)
    });
    bank.child('notes/'+username).push({ts:now,cat:'system',title:'Withdrawal requested',msg:formatMoney(amount)+' is pending approval',read:false});
    showDone(username,amount);
  }catch(error){
    console.error(error);
    showToast('Something went wrong. Please try again','error');
  }finally{
    state.busy=false;
    button.classList.remove('busy');
  }
}
function showDone(username,amount){
  pick('#formCard').classList.add('hide');
  pick('#doneCard').classList.remove('hide');
  pick('#doneAmount').textContent=formatMoney(amount);
  pick('#doneAccount').textContent='@'+username;
}
function reset(){
  if(state.balanceRef)state.balanceRef.off();
  Object.assign(state,{selected:null,useMax:false,balance:0});
  pick('#ddLabel').textContent='Choose account';
  ['#amount','#password','#pin'].forEach(selector=>pick(selector).value='');
  pick('#balanceBox').classList.add('hide');
  pick('#doneCard').classList.add('hide');
  pick('#formCard').classList.remove('hide');
  renderDropdown();
  evaluate();
}
const actions={
  toggle(){pick('#dd').classList.toggle('open');pick('#ddList').classList.toggle('hide');pick('#ddSearch').value='';renderDropdown()},
  select:target=>selectAccount(target.dataset.u),
  max(){
    if(!state.selected)return showToast('Choose an account first','info');
    state.useMax=true;
    pick('#amount').value=floorCents(state.balance).toFixed(2);
    evaluate();
  },
  submit:submitRequest,
  again:reset,
  home:()=>navigateTo(MAIN_APP_URL),
  toggleTheme:()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light')
};
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-act]');
  if(target&&target.dataset.act&&actions[target.dataset.act])actions[target.dataset.act](target);
});
['#password','#pin'].forEach(selector=>pick(selector).addEventListener('input',evaluate));
pick('#amount').addEventListener('input',()=>{state.useMax=false;evaluate()});
pick('#ddSearch').addEventListener('input',renderDropdown);
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,event=>event.preventDefault()));
addEventListener('pageshow',event=>{if(event.persisted)document.body.classList.remove('leaving')});
bank.child('pendingWithdrawals').on('value',snapshot=>{
  state.pending=snapshot.val()||{};
  state.pendingReady=true;
  if(state.selected&&state.pending[state.selected]&&!state.busy&&pick('#doneCard').classList.contains('hide'))reset();
  renderDropdown();
  evaluate();
  applyRequestedAccount();
});
bank.child('network').on('value',snapshot=>{
  state.names={};
  Object.values(snapshot.val()||{}).forEach(entry=>{if(entry&&entry.u)state.names[entry.u]=entry.name||''});
  renderDropdown();
});
loadAccounts();