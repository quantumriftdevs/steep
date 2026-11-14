// Built-ins only. DOM, file/page work and network boundaries are mocked.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let count=0;const ok=(value)=>{assert.ok(value);count++;},eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));count++;};
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.childNodes=[];this.dataset={};this.attributes={};this.className='';this.text='';this.isConnected=true;this.classList={add:(...cs)=>{this.className+=' '+cs.join(' ');},remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ');}};}
 set textContent(s){this.text=String(s);this.childNodes=[];} get textContent(){return this.text+this.childNodes.map(n=>n.textContent).join(' ');}
 append(...nodes){for(const node of nodes){if(node.parentNode)node.parentNode.childNodes=node.parentNode.childNodes.filter(x=>x!==node);node.parentNode=this;this.childNodes.push(node);}}
 replaceChildren(...nodes){this.childNodes.forEach(n=>{n.parentNode=null;});this.childNodes=[];this.text='';this.append(...nodes);}
 setAttribute(k,v){this.attributes[k]=String(v);} getAttribute(k){return this.attributes[k];}
 querySelectorAll(selector){const cls=selector.slice(1);return this.childNodes.flatMap(n=>[...(n.className?.split(' ').includes(cls)?[n]:[]),...n.querySelectorAll(selector)]);}
}
const source=f=>fs.readFileSync(f,'utf8');
const context={document:{createElement:tag=>new Element(tag)},console,Object};
vm.createContext(context);vm.runInContext(source('js/cards.js').replace(/export /g,'')+'\nthis.cards={CARD_STATES,renderCard,messageCard,progressCard};'.replace('\\n','\n'),context);
const c=context.cards;
module.exports=async function(){
 for(const theme of ['light','dark','system']) for(const width of [320,393,720]) for(const state of Object.keys(c.CARD_STATES)){
  context.document.documentElement={dataset:{theme}};context.innerWidth=width;
  const {card,result}=c.renderCard({state,title:'Send report',summary:'Warm copy',steps:['Real observed phase'],rows:[{title:'Task',label:'Today',detail:'09:00 Lagos'}],details:'Evidence'});
  eq(card.dataset.state,state);ok(card.textContent.includes(c.CARD_STATES[state]));ok(card.textContent.includes('Send report'));ok(card.textContent.includes('Real observed phase'));ok(card.textContent.includes('Today'));eq(result.childNodes.length,0);eq(card.querySelectorAll('.steep-chip').length,2);
 }
 eq(c.renderCard({state:'invented'}).card.dataset.state,'queued');
 const safe=c.renderCard({title:'<img src=x onerror=evil()>',summary:'<script>evil</script>'}).card;ok(safe.textContent.includes('<script>'));eq(safe.childNodes.filter(n=>n.tagName==='SCRIPT').length,0);
 for(const metadata of [{taskAdded:{title:'Task'}},{taskCompleted:{title:'Task'}},{taskQuery:{title:'Due this week',rows:[{title:'Task',label:'Upcoming'}]}},{taskDigest:{title:'Today: 1 tasks',rows:[{title:'Task',label:'Today'}]}},{taskDigest:{title:'Your evening wrap',rows:[{title:'Finished today: 1'},{title:'Task',label:'Completed'}]}},{taskSuggest:{title:'Task'}},{taskQuestion:true},{document:{name:'note.txt'}},{pageIntent:true},{sources:[{url:'https://example.com'}]}]){
  const body=new Element('div'),child=new Element('a');child.textContent='Existing result renderer';child.onclick=()=>42;body.append(child);c.messageCard(body,metadata);eq(body.childNodes[0].tagName,'SECTION');ok(body.textContent.includes('Existing result renderer'));eq(child.onclick(),42);eq(body.childNodes[0].dataset.state,metadata.taskSuggest||metadata.taskQuestion?'waiting':'done');
 }
 const plain=new Element('div');plain.append(new Element('p'));c.messageCard(plain,{content:'Hello'});eq(plain.childNodes[0].tagName,'P');
 const host=new Element('div'),progress=c.progressCard(host,'Web reading','Request sent');eq(host.childNodes[0].dataset.state,'working');progress.step('Response received');ok(host.textContent.includes('Response received'));eq(progress.finish('blocked','Actual failure').state,'blocked');ok(host.textContent.includes('Actual failure'));
 const flow={};vm.runInNewContext(source('js/card-flows.js').replace(/export /g,'')+'\nthis.run=clientReply;'.replace('\\n','\n'),flow);
 for(const kind of ['document','page','web']){
  const steps=[],calls=[],data={reply:'Ready',...(kind==='document'?{documentIntent:true}:kind==='page'?{pageIntent:true}:{research:{sources:[]}})};
  let release;const held=new Promise(r=>{release=r;});
  const io={step:x=>steps.push(x),notice:()=>{},task:async()=>{calls.push('task');return null;},page:async()=>{calls.push('page');if(kind==='page'){await held;return {content:'Page ready',page:{saved:true}};}return null;},document:async()=>{calls.push('document');await held;return {content:'Ready',...(kind==='document'?{document:{name:'test.txt'}}:{})};}};
  const pending=flow.run(data,io);ok(steps[0].includes('received'));release();const reply=await pending;eq(reply.cardOutcome.state,'done');eq(calls,kind==='page'?['task','page']:['task','page','document']);eq(steps.length,2);
  const failed=await flow.run(data,{...io,page:async(d,notice)=>{if(kind==='page'){notice('Actual save error');return {content:'Original fallback'};}return null;},document:async(d,notice)=>{notice('Actual file error');return {content:'Original fallback'};}});
  if(kind!=='web'){eq(failed.cardOutcome.state,'blocked');ok(failed.cardOutcome.details.includes('Actual'));eq(failed.content,'Original fallback');}
 }
 // Production secretary rendering snapshots, not synthetic agent events.
 let rows=[{id:'one',title:'Email Ada',status:'open',due_at:'2026-11-20T08:00:00Z'}];
 const ui={document:context.document,crypto:require('crypto').webcrypto,getSession:()=>({user:{id:'owner'}}),refreshTasks:async()=>rows,queryTasks:rs=>rs,taskGroup:t=>t.status==='done'?'Completed':'Upcoming',taskDueLabel:d=>d||'No due date',isCheckin:()=>false,longWaiting:()=>false,taskCandidates:()=>rows,editTask:async()=>({...rows[0],status:'done'}),completionCopy:()=> 'Nicely done.',addTask:async()=>rows[0]};
 vm.runInNewContext(source('js/tasks.js').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'')+'\nthis.api={taskReply,taskCard};'.replace('\\n','\n'),ui);
 const query=await ui.api.taskReply({taskIntent:'list',taskQuery:'week'});eq(query.taskQuery.title,'Due this week');eq(query.taskQuery.rows[0].label,'Upcoming');
 const added=await ui.api.taskReply({taskIntent:'add',taskTitle:'Email Ada'});ok(added.taskAdded);eq(added.content,'Added that to your tasks.');
 const done=await ui.api.taskReply({taskIntent:'complete',taskPhrase:'Email Ada'});ok(done.taskCompleted);ok(done.content.includes('Nicely done.'));
 for(const title of ['Today: 1 tasks','Your evening wrap']){const body=new Element('div');body.append(ui.api.taskCard({taskDigest:{title,rows:query.taskQuery.rows,items:['Email Ada']}},()=>{},()=>{}));c.messageCard(body,{taskDigest:{title,rows:query.taskQuery.rows}});ok(body.textContent.includes(title));ok(body.textContent.includes('Upcoming'));}
 const css=source('css/cards.css');for(const token of ['data-theme=dark','data-theme=system','prefers-color-scheme:dark','max-width:480px','min-width:0','flex-wrap:wrap','font-size:16px','border-radius:19px','#31251f','#fffefa'])ok(css.includes(token));
 ok(!/\.sidebar|\.topbar|\.task-due-banner/.test(css));
 console.log('PASS cards: '+count+' assertions; mocked DOM/phases; no live model/research calls.');
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
