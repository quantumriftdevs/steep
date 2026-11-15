// Backend-only WhatsApp reminders. Apply the approved notify_log migration first.
// A durable pending claim is never automatically retried: a lost Twilio response
// cannot establish whether it accepted the message. This favors no duplicates.
const { timingSafeEqual } = require('crypto');
const CAP = 3;
function dueTasks(rows, now) {
  return rows.filter(t => t.status === 'open' && !t.completed_at && !t.deleted_at && !t.tombstone && !t.is_deleted &&
    Number.isFinite(Date.parse(t.due_at)) && Date.parse(t.due_at) <= now)
    .sort((a,b) => Date.parse(a.due_at)-Date.parse(b.due_at) || a.id.localeCompare(b.id));
}
function same(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const env=process.env;
  const supplied=req.headers?.['x-notify-secret'] || req.query?.secret;
  if (!same(env.NOTIFY_SECRET,supplied)) return res.status(401).json({error:'Unauthorized'});
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOTIFY_USER_EMAIL','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','WHATSAPP_TO'];
  const missing=names.filter(k=>!env[k]?.trim());
  if (missing.length) { console.error('notify: config-missing',missing.join(', ')); return res.status(503).json({error:'config-missing',missing}); }
  const phone=env.WHATSAPP_TO.replace(/^whatsapp:/,'').trim().replace(/^[+]/, '');
  if (!/^[1-9][0-9]{6,14}$/.test(phone)) return res.status(503).json({error:'config-invalid',field:'WHATSAPP_TO'});
  const base=env.SUPABASE_URL.replace(/[/]$/,'');
  const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  const now=Date.now();
  const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(12000)});
  async function db(path,method='GET',body,prefer='return=representation') {
    const r=await request(base+path,{method,headers:{...headers,Prefer:prefer},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if (!r.ok) throw Error('Supabase request failed ('+r.status+'); check configuration and notify_log migration');
    return r.status===204 ? [] : r.json();
  }
  let attempts=0, accepted=0;
  const errors=[];
  try {
    let user;
    for(let page=1;!user;page++) {
      const r=await db('/auth/v1/admin/users?page='+page+'&per_page=100');
      if (!Array.isArray(r.users)) throw Error('Invalid account lookup response');
      user=r.users.find(u=>u.email?.toLowerCase()===env.NOTIFY_USER_EMAIL.trim().toLowerCase());
      if (r.users.length<100) break;
    }
    if (!user?.id) return res.status(503).json({error:'recipient-account-not-found'});
    const all=[];
    for(let offset=0;;offset+=500) {
      const q=new URLSearchParams({select:'*',user_id:'eq.'+user.id,status:'eq.open',completed_at:'is.null',due_at:'lte.'+new Date(now).toISOString(),order:'due_at.asc,id.asc',limit:'500',offset:String(offset)});
      const rows=await db('/rest/v1/tasks?'+q);
      if (!Array.isArray(rows)) throw Error('Invalid tasks response');
      all.push(...rows); if(rows.length<500) break;
    }
    for(const task of dueTasks(all,now)) {
      if(attempts>=CAP) break;
      const event={task_id:task.id,due_at:new Date(task.due_at).toISOString()};
      const q=new URLSearchParams({task_id:'eq.'+event.task_id,due_at:'eq.'+event.due_at});
      let claim=await db('/rest/v1/notify_log?on_conflict=task_id,due_at','POST',{...event,status:'pending'},'resolution=ignore-duplicates,return=representation');
      if(!claim.length) claim=await db('/rest/v1/notify_log?'+q+'&status=eq.failed','PATCH',{status:'pending',updated_at:new Date().toISOString()});
      if(!claim.length) continue;
      // Recheck after the claim so deleted/completed/rescheduled rows cannot be sent from a stale snapshot.
      const fresh=await db('/rest/v1/tasks?'+new URLSearchParams({select:'*',id:'eq.'+task.id,user_id:'eq.'+user.id,due_at:'eq.'+event.due_at}));
      if(!dueTasks(fresh,now).length) { await db('/rest/v1/notify_log?'+q,'PATCH',{status:'failed'}); continue; }
      attempts++;
      const due=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(task.due_at));
      const body=new URLSearchParams({From:'whatsapp:+14155238886',To:'whatsapp:+'+phone,Body:'A gentle nudge from Steep 🌿\n'+task.title+'\nDue '+due+' (Lagos). One small step when you’re ready.'});
      let r, data;
      try {
        r=await request('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(env.TWILIO_ACCOUNT_SID)+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body});
        data=await r.json();
      } catch (_) {
        console.error('notify: Twilio outcome unknown; pending claim retained');
        errors.push({error:'twilio-outcome-unknown',retry:false}); continue;
      }
      if(!r.ok || ['failed','undelivered'].includes(data.status)) {
        const code=Number.isInteger(data.code)?data.code:null;
        // 63016: outside WhatsApp window; 63015: recipient not joined;
        // 21608: trial recipient unverified; 20003: authentication failure.
        // All explicit API rejections are retryable, not only these examples.
        console.error('notify: Twilio rejected',r.status,code);
        errors.push({error:'twilio-rejected',httpStatus:r.status,code,retry:true});
        await db('/rest/v1/notify_log?'+q,'PATCH',{status:'failed',error_code:code,updated_at:new Date().toISOString()});
      } else if(typeof data.sid==='string' && data.sid && !['failed','undelivered'].includes(data.status)) {
        await db('/rest/v1/notify_log?'+q,'PATCH',{status:'sent',notified_at:new Date().toISOString(),message_sid:data.sid,updated_at:new Date().toISOString()});
        accepted++;
      } else {
        errors.push({error:'twilio-outcome-unknown',retry:false});
        console.error('notify: unexpected Twilio response; pending claim retained');
      }
    }
    return res.status(errors.length?502:200).json({attempts,accepted,errors});
  } catch (_) {
    console.error('notify: Supabase/configuration failure; inspect notify_log migration and pending claims');
    return res.status(503).json({error:'notify-backend-failed',attempts,accepted});
  }
}
module.exports=handler;
module.exports.dueTasks=dueTasks;

