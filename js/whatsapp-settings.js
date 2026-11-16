import {authHeaders,getSession,onAuthChange} from './auth.js';
const button=document.getElementById('whatsapp-link'), status=document.getElementById('whatsapp-status');
let generation=0;
async function load(create=false) {
  const version=++generation, owner=getSession()?.user?.id;
  if(!owner) return;
  button.disabled=true;
  try {
    const headers=await authHeaders();
    const r=await fetch('/api/whatsapp-link',{method:create?'POST':'GET',headers,cache:'no-store'});
    const data=await r.json();
    if(version!==generation || owner!==getSession()?.user?.id) return;
    if(!r.ok) throw Error(data.error || 'Could not link WhatsApp.');
    button.hidden=data.status==='linked';
    status.textContent=data.status==='linked' ? 'WhatsApp is linked 🌿' : data.code
      ? 'Send link '+data.code+' to '+data.sandbox+' on WhatsApp. This code expires in 15 minutes. If needed, first send join repeat-hidden to join the sandbox (lasts 72 hours).'
      : 'Get a one-use code to link your WhatsApp reminders.';
  } catch(e) {if(version===generation && owner===getSession()?.user?.id) status.textContent=e.message;}
  finally {if(version===generation) button.disabled=false;}
}
button.addEventListener('click',()=>load(true));
onAuthChange(session=>{generation++;status.textContent='';button.hidden=false;if(session) load();});
