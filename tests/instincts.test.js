const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
module.exports=async function(){
let checks=0;const eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;};
const t=require('../api/task-intent'),doc=require('../api/doc-intent'),page=require('../api/page-intent');
const now=Date.parse('2026-11-13T10:00:00+01:00'),msg=content=>[{role:'user',content}];
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
for(const text of ['ask me how the meeting went tomorrow at 8','check on me about the interview tonight','ask me about the move later','check in with me about sleep tomorrow']){eq(t.taskIntent(msg(text),false,now).checkin,true);eq(t.taskIntent(msg(text),true,now),null);}
eq(t.checkinQuestion('how the meeting went tomorrow at 8'),'How did the meeting go?');eq(t.checkinQuestion('about the interview tonight'),'How are things with the interview?');
for(const text of ['set reminder for rent','set a reminder to pay rent','remind me for rent'])eq(t.taskIntent(msg(text),false,now).type,'add');
for(const text of ['ask me about this document tomorrow','ask me about a website tomorrow','check on me about the PDF tonight'])eq(t.taskIntent(msg(text),false,now),null);
for(const [text,r]of [['monthly','monthly'],['monthly on the 15th','monthly:15'],['every month on 31st','monthly:31'],['every 2 weeks','biweekly'],['biweekly','biweekly']])eq(t.recurrence('pay rent '+text),r);
eq(t.recurrence('monthly on the 32nd'),null);
eq(t.recurrenceDue('pay rent monthly on the 31st','monthly:31',Date.parse('2026-02-01T00:00Z')),'2026-02-28T08:00:00.000Z');
for(const[text,q]of [["what's due this week",'week'],["what's overdue",'overdue'],['what do I have tomorrow','tomorrow'],['what did I finish this week','finished:week'],['what did I finish this month','finished:month']])eq(t.taskIntent(msg(text),false,now).query,q);
const ctx={Date:Clock,Intl,console,Number,Math,Set,Map,URL,AbortController,setTimeout,clearTimeout,queueMicrotask(){},onAuthChange(){},window:{addEventListener(){}},document:{addEventListener(){}}};
vm.runInNewContext(fs.readFileSync('js/tasks-data.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'')+'\nthis.d={nextOccurrence,validRecurrence,queryTasks,wrapTasks,shouldWrap,longWaiting,completionCopy,isCheckin};',ctx);const d=ctx.d;
for(const r of ['monthly','monthly:1','monthly:31','biweekly'])eq(d.validRecurrence(r),true);
for(const r of ['monthly:0','monthly:32','monthly:01','every 2 weeks','<img>'])eq(d.validRecurrence(r),false);
for(const [due,r,at,want]of [
['2026-01-31T09:00:00+01:00','monthly:31','2026-02-01T00:00Z','2026-02-28T08:00:00.000Z'],
['2028-01-31T09:00:00+01:00','monthly:31','2028-02-01T00:00Z','2028-02-29T08:00:00.000Z'],
['2026-02-28T09:00:00+01:00','monthly:31','2026-02-28T08:00Z','2026-03-31T08:00:00.000Z'],
['2026-01-31T09:00:00+01:00','monthly:31','2026-05-31T08:00Z','2026-06-30T08:00:00.000Z'],
['2026-12-31T09:00:00+01:00','monthly:31','2026-12-31T08:00Z','2027-01-31T08:00:00.000Z'],
['2026-11-01T09:00:00+01:00','biweekly','2026-11-15T08:00Z','2026-11-29T08:00:00.000Z'],
['2026-11-01T09:00:00+01:00','biweekly','2026-11-01T07:00Z','2026-11-15T08:00:00.000Z']])eq(d.nextOccurrence(due,r,Date.parse(at)),want);
const row=(id,due,extra={})=>({id,title:'Task '+id,status:'open',due_at:due,...extra});
const rows=[row('old','2026-11-10T09:00+01:00'),row('today','2026-11-13T08:00+01:00'),row('tomorrow','2026-11-14T09:00+01:00'),row('next','2026-11-16T09:00+01:00'),row('finished',null,{status:'done',completed_at:'2026-11-13T00:00+01:00'}),row('earlier',null,{status:'done',completed_at:'2026-11-01T09:00+01:00'}),row('bad',null,{status:'done',completed_at:null})];
eq(d.queryTasks(rows,'overdue',now).map(t=>t.id),['old','today']);eq(d.queryTasks(rows,'tomorrow',now).map(t=>t.id),['tomorrow']);eq(d.queryTasks(rows,'week',now).map(t=>t.id),['old','today','tomorrow']);eq(d.queryTasks(rows,'finished:week',now).map(t=>t.id),['finished']);eq(d.queryTasks(rows,'finished:month',now).map(t=>t.id),['earlier','finished']);
eq(d.longWaiting(row('a',new Date(now-48*3600000).toISOString()),now),false);eq(d.longWaiting(row('a',new Date(now-48*3600000-1).toISOString()),now),true);
const evening=Date.parse('2026-11-13T20:00+01:00');eq(d.shouldWrap(rows,null,evening-1),false);eq(d.shouldWrap(rows,null,evening),true);eq(d.shouldWrap(rows,'2026-11-13',evening),false);eq(d.shouldWrap([],null,evening),false);eq(d.wrapTasks(rows,evening).completed.map(t=>t.id),['finished']);eq(d.wrapTasks(rows,evening).slipped.map(t=>t.id),['today']);eq(d.shouldWrap(rows,null,Date.parse('2026-11-13T23:00Z')),false);
const copies=new Set();for(let i=0;i<12;i++)copies.add(d.completionCopy(row(String(i),null),now));eq(copies.size,4);eq(d.completionCopy(row('r',null,{recurrence:'daily'}),now).length>0,true);
let output,calls=0;const module={exports:{}};const imports=n=>n==='./task-intent'?t:n==='./doc-intent'?doc:n==='./page-intent'?page:n==='./research'?{research:async()=>{throw Error('No research');}}:n==='./personality'?{prompt:'chat'}:{projectPrompt:async()=> 'chat',providerBody:JSON.stringify};
vm.runInNewContext(fs.readFileSync('api/chat.js','utf8'),{module,require:imports,process:{env:{}},Date:Clock,Buffer,AbortController,AbortSignal,setTimeout,clearTimeout,fetch:async()=>{calls++;throw Error('No network');}});
async function ask(text,pending){output=null;const res={setHeader(){},status(){return this;},json(x){output=x;return x;}};await module.exports({method:'POST',headers:{},body:{messages:msg(text),taskPending:pending}},res);return output;}
let out=await ask('ask me how the meeting went tomorrow at 8');eq(out.taskIntent,'add');eq(out.taskTitle,'How did the meeting go?');eq(out.taskDue,'2026-11-14T08:00:00+01:00');eq(out.taskNotes,'[steep:check-in]');
out=await ask('ask me about sleep later');eq(out.taskIntent,'clarify');eq(out.taskPendingTitle,'How are things with sleep?');out=await ask('tomorrow at 8',{title:out.taskPendingTitle,checkin:true,at:now});eq(out.taskIntent,'add');eq(out.taskNotes,'[steep:check-in]');
for(const text of ['set reminder for rent','set a reminder to pay rent','remind me for rent']){out=await ask(text);eq(out.taskIntent,'clarify');eq(Boolean(out.taskPendingTitle),true);}
out=await ask('tomorrow at 8',{title:'Pay rent',at:now});eq(out.taskTitle,'Pay rent');out=await ask('tomorrow at 8',{title:'Pay rent',at:now-600001});eq(out.taskIntent||null,null);eq(calls,0);
const ui={...ctx,...d};vm.runInNewContext(fs.readFileSync('js/tasks.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'')+'\nthis.reminderCopy=reminderCopy;',ui);
eq(ui.reminderCopy('How did it go?',0,row('c','2026-11-13T09:00+01:00',{notes:'[steep:check-in]'}),now),'How did it go?');eq(ui.reminderCopy('Old task',0,rows[0],now).includes('reschedule or let it go'),true);eq(ui.reminderCopy('Fresh',0,rows[1],now).includes('waiting a while'),false);
eq(fs.readFileSync('api/personality.js','utf8').includes('AI-powered task manager and personal assistant'),true);
for (const text of ['set reminder for maybe call Ada', 'set a reminder to someday travel', 'remind me for perhaps a holiday']) eq(t.taskIntent(msg(text),false,now),null);
eq(d.isCheckin({notes:'[steep:check-in]\nPersonal notes'}),true);
eq(d.isCheckin({notes:'[steep:check-in]not a marker'}),false);
eq(t.checkinQuestion('about <img src=x onerror=alert(1)> tomorrow'),'How are things with <img src=x onerror=alert(1)>?');
const safeUI=fs.readFileSync('js/tasks.js','utf8');eq(safeUI.includes('el.textContent = text'),true);eq(safeUI.includes('innerHTML'),false);
console.log('PASS: '+checks+' instincts assertions; no live model/research calls.');
};