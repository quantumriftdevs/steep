const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm');
const t = require('../api/task-intent'), doc = require('../api/doc-intent'), page = require('../api/page-intent');
const now = Date.parse('2026-11-13T10:00:00+01:00'), msg = content => [{role:'user',content}];
let checks = 0; const eq = (a,b) => { assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b))); checks++; };
class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
const pending = {due:'2026-11-14T18:00:00+01:00',at:now};
for (const text of ['remind me Friday','remind me tomorrow at 6','remind me to Friday']) { const i=t.taskIntent(msg(text),false,now);eq(i.type,'clarify');assert.ok(i.due);checks++; }
eq(t.taskIntent(msg('remind me to email Ada'),false,now).type,'add');
for (const text of ['email Ada','dentist appointment','bring snacks','to pay rent']) eq(t.pendingAnswer(text,pending,false,now),text.replace(/^to /,''));
for (const text of ['hello','thanks','never mind','what is this?','I think we should talk','my tasks','move my exam to Monday','create a document','build a website','maybe email Ada']) eq(t.pendingAnswer(text,pending,false,now),null);
eq(t.pendingAnswer('call Ada',{...pending,at:now-600001},false,now),null);
eq(t.pendingAnswer('call Ada',pending,true,now),null);
eq(t.pendingAnswer('call Ada',{due:'bad',at:now},false,now),null);
for (const verb of ['move','reschedule','push','change']) {const i=t.taskIntent(msg(verb+' my Exam prep to Monday at 9am'),false,now);eq(i,{type:'reschedule',phrase:'Exam prep',due:'2026-11-16T09:00:00+01:00'});}
eq(t.taskIntent(msg('snooze my Exam prep'),false,now).due,new Date(now+3600000).toISOString());
eq(t.taskIntent(msg('complete my Exam prep'),false,now).phrase,'Exam prep');
eq(t.taskIntent(msg('delete my Exam prep'),false,now).type,'delete');
eq(t.taskIntent(msg('move my exam to sometime'),false,now).due,null);
for(const text of ['move my document to Monday','snooze my page','remind me Friday']) eq(t.taskIntent(msg(text),true,now),null);
eq(t.taskIntent(msg('remind me to pay every month'),false,now).type,'unsupportedRecurrence');
for(const [text,r] of [['every day','daily'],['every weekday','weekdays'],['every Monday','weekly:1'],['every Sunday','weekly:7'],['every month',null],['every 2 weeks',null]]) eq(t.recurrence('remind me to study '+text),r);
let tasks=[], handler, intervals=[], hidden=false, injected=[], storage=new Map(), fetches=0;
const windowMock={addEventListener(){}}, documentMock={get hidden(){return hidden;},addEventListener(){}};
const context={console,Date:Clock,Intl,URL,AbortController,setTimeout,clearTimeout,queueMicrotask,setInterval:fn=>{intervals.push(fn);return 1;},clearInterval(){},crypto:require('crypto').webcrypto,window:windowMock,document:documentMock,
getSession:()=>({user:{id:'owner'}}),getConfig:async()=>({supabaseUrl:'https://example.test',supabaseKey:'mock'}),authHeaders:async()=>({Authorization:'mock'}),onAuthChange:fn=>fn({user:{id:'owner'}}),logout(){},fetch:async(url,opts)=>{fetches++;let out=tasks;if(opts.method==='PATCH'){const id=new URL(url).searchParams.get('id').slice(3);tasks=tasks.map(x=>x.id===id?{...x,...JSON.parse(opts.body)}:x);out=tasks.filter(x=>x.id===id);}return {ok:true,status:200,json:async()=>out};}};
let code=fs.readFileSync('js/tasks-data.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'');
vm.runInNewContext(code+'\nthis.data={taskDueLabel,lagosDay,nextOccurrence,dueTasks,digestTasks,shouldDigest,surfaceKey,tomorrowNine,taskCandidates,refreshTasks,editTask,taskRows};',context);
const d=context.data;
eq(d.nextOccurrence('2026-11-13T09:00:00+01:00','daily',now),'2026-11-14T08:00:00.000Z');
eq(d.nextOccurrence('2026-11-13T09:00:00+01:00','weekdays',now),'2026-11-16T08:00:00.000Z');
eq(d.nextOccurrence('2026-11-09T09:00:00+01:00','weekly:1',now),'2026-11-16T08:00:00.000Z');
eq(d.nextOccurrence('2026-11-01T09:00:00+01:00','daily',now),'2026-11-14T08:00:00.000Z');
eq(d.tomorrowNine(Date.parse('2026-11-13T23:30:00Z')),'2026-11-15T08:00:00.000Z');
const row=(id,due,title='Exam prep')=>({id,title,due_at:due,status:'open',created_at:'2026-01-01'});
const rows=[row('old','2026-11-12T09:00:00+01:00'),row('soon','2026-11-13T10:15:00+01:00'),row('later','2026-11-13T18:00:00+01:00'),row('tomorrow','2026-11-14T09:00:00+01:00'),{...row('done','2026-11-12T09:00:00+01:00'),status:'done'},row('none',null)];
eq(d.dueTasks(rows,{},now,false).map(x=>x.id),['old']);
eq(d.dueTasks(rows,{},now,true).map(x=>x.id),['old']);
eq(d.dueTasks(rows,{[d.surfaceKey(rows[0])]:true},now,false).map(x=>x.id),[]);
eq(d.digestTasks(rows,now).map(x=>x.id),['old','soon','later']);
eq(d.shouldDigest(rows,'2026-11-13',now),false);eq(d.shouldDigest(rows,'2026-11-12',now),true);eq(d.shouldDigest([],null,now),false);
eq(d.taskCandidates('Exam prep',[row('a',null),row('b',null,'Exam prep biology')]).length,2);eq(d.taskCandidates('groceries',[row('a',null)]).length,0);
tasks=[{...rows[0],recurrence:'weekdays'}];
async function run(){
 await d.refreshTasks();const rolled=await d.editTask('old',{status:'done'});eq(rolled.status,'open');eq(rolled.due_at,'2026-11-16T08:00:00.000Z');eq(rolled.recurrence,'weekdays');
 await d.editTask('old',{due_at:'2026-11-17T09:00:00+01:00'});eq(tasks[0].due_at,'2026-11-17T08:00:00.000Z');eq(tasks[0].recurrence,'weekdays');
 const original=rows[0]; tasks=[{...original,status:'done'}];eq(await d.editTask('old',{status:'done'},original.due_at),null);
 tasks=[];eq(await d.editTask('old',{status:'done'},original.due_at),null);
 tasks=[{...original,due_at:rows[1].due_at}];eq(await d.editTask('old',{status:'done'},original.due_at),null);eq(tasks[0].status,'open');
 tasks=[{...original,recurrence:'weekdays'}];await d.editTask('old',{status:'done'},original.due_at);eq(tasks[0].status,'open');eq(tasks[0].due_at,'2026-11-16T08:00:00.000Z');
 tasks=[{...original}];await d.editTask('old',{status:'done'},original.due_at);eq(tasks[0].status,'done');
 let modelCalls=0, output;
 const imports=n=>n==='./task-intent'?{...t,taskIntent:(m,b)=>t.taskIntent(m,b,now),pendingAnswer:(text,p,b)=>t.pendingAnswer(text,p,b,now)}:n==='./doc-intent'?doc:n==='./page-intent'?page:n==='./research'?{research:async()=>null}:n==='./personality'?{prompt:'chat'}:{projectPrompt:async()=> 'chat',providerBody:body=>JSON.stringify(body)};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync('api/chat.js','utf8'),{module,require:imports,process:{env:{GROQ_API_KEY:'mock'}},Buffer,Date:Clock,fetch:async()=>{modelCalls++;throw Error('Unexpected model call');},AbortController,AbortSignal,setTimeout,clearTimeout,console});
 for (const [text,kind,p] of [['remind me Friday','clarify'],['bring snacks','add',pending],['move my Exam prep to Monday','reschedule'],['snooze Exam prep','reschedule'],['complete my Exam prep','complete'],['delete my Exam prep','delete']]) {
 const res={setHeader(){},status(){return this;},json(o){output=o;return o;}};
 await module.exports({method:'POST',headers:{},body:{messages:msg(text),taskPending:p}},res);eq(output.taskIntent,kind);
 }
 eq(modelCalls,0);
 // Exercise timer and localStorage gates with real scheduling helpers, no DOM/model.
 let listener;const ui={...context,...d,taskRows:()=>rows,onTasksChange:fn=>{listener=fn;},refreshTasks:async()=>rows,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(fs.readFileSync('js/tasks.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'')+'\nthis.start=setupTaskSecretary;this.reply=taskReply;this.card=taskCard;',ui);
 ui.start({ready:()=>true,bannerReady:()=>false,notice:e=>{throw Error(e);},inject:(m,top)=>injected.push({m,top})});
 for(let i=0;i<10;i++)await Promise.resolve();
 eq(injected.length,1);eq(injected[0].top,true);eq(injected[0].m.taskDigest.title,'Today: 3 tasks');
 await intervals[0]();eq(injected.length,1);
 ui.start({ready:()=>true,bannerReady:()=>false,notice:e=>{throw Error(e);},inject:m=>injected.push({m})});for(let i=0;i<10;i++)await Promise.resolve();eq(injected.length,1);
 hidden=true;await intervals[0]();eq(injected.length,1);
 let edits=[];
 ui.editTask=async(id,input)=>{edits.push({id,input});return {...rows[0],...input};};
 ui.deleteTask=async id=>{edits.push({deleted:id});};
 ui.refreshTasks=async()=>[row('a',null),row('b',null,'Exam prep biology')];
 eq((await ui.reply({taskIntent:'reschedule',taskPhrase:'Exam prep',taskDue:pending.due})).content.startsWith('Which task'),true);eq(edits.length,0);
 eq((await ui.reply({taskIntent:'reschedule',taskPhrase:'groceries',taskDue:pending.due})).content.includes("couldn't find"),true);
 ui.refreshTasks=async()=>[row('a',rows[0].due_at)];
 eq((await ui.reply({taskIntent:'reschedule',taskPhrase:'Exam prep',taskDue:pending.due})).content.startsWith('Moved'),true);eq(edits.length,1);
 eq((await ui.reply({taskIntent:'reschedule',taskPhrase:'Exam prep'})).content.startsWith('What date'),true);eq(edits.length,1);
 await ui.reply({taskIntent:'complete',taskPhrase:'Exam prep'});eq(edits[1].input.status,'done');
 await ui.reply({taskIntent:'delete',taskPhrase:'Exam prep'});eq(edits[2].deleted,'a');
 eq((await ui.reply({taskIntent:'clarify',reply:'What is it about?'})).content,'What is it about?');
 ui.getSession=()=>null;let gated=false;try{await ui.reply({taskIntent:'add'});}catch{gated=true;}eq(gated,true);
 const app=fs.readFileSync('js/app.js','utf8');
 eq(app.includes('taskPending.chat !== current.id'),true);eq(app.includes('taskPending.user !== getSession()?.user?.id'),true);eq(app.includes('JSON.parse(body),taskPending:'),true);
 await require('./due-banner.test')();
  console.log('PASS: '+checks+' secretary assertions; mocked storage/timer/API; no live models.');
}
module.exports=run;if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
