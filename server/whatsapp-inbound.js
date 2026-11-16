const signature=require('./whatsapp-signature');
const {config,database} = require('./whatsapp-db');
const {isAffirmative} = require('./affirmative');
const {snoozeMinutes,completion} = require('./whatsapp-tasks');
const escape = s => String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const dueLabel = due => due ? new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(due))+' (Lagos)' : 'No due date';
async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const conf=config();
  if(conf.missing) return res.status(503).json({error:'config-missing',missing:conf.missing});
  const params=typeof req.body==='string' || Buffer.isBuffer(req.body) ? Object.fromEntries(new URLSearchParams(String(req.body))) : req.body;
  if(!params || Object.values(params).some(v=>typeof v!=='string') || !signature(req,params)) return res.status(403).json({error:'Forbidden'});
  const wa=String(params.From || '').replace(/^whatsapp:/i,'').replace(/\D/g,''), body=String(params.Body || '').trim();
  if(!/^[1-9]\d{6,14}$/.test(wa) || !params.MessageSid) return res.status(400).json({error:'Invalid message'});
  const reply = text => {res.setHeader('Content-Type','text/xml; charset=utf-8');return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>'+escape(text)+'</Message></Response>');};
  const db=database(conf), now=Date.now(), at=new Date(now).toISOString();
  try {
    const receipt=await db('whatsapp_inbound_log',{on_conflict:'message_sid'},'POST',{message_sid:params.MessageSid},'resolution=ignore-duplicates,return=representation');
    if(!receipt.length) return reply('That message was already handled.');
    let [link]=await db('whatsapp_links',{select:'*',wa_id:'eq.'+wa,status:'eq.linked'});
    if(!link) {
      const code=(body.match(/^link\s+([a-z0-9]{6,8})\b/i)?.[1] || body.match(/^[a-f0-9]{8}$/i)?.[0])?.toUpperCase();
      if(code) {
        const changed=await db('whatsapp_links',{link_code:'eq.'+code,status:'eq.pending',expires_at:'gt.'+at},'PATCH',{wa_id:wa,status:'linked',linked_at:at,updated_at:at});
        if(changed.length) return reply('You’re linked to Steep 🌿 Reply okay to finish a due task, snooze 10 to take a little longer, or tasks to see your list.');
        return reply('That link code has expired or was already used. Get a fresh one in Steep’s Settings.');
      }
      return reply('Let’s link your Steep account first. Open Steep → Settings → tap Link WhatsApp, then tap Send in WhatsApp. 🌿');
    }
    const tasks=await db('tasks',{select:'*',user_id:'eq.'+link.user_id,status:'eq.open',order:'due_at.asc.nullslast,id.asc',limit:'500'});
    const open=tasks.filter(t=>!t.completed_at && !t.deleted_at && !t.tombstone && !t.is_deleted);
    if(/^tasks[.!?]*$/i.test(body)) return reply(open.length ? open.slice(0,5).map((t,i)=>(i+1)+'. '+t.title+' — '+dueLabel(t.due_at)).join('\n') : 'All clear. No open tasks right now 🌿');
    const due=open.filter(t=>Number.isFinite(Date.parse(t.due_at)) && Date.parse(t.due_at)<=now);
    let task;
    if(due.length) {
      const logs=[];
      for(let i=0;i<due.length;i+=75) logs.push(...await db('notify_log',{select:'task_id,due_at,notified_at',status:'eq.sent',task_id:'in.('+due.slice(i,i+75).map(t=>t.id).join(',')+')',order:'notified_at.desc'}));
      logs.sort((a,b)=>Date.parse(b.notified_at)-Date.parse(a.notified_at));
      for(const log of logs) {task=due.find(t=>t.id===log.task_id && Date.parse(t.due_at)===Date.parse(log.due_at));if(task)break;}
      task ||= due[0];
    }
    const minutes=snoozeMinutes(body);
    const yes=minutes===null && await isAffirmative(body,task?'Complete the due task: '+task.title:'Complete a due task');
    if(minutes!==null || yes) {
      if(!task) return reply('No due task is waiting right now. Send tasks to see what’s ahead.');
      const updates=minutes!==null ? {due_at:new Date(now+minutes*60000).toISOString()} : completion(task,now);
      const changed=await db('tasks',{id:'eq.'+task.id,user_id:'eq.'+link.user_id,status:'eq.open',due_at:'eq.'+task.due_at},'PATCH',updates);
      if(!changed.length) return reply('That task changed just now. Send tasks to see the latest.');
      return reply(minutes!==null ? 'A little breathing room 🌿 '+task.title+' — '+dueLabel(updates.due_at) : 'Done 🌿 '+task.title+(task.recurrence ? '\nNext: '+dueLabel(updates.due_at) : ' — one less thing to carry.'));
    }
    return reply('I’m here 🌿 For now, reply okay to complete your latest due reminder, snooze 10 (or 2h) to move it, or tasks for your list. Full chat is coming.');
  } catch { return res.status(503).json({error:'WhatsApp is temporarily unavailable. Please check Steep before trying again.'}); }
}
module.exports=handler;
module.exports.signature=signature;
