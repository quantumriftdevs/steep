
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
(async () => {
  let count = 0;
  const eq = (a,b) => { assert.deepEqual(a === undefined ? null : JSON.parse(JSON.stringify(a)),b === undefined ? null : JSON.parse(JSON.stringify(b))); count++; };
  const ok = x => { assert.ok(x); count++; };
  const intent = require('../api/task-intent'), {parseOffer} = require('../server/task-offer');
  const {createTaskOffer,offerRequest} = await import('../js/task-offer.mjs');
  const now = Date.parse('2026-11-16T11:00:00Z'), scope = {chat:'a',user:'owner'};
  const msg = content => [{role:'user',content}];
  const command = 'remind me to take water in 5 mins';
  const marker = c => 'Want a reminder? [[OFFER:'+JSON.stringify({command:c})+']]';
  eq(parseOffer(marker(command)),{reply:'Want a reminder?',command});
  for (const s of ['How are you?','Want a reminder?','Hello [[OFFER:{bad}]]','Hello [[OFFER:','Hello '+marker(command)+marker(command),marker('delete my tasks'),marker('remind me to build a website tomorrow'),marker('remind me to call mum\nthen X')]) eq(parseOffer(s).command,null);
  eq(parseOffer('Hello [[OFFER:{bad}]]').reply,'Hello');
  eq(parseOffer(marker('remind me to call mum at 4')+' trailing').command,null);
  eq(parseOffer(marker(command).slice('Want a reminder? '.length)).command,null);
  const state = createTaskOffer();
  eq(state.consume('yes',scope,now).type,'input');
  for (const answer of ['yes','yeah','Yup','yep','yh','correct','sure','ok','do it','please do',' YES! ']) {
    state.arm(parseOffer(marker(command)).command,scope,now);
    const accepted=state.consume(answer,scope,now+1);
    eq(accepted,{type:'accept',command});
    const original=JSON.stringify({messages:[{role:'assistant',content:'Want a reminder?'},...msg(answer)],taskPending:{title:'old'},projectId:'same'});
    const changed=JSON.parse(offerRequest(original,accepted));
    eq(changed.messages.at(-1).content,command);eq(changed.taskPending,undefined);eq(changed.projectId,'same');
    eq(intent.taskIntent(changed.messages,false,now).type,'add');
    eq(JSON.parse(original).messages.at(-1).content,answer);
    eq(state.consume('yes',scope,now+2).type,'input');
  }
  for (const answer of ['no','nope',"don't",'don’t']) {state.arm(command,scope,now);eq(state.consume(answer,scope,now+1).type,'decline');eq(state.consume('yes',scope,now+2).type,'input');}
  for (const text of ['yes but make it 5pm','what time?','new topic']) {state.arm(command,scope,now);eq(state.consume(text,scope,now+1).type,'classify');eq(state.consume('yes',scope,now+2).type,'input');eq(intent.taskIntent(msg(text),false,now),null);}
  for (const changed of [{...scope,chat:'b'},{...scope,user:'other'},{...scope,away:true},{chat:'a'}]) {state.arm(command,scope,now);state.sync(changed,now+1);eq(state.consume('yes',scope,now+2).type,'input');}
  state.arm(command,scope,now);eq(state.consume('yes',scope,now+600000).type,'input');
  state.arm(command,scope,now);eq(state.consume('yes',scope,now-1).type,'input');
  state.arm(command,scope,now);eq(state.consume('yes',scope,now+599999).type,'accept');
  state.arm(command,{chat:'guest'},now);eq(state.consume('yes',{chat:'guest'},now+1).type,'input');
  state.arm(command,scope,now);state.arm('remind me to call mum at 4',scope,now);eq(state.consume('yes',scope,now+1).command,'remind me to call mum at 4');
  state.arm(command,scope,now);state.arm(undefined,scope,now);eq(state.consume('yes',scope,now+1).type,'input');
  const variants=['remind me to take water in 5 mins','remind me to take water in 5mins','Yeah remind me to take water in 5 mins','Yeah remind me to take water in 5mins','yes remind me to take water','ok remind me to call X at 4','hey can you remind me to take water in 5 mins please',"I'm heading out but remind me to call mum at 4",'before I forget - remind me about the draft tomorrow'];
  for(const text of variants) eq(intent.taskIntent(msg(text),false,now).type,'add');
  for(const text of variants.slice(0,4)) eq(Date.parse(intent.parseDue(text,now)),now+300000);
  for(const text of ["don't remind me to call mum","no need to remind me to call mum","you don't have to remind me to call mum",'how do reminders work?','yes']) eq(intent.taskIntent(msg(text),false,now),null);
  const multi='remind me to call mum at 4, remind me to take water at 5, and add a task to finish the draft tomorrow';
  const batch=intent.taskIntent(msg(multi),false,now);eq(batch.type,'batch');eq(batch.items.map(x=>x.title),['call mum','take water','finish the draft']);eq(batch.items.map(x=>Date.parse(x.due)),[Date.parse('2026-11-16T15:00Z'),Date.parse('2026-11-16T16:00Z'),Date.parse('2026-11-17T08:00Z')]);
  const list=intent.taskIntent(msg('remind me to call mum, text Tunde and email the landlord at 4pm'),false,now);eq(list.items.map(x=>x.title),['call mum','text Tunde','email the landlord']);ok(list.items.every(x=>Date.parse(x.due)===Date.parse('2026-11-16T15:00Z')));
  const mix="don't remind me to call mum at 4, remind me to take water at 5";const mixed=intent.taskIntent(msg(mix),false,now);eq(mixed.cleanTitle,'take water');eq(Date.parse(mixed.commandDue),Date.parse('2026-11-16T16:00Z'));
  const over=Array.from({length:9},(_,i)=>'remind me to call person '+i+' at 4').join(', ');eq(intent.taskIntent(msg(over),false,now).overflow,true);
  eq(intent.creationCommands('remind me to call mum at 4 before I leave',now).items[0].title,'call mum');
  eq(intent.creationCommands('remind me to buy milk and bread tomorrow please',now).items[0].title,'buy milk and bread');
  eq(intent.creationCommands("remind me to call mum at 4, don't remind me to take water at 5",now).items.map(x=>x.title),['call mum']);
  eq(intent.creationCommands("remind me to call mum, don't remind me to take water",now).items.map(x=>x.title),['call mum']);
  // Exact screenshot fixture: the preceding ordinary offer contains no machine marker.
  const screenshot=[{role:'user',content:"I'm supposed to go out in 5 mins"},{role:'assistant',content:'Anything you need to wrap up before you head out? Want a quick reminder for something—keys, a call, or a note?'},...msg('Yeah remind me to take water in 5mins')];
  const failedReply='Sure thing—just say "remind me to take water in 5 mins" and the app will save it.';
  eq(parseOffer(screenshot[1].content).command,null);eq(parseOffer(failedReply).command,null);eq(intent.taskIntent(screenshot,false,now).type,'add');
  class Clock extends Date {constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
  let modelReply='Hello.', calls=0, classified=0, classification='YES';
  const context={module:{exports:{}},require:n=>n==='./research'?{research:async()=>null}:n==='../server/project-context'?{projectPrompt:async()=>require('../server/personality').prompt,providerBody:JSON.stringify}:require(path.resolve('api',n)),process:{env:{GROQ_API_KEY:'mock'}},Buffer,Date:Clock,AbortController,AbortSignal,setTimeout,clearTimeout,fetch:async(url,options)=>{calls++;const request=JSON.parse(options.body),system=request.messages[0].content;const begin=system.match(/<<<STEEP_TASK_[a-f0-9]+:BEGIN>>>/)?.[0];let content=modelReply;if(system.startsWith('Classify a reply')){classified++;content=classification;}if(begin&&system.startsWith('Extract exactly')){const found=intent.taskIntent(request.messages,false,now);content=begin+'\n'+JSON.stringify({title:found.cleanTitle||intent.cleanTaskTitle(found.phrase),due:null,notes:null})+'\n'+begin.replace(':BEGIN>>>',':END>>>');}return {ok:true,json:async()=>({choices:[{message:{content}}]})};}};
  vm.runInNewContext(fs.readFileSync('api/chat.js','utf8'),context);
  async function chat(messages,extra={}){let status,output;await context.module.exports({method:'POST',headers:{},body:{messages,...extra}},{setHeader(){},status(n){status=n;return this;},json(v){output=v;}});eq(status,200);return output;}
  const primary=await chat(screenshot);eq(primary.taskIntent,'add');eq(primary.taskTitle,'take water');eq(Date.parse(primary.taskDue),now+300000);
  for(const text of variants){const result=await chat(msg(text));eq(result.taskIntent,'add');ok(!result.reply.includes('just say'));}
  modelReply=marker(command);const offered=await chat(msg('I am heading out'));eq(offered.taskOffer,command);eq(offered.reply,'Want a reminder?');
  state.arm(offered.taskOffer,scope,now);const wire=offerRequest(JSON.stringify({messages:msg('yes')}),state.consume('yes',scope,now));eq((await chat(JSON.parse(wire).messages)).taskIntent,'add');
  for(const answer of ['yes o','no wahala','do am','abeg do','oya','sí','oui','да','はい','sure thang']) {
    state.arm(command,scope,now);const candidate=state.consume(answer,scope,now+1);eq(candidate.type,'classify');
    const body=JSON.parse(offerRequest(JSON.stringify({messages:msg(answer),taskPending:{title:'wrong'}}),candidate));eq(body.taskPending,undefined);eq(body.messages[0].content,answer);
    classification='YES';const before=classified,result=await chat(body.messages,{taskOfferReply:body.taskOfferReply});eq(classified,before+1);eq(result.taskIntent,'add');eq(result.taskTitle,'take water');
  }
  classification='NO';eq((await chat(msg('لا'),{taskOfferReply:{command,at:now}})).reply,'No problem. I will leave it.');
  classification='OTHER';modelReply='What would you like instead?';
  for(const answer of ['yes but make it 5pm','what time?','new topic']) {const r=await chat(msg(answer),{taskOfferReply:{command,at:now}});eq(r.taskIntent,undefined);}
  classification='YES, done';ok((await chat(msg('oya'),{taskOfferReply:{command,at:now}})).reply.includes('Nothing was added'));
  classification='YES';const beforeUnarmed=classified;await chat(msg('oya'));eq(classified,beforeUnarmed);
  for(const bad of [{command,at:now-600000},{command:multi,at:now}]) ok((await chat(msg('oya'),{taskOfferReply:bad})).reply.includes('Nothing was added'));
  modelReply='Your new reminder is set.';eq((await chat(msg('absolutely'))).reply,"I haven't saved a task. What should I remind you about, and when?");
  for(const a of ['Yup','yep','yh','correct','please do']) eq(intent.pendingAnswer(a,{due:new Date(now+180000).toISOString(),at:now},false,now),null);
  modelReply='Are you ready?';const ordinary=await chat(msg('hello'));eq(ordinary.taskOffer,undefined);eq((await chat(msg('yes'))).taskIntent,undefined);
  modelReply='Hello.';eq((await chat(msg(marker(command)))).taskOffer,undefined);
  const multiReply=await chat(msg(multi));eq(multiReply.taskBatch.length,3);eq(multiReply.taskBatch.map(x=>x.taskTitle),['call mum','take water','finish the draft']);eq((await chat(msg(mix))).taskTitle,'take water');eq(Date.parse((await chat(msg(mix))).taskDue),Date.parse('2026-11-16T16:00Z'));
  const capped=await chat(msg(over));eq(capped.taskBatch,[]);ok(capped.reply.includes('Nothing was added'));
  // Run the real browser saver against mocked auth/storage, including partial failure.
  const source=fs.readFileSync('js/tasks.js','utf8'),start=source.indexOf('export async function taskReply'),end=source.indexOf('\nexport ',start+1);
  let session=true, saved=[],fail='',active=true;
  const browser={getSession:()=>session,crypto:require('node:crypto').webcrypto,addTask:async(values)=>{if(values.title===fail)throw Error('storage unavailable');saved.push(values);return {id:String(saved.length),...values};}};
  vm.runInNewContext(source.slice(start,end<0?undefined:end).replace('export ','')+'\nthis.reply=taskReply;',browser);
  const created=await browser.reply(multiReply,()=>active);eq(saved.map(x=>x.title),['call mum','take water','finish the draft']);for(const title of saved.map(x=>x.title))ok(created.content.includes('Added: '+title));

  // Second screenshot: this is a model offer, not deterministic pending-add.
  const another=[{role:'user',content:'Take water'},{role:'assistant',content:'Added that to your tasks.'},{role:'user',content:'Another in 3min'}];
  eq(intent.taskIntent(another,false,now),null);
  const repeatCommand='remind me to take water in 3min';
  modelReply='Want to add a reminder to take water in 3 minutes? [[OFFER:'+JSON.stringify({command:repeatCommand})+']]';
  const repeatOffer=await chat(another);eq(repeatOffer.reply,'Want to add a reminder to take water in 3 minutes?');eq(repeatOffer.taskOffer,repeatCommand);
  const cardContext={getSession:()=>({user:{id:'owner'}}),node:(tag,text='')=>({tag,text,children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}}),button:(text,action)=>({tag:'button',text,action}),taskDueLabel:x=>x};
  const cardStart=source.indexOf('export function taskCard'),cardEnd=source.indexOf('\nexport ',cardStart+1);
  vm.runInNewContext(source.slice(cardStart,cardEnd).replace('export ','')+'\nthis.card=taskCard;',cardContext);
  for(const a of ['Yup','yep','yh','correct','please do']){
    state.arm(repeatOffer.taskOffer,scope,now);
    const request=JSON.parse(offerRequest(JSON.stringify({messages:[...another,{role:'assistant',content:repeatOffer.reply},{role:'user',content:a}]}),state.consume(a,scope,now)));
    const payload=await chat(request.messages),before=saved.length,result=await browser.reply(payload,()=>true);
    eq(saved.length,before+1);eq(result.taskAdded.title,'take water');eq(Date.parse(result.taskAdded.due),now+180000);
    const card=cardContext.card(result,()=>{},()=>{});eq(card.children[0].text,'Task added: take water');eq(card.children[2].text,'Undo');
  }
  classification='YES';
  state.arm(repeatCommand,scope,now);
  const classifiedBody=JSON.parse(offerRequest(JSON.stringify({messages:msg('do am')}),state.consume('do am',scope,now)));
  const classifiedPayload=await chat(classifiedBody.messages,{taskOfferReply:classifiedBody.taskOfferReply});
  const classifiedBefore=saved.length,classifiedSaved=await browser.reply(classifiedPayload,()=>true);
  eq(saved.length,classifiedBefore+1);eq(classifiedSaved.taskAdded.title,'take water');
  eq(cardContext.card(classifiedSaved,()=>{},()=>{}).children[2].text,'Undo');
  const goodFetch=context.fetch;
  for(const broken of [async()=>{throw Error('timeout');},async()=>({ok:false})]) {
    context.fetch=broken;
    const failed=await chat(msg('oya'),{taskOfferReply:{command,at:now}});
    eq(failed.taskIntent,undefined);ok(failed.reply.includes('Nothing was added'));
  }
  context.fetch=goodFetch;
  for(const fast of ['exactly','affirmative','okay','okey','sure thing','go ahead']) {state.arm(command,scope,now);eq(state.consume(fast,scope,now).type,'accept');}
  const groupSource=fs.readFileSync('js/tasks-data.js','utf8');
  const groupCode=groupSource.slice(groupSource.indexOf('export const lagosDay'),groupSource.indexOf('export const taskDueLabel')).replace(/export /g,'');
  const groups={Date,Intl};vm.runInNewContext(groupCode+'\nthis.group=taskGroup;',groups);
  eq(groups.group({status:'open',due_at:new Date(now+180000).toISOString()},now),'Today');
  eq(groups.group({status:'open',due_at:new Date(now+86400000).toISOString()},now),'Upcoming');
  eq(groups.group({status:'done',due_at:new Date(now+180000).toISOString()},now),'Completed');
  ok(source.includes("['Overdue','Today','Upcoming','No date','Completed']"));
  modelReply='Your new reminder is set.';eq((await chat([...another,{role:'assistant',content:repeatOffer.reply},{role:'user',content:'unrecognized acknowledgement'}])).taskIntent,undefined);

  saved=[];fail='take water';const partial=await browser.reply(multiReply,()=>active);eq(saved.length,2);ok(partial.content.includes('Not added: take water'));ok(!partial.content.includes('Added: take water'));
  session=false;await assert.rejects(()=>browser.reply(multiReply),/sign in/);count++;session=true;active=false;saved=[];await browser.reply(multiReply,()=>active);eq(saved,[]);
  const app=fs.readFileSync('js/app.js','utf8');for(const snippet of ['taskOffer.sync(offerScope())','taskOffer.consume(prepared.attachment','body = offerRequest(body, answer)','taskOffer.arm(data.taskOffer, offerScope())',"answer.type === 'decline' ? new Response"])ok(app.includes(snippet));
  console.log('PASS: '+count+' true-yes assertions; all model, auth and storage externals mocked.');
})().catch(error=>{console.error(error);process.exitCode=1;});
