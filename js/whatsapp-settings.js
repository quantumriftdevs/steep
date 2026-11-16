import {authHeaders,getSession,onAuthChange} from './auth.js';
const SANDBOX='+1 415 523 8886';
const button=document.getElementById('whatsapp-link'), status=document.getElementById('whatsapp-status');
let generation=0, pending=null, account=null;
const key=owner=>'steep:whatsapp-link:'+owner;
const valid=()=>pending && /^[A-F0-9]{8}$/.test(pending.code) && Date.parse(pending.expires_at)>Date.now();
function remember(owner) {
  try { if(pending) sessionStorage.setItem(key(owner),JSON.stringify(pending)); } catch {}
}
function render(data) {
  button.hidden=data.status==='linked';
  status.textContent=data.status==='linked' ? 'WhatsApp is linked 🌿' :
    'Tap Send when WhatsApp opens. First time? Send "join repeat-hidden" to '+SANDBOX+' once to join the sandbox. Sandbox sessions expire after 72 hours.'+
    (valid() ? ' Manual fallback: send '+pending.code+' to '+SANDBOX+'. This code expires at '+new Date(pending.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'.' : ' Your code will appear here when you tap Link WhatsApp.');
}
async function load(open=false) {
  const version=++generation, owner=getSession()?.user?.id;
  if(!owner) return;
  const current=()=>version===generation && owner===getSession()?.user?.id;
  button.disabled=true;
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
  } catch(e) {if(current()) status.textContent=e.message+(valid() ? ' Manual fallback: send '+pending.code+' to '+SANDBOX+'.' : '');}
  finally {if(current()) button.disabled=false;}
}
button.addEventListener('click',()=>load(true));
onAuthChange(session=>{
  generation++;
  const owner=session?.user?.id;
  if(account && account!==owner) {try {sessionStorage.removeItem(key(account));} catch {}}
  account=owner;pending=null;
  if(owner) {try {pending=JSON.parse(sessionStorage.getItem(key(owner)));} catch {}}
  status.textContent='';button.hidden=false;button.disabled=false;
  if(owner) load();
});
