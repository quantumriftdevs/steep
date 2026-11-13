const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm');
module.exports = async function () {
  let checks = 0; const eq = (a,b) => { assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b))); checks++; };
  let time = 1000000, user = 'alice', ready = true, rows = [], serial = 0, timers = new Map(), storage = new Map(), views = [], completed = [], notices = [], fail = false;
  const task = (id, due = time, extra = {}) => ({id,title:'Task '+id,status:'open',due_at:new Date(due).toISOString(),...extra});
  const surfaceKey = t => t.id + ':' + Date.parse(t.due_at);
  const dueTasks = (rows, seen = {}, now = time) => rows.filter(t => t.status === 'open' && Date.parse(t.due_at) <= now && !seen[surfaceKey(t)]).sort((a,b) => Date.parse(a.due_at)-Date.parse(b.due_at)||a.id.localeCompare(b.id));
  const later = (fn,ms) => { const id = ++serial; timers.set(id,{at:time+ms,fn}); return id; };
  const advance = async ms => { const target=time+ms; for (;;) { const next=[...timers].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at)[0]; if(!next) break; time=next[1].at;timers.delete(next[0]);await next[1].fn(); } time=target; };
  class Element {
    constructor(tag) { this.tag=tag; this.children=[]; this.attrs={}; this.style={}; this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)}; }
    append(...els){this.children.push(...els);} prepend(el){this.children.unshift(el);} remove(){this.removed=true;}
    setAttribute(k,v){this.attrs[k]=v;} setPointerCapture(){} closest(tag){return this.tag===tag?this:null;}
  }
  const ctx={Date,Math,Number,Array,Map,Promise,console,setTimeout:later,clearTimeout:id=>timers.delete(id),dueTasks,surfaceKey,document:{createElement:tag=>new Element(tag)}};
  const source=fs.readFileSync('js/tasks.js','utf8').split(String.fromCharCode(10)).filter(line=>!line.startsWith('import ')).join(String.fromCharCode(10)).replace(/export /g,'');
  vm.runInNewContext(source+String.fromCharCode(10)+'this.api={reminderCopy,dueQueue,createDueBanners,showDueBanner};',ctx);
  const {reminderCopy,dueQueue,createDueBanners,showDueBanner}=ctx.api;
  const io={user:()=>user,rows:()=>rows,ready:()=>ready,now:()=>time,setTimeout:later,clearTimeout:id=>timers.delete(id),
    read:k=>JSON.parse(storage.get(k)||'null'),write:(k,v)=>storage.set(k,JSON.stringify(v)),notice:e=>notices.push(e),
    show:(task,copy,actions)=>{ const v={task,copy,actions,removed:false,disabled:false,remove(){this.removed=true;},pending(x){this.disabled=x;},success(){this.successful=true;},hide(x){this.hidden=true;this.swiped=x;}};views.push(v);return v;},
    complete:async t=>{if(fail)throw Error('offline');completed.push(t.id);const result=rows.find(x=>surfaceKey(x)===surfaceKey(t)&&x.status==='open'); if(!result)return null;rows=rows.map(x=>x.id===t.id?{...x,status:'done'}:x);return result;}
  };
  rows=[task('b'),task('a',time-1),task('future',time+1),task('done',time-2,{status:'done'}),task('none',time,{due_at:null})];
  eq(dueQueue(rows,{},time).map(t=>t.id),['a','b']);
  eq(reminderCopy('X',0),"It's time: X");eq(reminderCopy('X',1),"Here's that reminder again: X");eq(reminderCopy('X',4),reminderCopy('X',0));
  let c=createDueBanners(io);c.tick();eq(views.length,1);eq(views[0].task.id,'a');c.tick();eq(views.length,1);
  let event=()=>JSON.parse(storage.get('steep:due-banner:alice'))[surfaceKey(rows.find(t=>t.id==='a'))];
  eq(event().acknowledged,false);eq(event().reminderCount,1);eq(event().lastShown,time);
  views[0].actions.swipe();await advance(570);eq(views[0].removed,true);eq(completed,[]);eq(event().acknowledged,false);eq(views[1].task.id,'b');
  await views[1].actions.okay();eq(completed,['b']);eq(views[1].successful,true);await advance(4999);eq(views[1].removed,false);await advance(571);eq(views[1].removed,true);
  // Reload preserves the nag's remaining delay and wording count.
  rows=rows.filter(t=>t.id==='a');c.dispose();const shown=views.length;c=createDueBanners(io);c.tick();eq(views.length,shown);
  await advance(290000);eq(views.length,shown);await advance(10000);eq(views.length,shown+1);eq(views.at(-1).copy,"Here's that reminder again: Task a");eq(event().reminderCount,2);
  fail=true;await views.at(-1).actions.okay();eq(notices,['offline']);eq(views.at(-1).disabled,false);eq(event().acknowledged,false);
  fail=false;await views.at(-1).actions.okay();eq(completed,['b','a']);eq(event().acknowledged,true);await advance(5570);c.dispose();c=createDueBanners(io);c.tick();eq(views.length,shown+1);
  // A recurring task's new due timestamp is a fresh event; same timestamp is not.
  rows=[task('a',time+60000,{recurrence:'daily'})];c.tick();eq(views.length,shown+1);await advance(60000);c.tick();eq(views.length,shown+2);
  // Already done/deleted elsewhere never invokes complete, and swiping never acknowledges.
  rows=[];const count=completed.length;await views.at(-1).actions.okay();await advance(570);eq(completed.length,count);eq(views.at(-1).removed,true);
  rows=[task('deleted')];c.tick();rows=[];c.tick();await advance(570);eq(views.at(-1).removed,true);eq(completed.length,count);
  // Guests and account switches clear the view and isolate storage.
  user=null;rows=[task('guest')];c.tick();const before=views.length;c.tick();eq(views.length,before);eq(storage.has('steep:due-banner:null'),false);
  user='bob';c.tick();eq(views.length,before+1);eq(storage.has('steep:due-banner:bob'),true);user=null;c.tick();eq(views.at(-1).removed,true);
  ready=false;user='alice';c.tick();eq(views.length,before+1);ready=true;c.tick();eq(views.length,before+2);c.dispose();
  // Real DOM adapter: text-only title, only Okay, mouse/touch share Pointer Events.
  const host=new Element('section');let oks=0,swipes=0;
  const view=showDueBanner(host,{title:'<img onerror=x>'},'It is time: <img onerror=x>',{okay:()=>oks++,swipe:()=>swipes++});
  const el=host.children[0],button=el.children[1],text=el.children[0];eq(el.attrs.role,'status');eq(text.textContent,'It is time: <img onerror=x>');eq(el.children.length,2);eq(button.textContent,'Okay');button.onclick();eq(oks,1);
  el.onpointerdown({button:0,target:text,clientY:10,pointerId:1});el.onpointermove({clientY:59});el.onpointerup();eq(swipes,1);
  el.onpointerdown({button:0,target:text,clientY:10,pointerId:2});el.onpointermove({clientY:30});el.onpointerup();eq(swipes,1);
  el.onpointerdown({button:0,target:button,clientY:0,pointerId:3});el.onpointermove({clientY:100});el.onpointerup();eq(swipes,1);
  el.onpointerdown({button:0,target:text,clientY:0,pointerId:4});el.onpointermove({clientY:100});el.onpointercancel();el.onpointerup();eq(swipes,1);
  view.pending(true);eq(button.disabled,true);view.pending(false);eq(button.disabled,false);view.success();eq(button.disabled,true);view.hide(true);eq(el.classes.has('is-swiped'),true);view.remove();eq(el.removed,true);
  console.log('PASS: '+checks+' due-banner assertions; mocked DOM/timers/storage; no network.');
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
