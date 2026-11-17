const creation=require('./whatsapp-create');
const {parseDue,validDue}=require('../api/task-intent');
const normalize=s=>String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const live=t=>t.status==='open'&&!t.completed_at&&!t.deleted_at&&!t.tombstone&&!t.is_deleted;
function candidates(target,tasks){
 const wanted=normalize(target);if(!wanted)return [];
 const rows=tasks.filter(live),exact=rows.filter(t=>normalize(t.title)===wanted);
 return exact.length?exact:rows.filter(t=>normalize(t.title).includes(wanted));
}
const label=due=>due?new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(due))+' (Lagos)':'no due date';
function updates(task,c,now){
 const out={};if('title'in c)out.title=c.title.trim();
 let due=task.due_at,rec='recurrence'in c?c.recurrence:task.recurrence;
 if('when'in c||'due_at'in c){
  due=c.when?validDue(parseDue(c.when,now)):null;
  due ||= typeof c.due_at==='string'&&/\+01:00$/.test(c.due_at)?validDue(c.due_at):null;
  if(c.when&&/^(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i.test(c.when.trim())&&task.due_at&&due){
   const day=new Date(Date.parse(task.due_at)+3600000).toISOString().slice(0,10);
   due=validDue(day+new Date(Date.parse(due)+3600000).toISOString().slice(10,19)+'+01:00');
  }
  if(!due&&!(c.due_at===null&&!c.when&&!rec))return null;
  out.due_at=due;
 }
 if(rec){
  if(!due)due=validDue(parseDue('9am',now));
  if(rec==='weekly')rec='weekly:'+(new Date(Date.parse(due)+3600000).getUTCDay()||7);
  const decoded=creation.decode(JSON.stringify({reply:'schedule',action:{intent:'create',request:'schedule',title:task.title,when:null,due_at:new Date(Date.parse(due)+3600000).toISOString().slice(0,19)+'+01:00',recurrence:rec}}),'schedule',now);
  if(!decoded.task)return null;
  if('recurrence'in c||'due_at'in out) {out.due_at=decoded.task.due_at;out.recurrence=decoded.task.recurrence;}
 }else if('recurrence'in c)out.recurrence=null;
 return out;
}
async function save(db,user,action,now){
 const rows=await db('tasks',{select:'*',user_id:'eq.'+user,status:'eq.open',limit:'501'});
 if(rows.length>500)return 'I could not safely check the whole list. Please use Tasks in Steep 🌿';
 const found=candidates(action.target,rows);
 if(!found.length)return 'I cannot find that open task. Send tasks to check its name 🌿';
 if(found.length>1)return 'Which task did you mean? '+found.slice(0,5).map(t=>'“'+t.title+'” ('+label(t.due_at)+')').join('; ')+'. Send the full request with its exact title 🌿';
 const task=found[0],change=action.intent==='edit'?updates(task,action.changes,now):null;
 if(action.intent==='edit'&&!change)return 'What date, time or repeat pattern should I use? Nothing changed 🌿';
 // Compare the snapshot as well as owner and open status: never revive a completed row.
 const q={id:'eq.'+task.id,user_id:'eq.'+user,status:'eq.open',title:'eq.'+task.title,due_at:task.due_at?'eq.'+task.due_at:'is.null',recurrence:task.recurrence?'eq.'+task.recurrence:'is.null',completed_at:'is.null'};
 let changed;
 try{changed=await db('tasks',q,action.intent==='delete'?'DELETE':'PATCH',change||undefined);}catch{return 'Sorry, I could not confirm that change. Please refresh Tasks in Steep before retrying 🌿';}
 if(!changed?.some(t=>t.id===task.id))return 'I cannot find that unchanged open task now. Send tasks for the latest list 🌿';
 if(action.intent==='delete')return 'Deleted “'+task.title+'”. 🌿';
 const parts=[];
 if('title'in change)parts.push('renamed “'+task.title+'” to “'+change.title+'”');
 if('due_at'in change)parts.push('due '+label(change.due_at));
 if('recurrence'in action.changes)parts.push(change.recurrence?'repeats '+change.recurrence:'no longer repeats');
 return 'Done — '+('title'in change?'':'“'+task.title+'”: ')+parts.join(' · ')+'. 🌿';
}
module.exports={save,candidates,updates};
