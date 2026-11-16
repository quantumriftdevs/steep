
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
(async()=>{
 let count=0;
 const eq=(a,b)=>{assert.deepEqual(a===undefined?null:JSON.parse(JSON.stringify(a)),b===undefined?null:JSON.parse(JSON.stringify(b)));count++;};
 const ok=x=>{assert.ok(x);count++;};
 const intent=require('../api/task-intent');
 const now=Date.parse('2026-11-16T12:35:00Z'),msg=content=>[{role:'user',content}];
  class Clock extends Date {constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
  let lastSystem='';
  let modelReply='Hello.', calls=0, classified=0, classification='YES';
  const context={module:{exports:{}},require:n=>n==='./research'?{research:async()=>null}:n==='../server/project-context'?{projectPrompt:async()=>require('../server/personality').prompt,providerBody:JSON.stringify}:require(path.resolve('api',n)),process:{env:{GROQ_API_KEY:'mock'}},Buffer,Date:Clock,AbortController,AbortSignal,setTimeout,clearTimeout,fetch:async(url,options)=>{calls++;const request=JSON.parse(options.body),system=request.messages[0].content;lastSystem=system;const begin=system.match(/<<<STEEP_TASK_[a-f0-9]+:BEGIN>>>/)?.[0];let content=modelReply;if(system.startsWith('Classify a reply')){classified++;content=classification;}if(begin&&system.startsWith('Extract exactly')){const found=intent.taskIntent(request.messages,false,now);content=begin+'\n'+JSON.stringify({title:found.cleanTitle||intent.cleanTaskTitle(found.phrase),due:null,notes:null})+'\n'+begin.replace(':BEGIN>>>',':END>>>');}return {ok:true,json:async()=>({choices:[{message:{content}}]})};}};
  vm.runInNewContext(fs.readFileSync('api/chat.js','utf8'),context);
  async function chat(messages,extra={}){let status,output;await context.module.exports({method:'POST',headers:{},body:{messages,...extra}},{setHeader(){},status(n){status=n;return this;},json(v){output=v;}});eq(status,200);return output;}

 const variants=[
 ['Remember me to wash by 13:36','wash','2026-11-16T12:36:00.000Z'],
 ['remember to wash by 13:36','wash','2026-11-16T12:36:00.000Z'],
 ['remember me about the wash at 2pm','the wash','2026-11-16T13:00:00.000Z'],
 ["don't let me forget to wash at 2",'wash','2026-11-16T13:00:00.000Z'],
 ['make sure I wash by 5pm','wash','2026-11-16T16:00:00.000Z'],
 ['I need to remember to wash later','wash',null],
 ['remind me to wash by 13:36','wash','2026-11-16T12:36:00.000Z']];
 let primary;
 for(const [text,title,due] of variants){
  eq(intent.taskIntent(msg(text),false,now).type,'add');
  eq(intent.parseDue(text,now)===null?null:new Date(intent.parseDue(text,now)).toISOString(),due);
  const result=await chat(msg(text));
  if(due){eq(result.taskIntent,'add');eq(result.taskTitle,title);eq(new Date(result.taskDue).toISOString(),due);ok(!/reminder set|sure thing|setting.*now/i.test(result.reply));}
  else {eq(result.taskIntent,'clarify');eq(result.taskPendingTitle,title);eq(result.reply,'When should I remind you?');eq(result.taskTitle,undefined);}
  if(text===variants[0][0])primary=result;
 }
 for(const text of ['remember me to call mum at 4','remember me of the wash at 2pm','remember me for the wash at 2pm','do not let me forget to wash at 2','before I leave, remember to wash by 5pm',"please don't let me forget about the wash at 2pm",'can you make sure I wash by 5pm','Remember me to wash by 13:36?']){eq(intent.taskIntent(msg(text),false,now).type,'add');eq((await chat(msg(text))).taskIntent,'add');}
 const negatives=[
 'do you remember what I said','remember when we went to Lagos','remember today in Lagos',
 'make sure it works','do you remember to wash at 2?','did you remember me to wash at 2?',
 'why make sure I wash by 5pm?','how do I remember to wash at 2?',
 'what does remember me about the wash mean?',
 "don't remember to wash at 2",'do not remember me to wash at 2','never remember me about the wash at 2',
 'no need to remember to wash at 2',"I don't need to remember to wash at 2",'I was told not to remember to wash at 2',
 "don't make sure I wash at 2",'do not make sure I wash at 2','never make sure I wash at 2',
 'make sure I do not wash at 2','make sure I never wash at 2',
 "never don't let me forget to wash at 2",'no need to do not let me forget to wash at 2',
 "do you say don't let me forget to wash at 2?",'why do not let me forget to wash at 2?',
 'if I need to remember to wash at 2','I might remember to wash at 2',
 'remember me to maybe wash at 2','make sure I perhaps wash at 2',
 "don't remind me to wash at 2",'no need to remind me to wash at 2','how do reminders work?'];
 modelReply='Nothing was added.';
 for(const text of negatives){eq(intent.taskIntent(msg(text),false,now),null);const result=await chat(msg(text));eq(result.taskIntent,undefined);eq(result.taskOffer,undefined);}
 // Vetoable: plain advice is reminder intent, but needs a chosen time, not an automatic save.
 for(const text of ['remember to be kind','Remember me to wash','I need to remember to wash later']){const r=await chat(msg(text));eq(r.taskIntent,'clarify');ok(r.taskPendingTitle);eq(r.taskDue,undefined);}
 const pending=await chat(msg('at 2pm'),{taskPending:{title:'wash',at:now}});eq(pending.taskIntent,'add');eq(pending.taskTitle,'wash');eq(new Date(pending.taskDue).toISOString(),'2026-11-16T13:00:00.000Z');
 eq(intent.taskIntent(msg(variants[0][0]),true,now),null);
 const claims=['Sure thing - reminder set for 13:36. Anything else you need?','Your new reminder is set','reminder set for 13:36',"I've saved that",'I have saved that.','Reminder scheduled for 13:36','Your reminder has been created.',"I've scheduled a reminder for you.",'Sure, setting that reminder now.',"I'm setting your reminder now.",'Task added.','All set!','Consider it done.'];
 for(const claim of claims){modelReply=claim;const r=await chat(msg('keep the wash on my radar at 2pm'));eq(r.reply,"I haven't saved a task. What should I remind you about, and when?");eq(r.taskIntent,undefined);eq(r.taskSuggest,undefined);}
 const command='remind me to call mum at 4';
 modelReply='Want a reminder to call mum at 4? [[OFFER:'+JSON.stringify({command})+']]';
 const offered=await chat(msg('keep calling mum on my radar for 4pm'));eq(offered.taskOffer,command);ok(lastSystem.includes('any reminder meaning'));ok(lastSystem.includes('If not app-handled, clarify via')); 
 const {createTaskOffer,offerRequest}=await import('../js/task-offer.mjs');const state=createTaskOffer(),scope={chat:'one',user:'owner'};
 state.arm(offered.taskOffer,scope,now);const accepted=state.consume('yes',scope,now+1);eq(accepted.type,'accept');
 const body=JSON.parse(offerRequest(JSON.stringify({messages:msg('yes')}),accepted));eq((await chat(body.messages)).taskIntent,'add');
 modelReply='Sure, setting that reminder now. [[OFFER:'+JSON.stringify({command})+']]';const guarded=await chat(msg('keep calling mum on my radar for 4pm'));eq(guarded.taskOffer,command);eq(guarded.reply,"I haven't saved it yet. Add this reminder?");
 state.arm(undefined,scope,now);eq(state.consume('Yeah',scope,now+1).type,'input');modelReply='What should I remind you about?';eq((await chat(msg('Yeah'))).taskIntent,undefined);
 const src=fs.readFileSync('js/tasks.js','utf8'),start=src.indexOf('export async function taskReply'),end=src.indexOf('\nexport ',start+1);
 let session=true,saved=[],fail=false;const browser={getSession:()=>session,crypto:require('node:crypto').webcrypto,addTask:async(values)=>{if(fail)throw Error('storage unavailable');saved.push(values);return {id:'saved',...values};}};
 vm.runInNewContext(src.slice(start,end).replace('export ','')+'\nthis.reply=taskReply;',browser);
 const result=await browser.reply(primary);eq(saved.length,1);eq(result.taskAdded.title,'wash');eq(result.content,'Added that to your tasks.');
 fail=true;await assert.rejects(()=>browser.reply(primary),/storage unavailable/);count++;eq(saved.length,1);
 session=false;await assert.rejects(()=>browser.reply(primary),/sign in/);count++;eq(saved.length,1);
 state.arm(command,{chat:'guest'},now);eq(state.consume('yes',{chat:'guest'},now+1).type,'input');
 const cardContext={getSession:()=>({user:{id:'owner'}}),node:(tag,text='')=>({tag,text,children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}}),button:(text,action)=>({tag:'button',text,action}),taskDueLabel:x=>x};
 const cardStart=src.indexOf('export function taskCard'),cardEnd=src.indexOf('\nexport ',cardStart+1);vm.runInNewContext(src.slice(cardStart,cardEnd).replace('export ','')+'\nthis.card=taskCard;',cardContext);
 const card=cardContext.card(result,()=>{},()=>{});eq(card.children[0].text,'Task added: wash');eq(card.children[2].text,'Undo');

 // Autocorrect is a deterministic clarifying offer, never a pre-affirmation save.
 for(const text of ['reminder me to bath in 10mins','Reminder me to bath in 10 mins','please reminder me to bath in 10mins']){
  eq(intent.taskIntent(msg(text),false,now).type,'add');const before=calls,r=await chat(msg(text));eq(calls,before);eq(r.taskIntent,undefined);eq(r.taskOffer,'remind me to bath in 10'+(text.includes('10 mins')?' mins':'mins'));ok(r.reply.startsWith('Do you mean to set a reminder to bath in 10'));
  for(const answer of ['yes','yeah','do am','no wahala']){
   state.arm(r.taskOffer,scope,now);const accepted=state.consume(answer,scope,now),body=JSON.parse(offerRequest(JSON.stringify({messages:msg(answer)}),accepted));classification='YES';
   const payload=await chat(body.messages,body.taskOfferReply?{taskOfferReply:body.taskOfferReply}:{});eq(payload.taskIntent,'add');eq(payload.taskTitle,'bath');eq(Date.parse(payload.taskDue),now+600000);
   session=true;fail=false;const savedBefore=saved.length,result=await browser.reply(payload);eq(saved.length,savedBefore+1);eq(result.taskAdded.title,'bath');const card=cardContext.card(result,()=>{},()=>{});eq(card.children[0].text,'Task added: bath');eq(card.children[2].text,'Undo');
  }
 }
 for(const text of ["don't reminder me to bath in 10mins",'do you mean reminder me to bath in 10mins?','reminder me to maybe bath in 10mins'])eq(intent.taskIntent(msg(text),false,now),null);
 const typoMissing=await chat(msg('reminder me to bath'));eq(typoMissing.taskIntent,'clarify');eq(typoMissing.taskPendingTitle,'bath');
 // The live-count UI reuses existing badge markup/styles and the existing change subscription.
 class El {constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.attrs={};this.classList={toggle(){}};this.isConnected=false;}append(...xs){this.children.push(...xs);}prepend(x){this.children.unshift(x);}replaceChildren(...xs){this.children=xs;}setAttribute(k,v){this.attrs[k]=v;}querySelector(s){if(s==='svg')return this.icon;}}
 let badgeRows=[],change,badgeUser={user:{id:'owner'}};const nav=new El('nav'),composer=new El('div'),head=new El('head');
 const ui={getSession:()=>badgeUser,taskRows:()=>badgeRows,onTasksChange:fn=>{change=fn;},projectNav:{tab:'chat'},document:{head,createElement:tag=>new El(tag),createElementNS:(_,tag)=>new El(tag),querySelector:s=>s==='.project-selectors'?nav:composer},projectRow:()=>{const el=new El('button');el.icon=new El('svg');el.icon.namespaceURI='svg';return el;}};
 const setupStart=src.indexOf('export function setupTasks'),setupEnd=src.indexOf('\nfunction presentationRows',setupStart),helpers=src.slice(src.indexOf('const node ='),src.indexOf('const localDue'));
 vm.runInNewContext(helpers+src.slice(setupStart,setupEnd).replace('export ','')+'\nthis.setup=setupTasks;',ui);
 ui.setup({busy:()=>false,notice(){}});const tab=nav.children[0],badge=tab.children[0];eq(tab.id,'tasks-tab');eq(badge.hidden,true);eq(badge.textContent,'');
 badgeRows=[{id:'one',status:'open'}];change();eq(badge.textContent,'(1)');eq(badge.hidden,false);eq(badge.attrs['aria-label'],'1 open tasks');
 badgeRows.push({id:'two',status:'open'},{id:'done',status:'done'});change();eq(badge.textContent,'(2)');
 badgeRows[0].status='done';change();eq(badge.textContent,'(1)');badgeRows[1].status='done';change();eq(badge.hidden,true);eq(badge.textContent,'');
 badgeRows[0].status='open';change();eq(badge.textContent,'(1)');badgeRows=[];change();eq(badge.hidden,true);
 badgeRows=[{status:'open'}];badgeUser=null;change();eq(badge.hidden,true);eq(badge.textContent,'');
 badgeUser={user:{id:'other'}};badgeRows=[];change();eq(badge.hidden,true);eq(badge.attrs['aria-label'],'0 open tasks');

 console.log('PASS: '+count+' reminder honesty assertions; real intent/chat/saver/card/offer code, mocked externals.');
})().catch(e=>{console.error(e);process.exitCode=1;});

