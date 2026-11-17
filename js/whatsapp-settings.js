import {authHeaders,getSession,onAuthChange} from './auth.js';
const SANDBOX='+1 415 523 8886';
const button=document.getElementById('whatsapp-link'), status=document.getElementById('whatsapp-status');
const unlink=document.getElementById('whatsapp-unlink');
if(button && status && unlink) {
let generation=0, pending=null, account=null, inFlight=0, lastReturn=-Infinity;
const RETURN_INTERVAL=10000;
const key=owner=>'steep:whatsapp-link:'+owner;
const valid=()=>pending && /^[A-F0-9]{8}$/.test(pending.code) && Date.parse(pending.expires_at)>Date.now();
function remember(owner) {
  try { if(pending) sessionStorage.setItem(key(owner),JSON.stringify(pending)); } catch {}
}
function render(data) {
  button.hidden=data.status==='linked';
  unlink.hidden=data.status!=='linked';
  const text=data.status==='linked' ? 'WhatsApp is linked 🌿' :
    'Tap Send when WhatsApp opens. First time? Send "join repeat-hidden" to '+SANDBOX+' once to join the sandbox. Sandbox sessions expire after 72 hours.'+
    (valid() ? ' Manual fallback: send '+pending.code+' to '+SANDBOX+'. This code expires at '+new Date(pending.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'.' : ' Your code will appear here when you tap Link WhatsApp.');
  if(status.textContent!==text) status.textContent=text;
}
async function load(open=false,silent=false) {
  const version=++generation, owner=getSession()?.user?.id;
  if(!owner) return;
  const current=()=>version===generation && owner===getSession()?.user?.id;
  inFlight++;
  if(!silent) button.disabled=unlink.disabled=true;
  try {
    const headers=await authHeaders();
    if(!current()) return;
    const r=await fetch('/api/whatsapp-link',{headers,cache:'no-store'});
    const data=await r.json();
    if(!current()) return;
    if(!r.ok) throw Error(data.error || 'Could not link WhatsApp.');
    if(open && data.status!=='linked') {
      const needsRefresh=!valid() || Date.parse(pending.expires_at)-Date.now()<=120000;
      const allowed=!pending || Date.now()-pending.created_at>=30000;
      if(needsRefresh && allowed) {
        const fresh=await fetch('/api/whatsapp-link',{method:'POST',headers,cache:'no-store'});
        const result=await fresh.json();
        if(!current()) return;
        if(fresh.ok && result.status==='linked') {render(result);return;}
        if(fresh.ok && /^[A-F0-9]{8}$/.test(result.code) && Date.parse(result.expires_at)>Date.now()) {
          pending={code:result.code,expires_at:result.expires_at,created_at:Date.now()};remember(owner);
        } else if(!(fresh.status===429 && valid())) throw Error(result.error || 'Could not get a fresh code. Please try again.');
      }
      if(!valid()) throw Error('Please wait 30 seconds, then tap Link WhatsApp again.');
    }
    render(data);
    if(open && data.status!=='linked' && valid()) window.location.assign('https://wa.me/'+SANDBOX.replace(/\D/g,'')+'?text='+encodeURIComponent(pending.code));
  } catch(e) {if(!silent && current()) status.textContent=e.message+(valid() ? ' Manual fallback: send '+pending.code+' to '+SANDBOX+'.' : '');}
  finally {inFlight--;if(!silent && current()) button.disabled=unlink.disabled=false;}
}
// Safari may emit several lifecycle events for one return.
function refreshOnReturn() {
  if(document.visibilityState==='hidden' || !getSession()?.user?.id || inFlight || Date.now()-lastReturn<RETURN_INTERVAL) return;
  lastReturn=Date.now();
  return load(false,true);
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') return refreshOnReturn();
});
window.addEventListener('focus',refreshOnReturn);
window.addEventListener('pageshow',event=>{
  if(event.persisted) return refreshOnReturn();
});
button.addEventListener('click',()=>load(true));
unlink.addEventListener('click',async()=>{
  const owner=getSession()?.user?.id;
  if(!owner || unlink.disabled || !window.confirm('Unlink WhatsApp? Reminder pings will stop. Your chat history is kept so you can relink later.')) return;
  const version=++generation, current=()=>version===generation && owner===getSession()?.user?.id;
  inFlight++;
  button.disabled=unlink.disabled=true;
  try {
    const headers=await authHeaders();
    if(!current()) return;
    const r=await fetch('/api/whatsapp-link',{method:'POST',headers:{...headers,'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action:'unlink'})});
    const data=await r.json();
    if(!current()) return;
    if(!r.ok) throw Error(data.error || 'Could not unlink WhatsApp. Please try again.');
    pending=null;try {sessionStorage.removeItem(key(owner));} catch {}
    render(data);
  } catch(e) {if(current()) status.textContent=e.message;}
  finally {inFlight--;if(current()) button.disabled=unlink.disabled=false;}
});
onAuthChange(session=>{
  generation++;
  lastReturn=-Infinity;
  const owner=session?.user?.id;
  if(account && account!==owner) {try {sessionStorage.removeItem(key(account));} catch {}}
  account=owner;pending=null;
  if(owner) {try {pending=JSON.parse(sessionStorage.getItem(key(owner)));} catch {}}
  status.textContent='';button.hidden=false;button.disabled=false;unlink.hidden=true;unlink.disabled=false;
  if(owner) load();
});
}
