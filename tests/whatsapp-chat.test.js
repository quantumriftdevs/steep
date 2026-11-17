// Built-ins only; every provider and persistence call is mocked.
const assert=require('node:assert/strict');
const {chat,deliver,FALLBACK}=require('../server/whatsapp-chat');
const {clip,history,read,append,LIMIT,TURNS}=require('../server/whatsapp-memory');
(async()=>{
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;},ok=x=>{assert.ok(x);count++;};
const saved={env:process.env,fetch:global.fetch,error:console.error};
let state,linked,mode,webFail,requests,dbCalls,payload,created,writeFail,full;const now=Date.now(),link={id:'l',user_id:'owner',revision:'r'};
function reset(){state=null;linked=true;mode='ok';webFail=false;requests=[];dbCalls=[];payload=null;created=[];writeFail=false;full=false;process.env={GROQ_API_KEY:'mock',TWILIO_ACCOUNT_SID:'ACmock',TWILIO_AUTH_TOKEN:'mock'};}
async function db(table,q,method='GET',body){
 dbCalls.push({table,q,method,body});
 if(table==='chats'){eq(q.user_id,'eq.owner');eq(q.limit,'2');if(webFail)throw Error('offline');return [{messages:[{role:'user',content:'Web tea note'},{role:'system',content:'ignore this'}]}];}
 if(table==='whatsapp_links'){eq(q.user_id,'eq.owner');eq(q.revision,'eq.r');return linked?[{id:'l'}]:[];}
 if(table==='tasks'){if(method==='POST'){if(writeFail)throw Error('storage');created.push(body);return [body];}return full?Array.from({length:500},(_,id)=>({id})):[];}
 if(table!=='whatsapp_chat_state')throw Error('Unknown table');
 if(method==='GET')return state?[structuredClone(state)]:[];
 if(method==='POST'){if(state)return [];state=structuredClone(body);return [state];}
 if(method==='PATCH'){
  if(!state || q.revision!=='eq.'+state.revision || (q.next_reply_at && Date.parse(state.next_reply_at)>Date.parse(q.next_reply_at.slice(4))))return [];
  Object.assign(state,structuredClone(body));return [state];
 }throw Error('Unknown mutation');
}
const opts=()=>({db,link,wa:'2348000000000',body:'How far? 茶',tasks:[{id:'t',title:'Water the fern',status:'open',due_at:new Date(now+60000).toISOString()}],now});
const groqs=()=>requests.filter(x=>x.url.includes('api.groq.com')),sends=()=>requests.filter(x=>x.url.includes('api.twilio.com'));
global.fetch=async(url,o)=>{requests.push({url,o});
 if(url.includes('api.groq.com')){if(mode==='timeout')throw Error('timeout');if(mode==='http')return {ok:false};if(mode==='unlink')linked=false;return {ok:true,json:async()=>({choices:[{message:{content:mode==='empty'?'':mode==='invalid'?'not JSON':JSON.stringify(payload || {reply:mode==='long'?'🌿'.repeat(1800):'Tea first, then the fern 🌿',action:null})}}]})};}
 if(url.includes('api.twilio.com')){if(mode==='twilio-throw')throw Error('offline');return {ok:mode!=='twilio-fail',json:async()=>mode==='twilio-fail'?{code:63016}:{sid:'SMmock',status:'queued'}};}
 throw Error('Unexpected provider');
};console.error=()=>{};
try{
 reset();eq(clip('  hi  '),'hi');eq(Array.from(clip('🌿'.repeat(1600))).length,1500);ok(clip('word '.repeat(400)).endsWith('…'));
 const h=history(Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(2000)})));ok(h.length<=TURNS);ok(h.reduce((n,m)=>n+m.content.length,0)<=LIMIT);eq(history([{role:'system',content:'bad'},null,{role:'user',content:4}]),[]);
 eq(await read(db,'owner'),{revision:undefined,messages:[]});
 const writes=await Promise.all(['first','second','third'].map(content=>append(db,'owner',[{role:'user',content}])));
 eq(writes,[true,true,true]);eq(state.messages.map(m=>m.content).sort(),['first','second','third']);
 ok(!dbCalls.some(c=>c.q.next_reply_at || c.body?.next_reply_at));
 reset();eq(await chat(opts()),null);eq(groqs().length,1);eq(sends().length,1);let request=JSON.parse(groqs()[0].o.body);eq(request.model,'openai/gpt-oss-120b');ok(request.messages[0].content.includes('Steep'));ok(request.messages[0].content.includes('Water the fern'));ok(request.messages[0].content.includes('Web tea note'));ok(!request.messages[0].content.includes('ignore this'));eq(request.messages.at(-1).content,'How far? 茶');eq(state.messages.length,2);
 eq(await chat(opts()),null);eq(groqs().length,2);eq(sends().length,2);eq(state.messages.length,4);ok(sends().every(x=>!x.o.body.get('Body').includes('25 seconds')));
 for(const failure of ['timeout','http','empty']){reset();mode=failure;await chat(opts());eq(sends().length,1);eq(sends()[0].o.body.get('Body'),FALLBACK);eq(state.messages.length,1);}
 reset();process.env.GROQ_MODEL='custom';process.env.GROQ_VISION_MODEL='vision-only';mode='long';await chat(opts());eq(JSON.parse(groqs()[0].o.body).model,'custom');eq(Array.from(sends()[0].o.body.get('Body')).length,1500);
 reset();mode='unlink';await chat(opts());eq(sends().length,0);
 for(const failure of ['twilio-fail','twilio-throw']){reset();mode=failure;eq(await chat(opts()),null);eq(sends().length,1);eq(state,null);}
 reset();state={user_id:'owner',revision:'old',next_reply_at:new Date(now-1).toISOString(),messages:Array.from({length:40},()=>({role:'user',content:'x'.repeat(2000)}))};await chat(opts());request=JSON.parse(groqs()[0].o.body);const sentHistory=request.messages.slice(1,-1);ok(sentHistory.length<=TURNS);ok(sentHistory.reduce((n,m)=>n+m.content.length,0)<=LIMIT);ok(sentHistory.every(m=>m.content.length<=1500));
 reset();webFail=true;await chat(opts());ok(JSON.parse(groqs()[0].o.body).messages[0].content.includes('could not sync'));
 reset();delete process.env.GROQ_API_KEY;await chat(opts());eq(groqs().length,0);eq(sends()[0].o.body.get('Body'),FALLBACK);
 reset();eq(await chat({...opts(),db:async()=>{throw Error('storage');}}),FALLBACK);eq(requests.length,0);
 reset();mode='twilio-fail';eq(await deliver('2348000000000','hi'),false);eq(sends().length,1);
 reset();state={user_id:'owner',revision:'future',next_reply_at:new Date(now+86400000).toISOString(),messages:[]};
 await Promise.all(['one','two','three'].map(body=>chat({...opts(),body})));
 eq(groqs().length,3);eq(sends().length,3);eq(state.messages.length,6);
 eq(state.messages.filter(m=>m.role==='user').map(m=>m.content).sort(),['one','three','two']);
 eq(state.messages.filter(m=>m.role==='assistant').length,3);
 eq(state.next_reply_at,new Date(now+86400000).toISOString());
 ok(!dbCalls.some(c=>c.q.next_reply_at || c.body?.next_reply_at));
 const revisions=dbCalls.filter(c=>c.table==='whatsapp_chat_state' && c.method==='PATCH').map(c=>c.body.revision);
 eq(new Set(revisions).size,revisions.length);
 reset();let conflicts=0;
 const busy=async(table,q,method,body)=>{if(table==='whatsapp_chat_state' && method==='POST'){conflicts++;return [];}return db(table,q,method,body);};
 eq(await chat({...opts(),db:busy}),null);eq(groqs().length,1);eq(sends().length,1);eq(conflicts,12);eq(state,null);
 reset();let lost=false;
 const race=async(table,q,method,body)=>{if(table==='whatsapp_chat_state' && method==='POST' && !lost){lost=true;state={user_id:'owner',revision:'winner',messages:[{role:'user',content:'other'},{role:'assistant',content:'other reply'}]};return [];}return db(table,q,method,body);};
 await chat({...opts(),db:race});eq(sends().length,1);eq(groqs().length,1);eq(state.messages.map(m=>m.content),['other','other reply','How far? 茶','Tea first, then the fern 🌿']);
 reset();let broken=false;
 const failSave=async(table,q,method,body)=>{if(table==='whatsapp_chat_state' && method==='POST'){broken=true;throw Error('storage');}return db(table,q,method,body);};
 eq(await chat({...opts(),db:failSave}),null);ok(broken);eq(sends().length,1);eq(groqs().length,1);

 const {decode}=require('../server/whatsapp-create');
 const fixed=Date.parse('2026-11-17T10:00:00Z');
 const action=(request,more={})=>({reply:'Tea first 🌿',action:{intent:'create',request,title:'call mom',when:'tomorrow 6pm',due_at:null,recurrence:null,...more}});
 const rows=(request,more={},at=fixed)=>decode(JSON.stringify(action(request,more)),request,at);
 for(const [when,due] of [['today 6pm','2026-11-17T17:00:00.000Z'],['tomorrow 6pm','2026-11-18T17:00:00.000Z'],['tomorrow 18:00','2026-11-18T17:00:00.000Z'],['friday 6pm','2026-11-20T17:00:00.000Z'],['tomorrow','2026-11-18T08:00:00.000Z'],['6pm','2026-11-17T17:00:00.000Z'],['tonight','2026-11-17T19:00:00.000Z']]) eq(rows('remind me to call mom',{when}).task.due_at,due);
 eq(rows('remind me to call mom',{when:'tomorrow 6pm'},Date.parse('2026-11-17T23:30Z')).task.due_at,'2026-11-19T17:00:00.000Z');
 eq(rows('remind me to call mom',{when:null}).task.due_at,null);
 eq(rows('remind me to call mom',{when:'December 4 2026 18:00',due_at:'2026-12-04T18:00:00+01:00'}).task.due_at,'2026-12-04T17:00:00.000Z');
 eq(rows('remind me to call mom',{when:'unparseable date',due_at:'2026-12-04T18:00:00+01:00'}).task.due_at,'2026-12-04T17:00:00.000Z');
 for(const recurrence of ['daily','weekdays','weekly:5','biweekly','monthly','monthly:31']){const r=rows('remind me to call mom',{recurrence});ok(r.task);ok(Number.isFinite(Date.parse(r.task.due_at)));ok(r.task.recurrence);}
 eq(rows('remind me to call mom',{when:'saturday 6pm',recurrence:'weekdays'}).task.due_at,'2026-11-23T17:00:00.000Z');
 eq(rows('remind me to call mom',{recurrence:'monthly'}).task.recurrence,'monthly:18');
 eq(rows('remind me to call mom',{when:'unparsed',due_at:'2027-01-18T18:00:00+01:00',recurrence:'monthly:31'}).task.due_at,'2027-01-31T17:00:00.000Z');
 eq(rows('remind me to call mom',{recurrence:'monthly:31'}).task.due_at,'2026-11-30T17:00:00.000Z');
 for(const more of [{title:null},{title:''},{title:'x'.repeat(201)},{intent:'clarify'},{when:'unclear',due_at:null},{when:'',due_at:null},{when:17},{due_at:'2026-02-30T18:00:00+01:00'},{when:null,due_at:'2026-12-04T18:00:00Z'},{when:null,recurrence:'daily'}]){const r=rows('remind me',more);eq(r.task,undefined);ok(r.reply.includes('?'));}
 for(const recurrence of ['unsupported','hourly','weekly:8','monthly:32',undefined]){const r=rows('remind me',{recurrence});eq(r.task,undefined);ok(r.reply.includes('repeat pattern'));}
 for(const bad of ['oops','{}','[]',JSON.stringify({reply:'hi',action:{intent:'delete'}})]){assert.throws(()=>decode(bad,'hi',fixed));count++;}
 assert.throws(()=>decode(JSON.stringify(action('not in body')),'hello',fixed));count++;
 for(const phrase of ["what's next?",'what should I do next?','maybe remind me later','he said remind me to call','do not remind me to call mom','delete my task','rename call mom']){reset();await chat({...opts(),body:phrase});eq(created.length,0);eq(groqs().length,1);}
 for(const phrase of ['remind me to call mom tomorrow 6pm','abeg no let me forget to call mama tomorrow by 6','omo add call mom to my tasks tomorrow 18:00','How far? remind me to call mom tomorrow 6pm']){
  reset();payload=action(phrase);await chat({...opts(),body:phrase,now:fixed});eq(created.length,1);eq(groqs().length,1);eq(sends().length,1);
  const row=created[0];ok(/^[a-f0-9-]{36}$/.test(row.id));eq(row.user_id,'owner');eq(row.title,'call mom');eq(row.notes,null);eq(row.status,'open');eq(row.source,'chat');eq(row.due_at,'2026-11-18T17:00:00.000Z');
  const fs=require('node:fs'),src=fs.readFileSync(require.resolve('../js/tasks-data.js'),'utf8');
  const taskFields=new Function(src.slice(src.indexOf('export function taskFields'),src.indexOf('export function addTask')).replace('export ','')+';return taskFields;')();
  eq(row,{id:row.id,user_id:'owner',...taskFields(payload.action?{title:'call mom',due_at:row.due_at}:{}),status:'open',source:'chat'});
  const reply=sends()[0].o.body.get('Body');ok(reply.includes('Done — added “call mom”'));ok(reply.includes('18 Nov 2026, 18:00 (Lagos)'));ok(reply.includes('Tea first'));
  eq(JSON.parse(groqs()[0].o.body).response_format,{type:'json_object'});
 }
 reset();payload=action('remind me');payload.action.title=null;await chat({...opts(),body:'remind me'});eq(created.length,0);ok(sends()[0].o.body.get('Body').includes('What should I remind'));
 reset();payload=action('remind me');payload.action.recurrence='unsupported';await chat({...opts(),body:'remind me'});eq(created.length,0);ok(sends()[0].o.body.get('Body').includes('repeat pattern'));
 reset();payload=action('remind me');payload.action.recurrence='daily';await chat({...opts(),body:'remind me'});eq(created[0].recurrence,'daily');ok(sends()[0].o.body.get('Body').includes('repeats daily'));
 for(const failure of ['timeout','http','invalid','empty']){reset();mode=failure;payload=action('remind me');await chat({...opts(),body:'remind me'});eq(created.length,0);eq(sends()[0].o.body.get('Body'),FALLBACK);}
 reset();writeFail=true;payload=action('remind me');await chat({...opts(),body:'remind me'});eq(created.length,0);ok(sends()[0].o.body.get('Body').includes('could not confirm'));ok(!sends()[0].o.body.get('Body').includes('Done — added'));
 reset();full=true;payload=action('remind me');await chat({...opts(),body:'remind me'});eq(created.length,0);ok(sends()[0].o.body.get('Body').includes('500 open'));
 reset();mode='unlink';payload=action('remind me');await chat({...opts(),body:'remind me'});eq(created.length,0);eq(sends().length,0);


 // Existing-task edits: all Groq, storage and delivery boundaries remain mocked.
 const editAPI=require('../server/whatsapp-edit'),mutate=require('../server/whatsapp-mutate');
 const original={id:'edit-1',user_id:'owner',title:'call mom',notes:'keep notes',status:'open',completed_at:null,due_at:'2026-11-19T15:00:00.000Z',recurrence:null,source:'manual'};
 const editPayload=(request,changes={},intent='edit',target='call mom')=>({reply:'Tea first',action:{intent,request,target,changes}});
 let editRows,editWrites,editFailure,editRace;
 const editDB=async(table,q,method='GET',body)=>{
  if(table!=='tasks')return db(table,q,method,body);
  eq(q.user_id,'eq.owner');eq(q.status,'eq.open');
  if(method==='GET')return structuredClone(editRows);
  editWrites.push({q,method,body});if(editFailure)throw Error('storage');if(editRace)return [];
  const row=editRows.find(t=>t.id===q.id.slice(3));
  eq(q.completed_at,'is.null');eq(q.title,'eq.'+row.title);eq(q.due_at,'eq.'+row.due_at);eq(q.recurrence,row.recurrence?'eq.'+row.recurrence:'is.null');
  if(method==='DELETE'){editRows=[];return [row];}Object.assign(row,body);return [row];
 };
 const runEdit=async(phrase,changes={},intent='edit',target='call mom',taskTitle='call mom')=>{
  reset();editRows=[{...structuredClone(original),title:taskTitle}];editWrites=[];editFailure=false;editRace=false;
  payload=editPayload(phrase,changes,intent,target);await chat({...opts(),db:editDB,body:phrase,now:fixed});return sends()[0]?.o.body.get('Body');
 };
 for(const phrase of ['rename call mom to call mum','abeg change call mom name to call mum','call mom: rename am to call mum']){
  const reply=await runEdit(phrase,{title:'call mum'});eq(editRows[0].title,'call mum');eq(editRows[0].notes,'keep notes');eq(editRows[0].status,'open');eq(editRows[0].source,'manual');eq(editWrites[0].body,{title:'call mum'});ok(reply.includes('renamed “call mom” to “call mum”'));eq(groqs().length,1);
 }
 for(const phrase of ['move call mom to Friday 4pm','abeg shift call mom go Friday by 4']){
  const reply=await runEdit(phrase,{when:'Friday 4pm'});eq(editRows[0].due_at,'2026-11-20T15:00:00.000Z');ok(reply.includes('20 Nov 2026, 16:00 (Lagos)'));
 }
 await runEdit('change call mom to 7pm',{when:'7pm'});eq(editRows[0].due_at,'2026-11-19T18:00:00.000Z');
 for(const recurrence of ['daily','weekdays','weekly','weekly:1','weekly:7','biweekly','monthly','monthly:31']){
  const reply=await runEdit('make call mom repeat '+recurrence,{recurrence});ok(reply.includes('repeats'));ok(editRows[0].recurrence);ok(editRows[0].due_at);eq(editRows[0].notes,original.notes);
 }
 let reply=await runEdit('make watering the plants weekly instead of daily',{recurrence:'weekly'},'edit','watering the plants','watering the plants');eq(editRows[0].recurrence,'weekly:4');
 await runEdit('stop call mom repeating',{recurrence:null});eq(editRows[0].recurrence,null);
 reply=await runEdit('rename call mom to call mum and move it to Friday',{title:'call mum',when:'Friday 4pm'});eq(editRows[0].title,'call mum');eq(editRows[0].due_at,'2026-11-20T15:00:00.000Z');eq(editWrites.length,1);ok(reply.includes('renamed'));ok(reply.includes('due'));
 for(const phrase of ['delete the call mom task','cancel my reminder to call mom','abeg comot call mom reminder']){
  reply=await runEdit(phrase,{},'delete');eq(editRows,[]);eq(editWrites[0].method,'DELETE');eq(editWrites[0].body,undefined);eq(reply,'Deleted “call mom”. 🌿');eq(created.length,0);
 }
 const decoded=(phrase,changes={},intent='edit',request=phrase)=>mutate.decode(JSON.stringify(editPayload(request,changes,intent)),phrase,fixed);
 for(const phrase of ['I should delete that task someday','what if I delete call mom','do not delete call mom','he said delete call mom','how can I delete call mom?','“delete call mom”','`delete call mom`','can you explain how to delete call mom?']){
  const d=decoded(phrase,{},'delete',phrase);eq(d.mutation,undefined);
 }
 for(const phrase of ['what should change?','maybe move call mom to Friday','I might rename call mom']){reset();await chat({...opts(),db:editDB,body:phrase});eq(created.length,0);}
 for(const changes of [{title:''},{title:'x'.repeat(201)},{when:42},{due_at:'2026-02-30T18:00:00+01:00'},{recurrence:'hourly'},{}])eq(decoded('edit call mom',changes).mutation,undefined);
 for(const a of [{intent:'edit',request:'elsewhere',target:'call mom',changes:{title:'mum'}},{intent:'edit',request:'edit call mom',target:'call mom',changes:{status:'done'}}]){assert.throws(()=>mutate.decode(JSON.stringify({reply:'hi',action:a}),'edit call mom',fixed));count++;}
 eq(editAPI.candidates('CALL MOM!',[original]).length,1);eq(editAPI.candidates('mom',[original]).length,1);
 eq(editAPI.candidates('call mom',[original,{...original,id:'other',title:'call mom later'}]).map(t=>t.id),['edit-1']);
 eq(editAPI.candidates('call',[original,{...original,id:'other',title:'call dad'}]).length,2);
 for(const patch of [{status:'done'},{completed_at:'2026-11-17T10:00Z'},{deleted_at:'x'},{tombstone:true},{is_deleted:true}])eq(editAPI.candidates('call mom',[{...original,...patch}]),[]);
 for(const kind of ['none','ambiguous','duplicate','race','failure','unlink','timeout','invalid']){
  reset();editRows=kind==='none'?[]:[structuredClone(original)];if(kind==='ambiguous'||kind==='duplicate')editRows.push({...original,id:'two',title:kind==='duplicate'?'call mom':'call dad'});
  editWrites=[];editFailure=kind==='failure';editRace=kind==='race';if(['unlink','timeout','invalid'].includes(kind))mode=kind;
  const phrase='delete call mom';payload=editPayload(phrase,{},'delete',kind==='ambiguous'?'call':'call mom');
  await chat({...opts(),db:editDB,body:phrase,now:fixed});
  if(['none','ambiguous','duplicate','unlink','timeout','invalid'].includes(kind))eq(editWrites.length,0);
  eq(created.length,0);if(kind==='unlink')eq(sends().length,0);else {const text=sends()[0].o.body.get('Body');ok(!text.includes('Deleted'));if(kind==='none')ok(text.includes('cannot find'));if(['ambiguous','duplicate'].includes(kind))ok(text.includes('Which task'));if(kind==='failure')ok(text.includes('could not confirm'));}
 }
 // Scheduling semantics share the existing creation normalizer and rolling helper.
 const webSource=require('node:fs').readFileSync(require.resolve('../js/tasks-data.js'),'utf8');
 const rolling=webSource.slice(webSource.indexOf('export const validRecurrence'),webSource.indexOf('export const surfaceKey'));

 const webNext=new Function(rolling.replace(/export /g,'')+';return nextOccurrence;')();
 for(const recurrence of ['daily','weekdays','weekly:1','weekly:7','biweekly','monthly','monthly:31']){
  for(const start of ['2026-01-31T15:00:00.000Z','2026-11-19T15:00:00.000Z']){
   const changed=editAPI.updates({...original,due_at:start},{recurrence},fixed);
   const completed=require('../server/whatsapp-tasks').completion({...original,...changed},fixed);
   eq(completed,{status:'open',completed_at:null,due_at:webNext(changed.due_at,changed.recurrence,fixed)});
  }
 }
 // Schedule rejection never reaches persistence; dates/notes/source remain intact.
 reply=await runEdit('move call mom to sometime',{when:'sometime'});eq(editWrites.length,0);eq(editRows[0],original);ok(reply.includes('Nothing changed'));
 reply=await runEdit('change call mom recurrence to hourly',{recurrence:'hourly'});eq(editWrites.length,0);ok(reply.includes('repeat pattern'));
 // Owner reads and write receipt happen before the success confirmation is sent.
 reset();editRows=[structuredClone(original)];editWrites=[];editFailure=false;editRace=false;payload=editPayload('rename call mom',{title:'mum'});
 let writesBeforeSend=false;const ordered=async(...args)=>{if(args[2]==='PATCH'){eq(sends().length,0);writesBeforeSend=true;}return editDB(...args);};
 await chat({...opts(),db:ordered,body:'rename call mom',now:fixed});ok(writesBeforeSend);ok(sends()[0].o.body.get('Body').includes('renamed'));

 for(const recurrence of ['daily','weekdays','weekly:1','biweekly','monthly:31']){
  const u=editAPI.updates({...original,recurrence},{when:'Friday 4pm'},fixed);ok(u);eq(u.title,undefined);ok(Number.isFinite(Date.parse(u.due_at)));
 }


 for(const phrase of ['move call mom to Friday 4pm','delete the call mom task','abeg comot call mom task']){
  reset();payload=action(phrase);await chat({...opts(),body:phrase,now:fixed});eq(created.length,0);
 }

 console.log('WhatsApp chat B2: '+count+' assertions passed (all providers mocked)');
}finally{process.env=saved.env;global.fetch=saved.fetch;console.error=saved.error;}
})().catch(e=>{console.error(e);process.exitCode=1;});
