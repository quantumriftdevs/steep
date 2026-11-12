// Run through node tests/tasks.test.js. Built-ins only; no network/model calls.
const assert = require('assert').strict;
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname,'..');
const source = p => fs.readFileSync(path.join(root,p),'utf8');
const task = require('../api/task-intent'), doc = require('../api/doc-intent'), page = require('../api/page-intent');
module.exports = async function roundTests() {
  let checks=0;
  const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const messages=text=>[{role:'user',content:text}];
  const now='2026-11-12T10:00:00+01:00';
  const dates=[
    ['Friday','2026-11-13T09:00:00+01:00'],['tomorrow','2026-11-13T09:00:00+01:00'],
    ['tomorrow at 6pm','2026-11-13T18:00:00+01:00'],['next Friday','2026-11-20T09:00:00+01:00'],
    ['in 3 days','2026-11-15T09:00:00+01:00'],['Dec 3','2026-12-03T09:00:00+01:00'],
    ['no date here',null],['Thursday','2026-11-19T09:00:00+01:00'],
    ['Thursday at 6pm','2026-11-12T18:00:00+01:00'],['Thursday by 9am','2026-11-19T09:00:00+01:00'],
    ['next Thursday','2026-11-26T09:00:00+01:00'],['today','2026-11-12T09:00:00+01:00'],
    ['tonight','2026-11-12T20:00:00+01:00'],['next week','2026-11-16T09:00:00+01:00'],
    ['in 2 hours','2026-11-12T12:00:00+01:00'],['in 2 weeks','2026-11-26T09:00:00+01:00'],
    ['Nov 20','2026-11-20T09:00:00+01:00'],['20 Nov at 6:30pm','2026-11-20T18:30:00+01:00'],
    ['December 3rd 18:00','2026-12-03T18:00:00+01:00'],['tomorrow at 12am','2026-11-13T00:00:00+01:00'],
    ['tomorrow at 12pm','2026-11-13T12:00:00+01:00'],['Feb 30',null],['tomorrow at 25:00',null],
    ['Nov 1','2027-11-01T09:00:00+01:00'],['at 6pm','2026-11-12T18:00:00+01:00'],['by 9am','2026-11-13T09:00:00+01:00']
  ];
  for(const [text,expected] of dates) equal(task.parseDue(text,now),expected);
  equal(task.parseDue('Friday','2026-11-13T08:00:00+01:00'),'2026-11-13T09:00:00+01:00');
  equal(task.parseDue('Friday','2026-11-13T09:00:00+01:00'),'2026-11-13T09:00:00+01:00');
  equal(task.parseDue('Friday','2026-11-13T09:00:01+01:00'),'2026-11-20T09:00:00+01:00');
  equal(task.parseDue('tomorrow','2026-11-12T23:30:00Z'),'2026-11-14T09:00:00+01:00');
  equal(task.parseDue('tomorrow','not a date'),null);
  for(const text of ["Ill send it","I'll send it","I’ll send it","I'm going to send it","I’m going to send it",'Im sending it','I will send it','I need to send it','I must send it']) equal(task.taskSuggestionEligible(messages(text)),true);
  for(const text of ['I feel ill','ill send it','im sending it',"I'll send it?","Maybe I'll send it",'I might send it someday',"I wish I'll send it"]) equal(task.taskSuggestionEligible(messages(text)),false);
  const p=task.taskProtocol();
  equal(task.taskAddResult(p.begin+'\n'+JSON.stringify({title:'Send it'})+'\n'+p.end,p).reply,"I couldn't save that task - please try again.");
  const imports=name=>name==='./task-intent'?task:name==='./doc-intent'?doc:name==='./page-intent'?page:name==='./research'?{research:async()=>null}:name==='./personality'?{prompt:'chat'}:{projectPrompt:async()=> 'chat',providerBody:body=>JSON.stringify(body)};
  const clock=Date.parse(now);
  class FixedDate extends Date {constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}}
  const context={module:{exports:{}},require:imports,Date:FixedDate,process:{env:{GROQ_API_KEY:'mock'}},Buffer,AbortController,AbortSignal,setTimeout,clearTimeout};
  vm.runInNewContext(source('api/chat.js')+'\nthis.helpers={sanitizeChatReply,chooseTaskDue};',context);
  const clean=context.helpers.sanitizeChatReply;
  equal(clean('<b>Send it</b> tomorrow.'),'Send it tomorrow.');
  equal(clean('Fine <<<STEEP_PAGE_abcd:BEGIN>>>thanks<<<STEEP_PAGE_abcd:END>>>'),'Fine thanks');
  equal(clean('<<STEEP-PAGE-BEGIN>>Hello<<STEEP-PAGE-END>>'),'Hello');
  equal(clean('<div>Useful text</div>'),'Useful text');
  equal(clean('<br>'),'');
  equal(clean('<em>Okay</em>').includes("I couldn't prepare that preview"),false);
  equal(context.helpers.chooseTaskDue('Friday','2026-11-18T09:00:00+01:00',clock),'2026-11-13T09:00:00+01:00');
  equal(context.helpers.chooseTaskDue('no date','2026-11-18T09:00:00+01:00',clock),'2026-11-18T08:00:00.000Z');
  equal(context.helpers.chooseTaskDue('no date','Friday',clock),null);
  // Force parser-null to exercise the extra Lagos-weekday model sanity guard.
  const fallback={...context,module:{exports:{}},require:n=>n==='./task-intent'?{...task,parseDue:()=>null}:imports(n)};
  vm.runInNewContext(source('api/chat.js')+'\nthis.choose=chooseTaskDue;',fallback);
  equal(fallback.choose('Friday','2026-11-18T09:00:00+01:00',clock),null);
  equal(fallback.choose('Friday','2026-11-12T23:30:00Z',clock),'2026-11-12T23:30:00.000Z');
  // Real handler paths, with the provider fully mocked. Wrong model due must lose.
  for(const text of ['Remind me to email Ada Friday',"I'll send it tomorrow",'I’ll send it tomorrow']) {
    let calls=0,output,status;
    context.fetch=async(url,options)=>{
      calls++; const sys=JSON.parse(options.body).messages[0].content;
      const begin=sys.match(/<<<STEEP_TASK_[a-f0-9]+:BEGIN>>>/)[0],end=begin.replace(':BEGIN>>>',':END>>>');
      return {ok:true,status:200,json:async()=>({choices:[{message:{content:'<b>Good plan.</b>\n'+begin+'\n'+JSON.stringify({title:'Email Ada',due:'2026-11-18T09:00:00+01:00'})+'\n'+end}}]})};
    };
    await context.module.exports({method:'POST',headers:{},body:{messages:messages(text)}},{setHeader(){},status(n){status=n;return this;},json(o){output=o;}});
    equal(status,200);equal(calls,1);
    equal(output.taskDue||output.taskSuggest?.due,'2026-11-13T09:00:00+01:00');
    if(output.taskSuggest)equal(output.reply,'Good plan.');
  }
  // Attachment and project request text survives a JSON round trip unchanged.
  const payloadContext={TextEncoder,Blob,JSON};
  let payloadCode=source('js/attach-payload.js').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
  vm.runInNewContext(payloadCode+'\nthis.payload=modelPayload;',payloadContext);
  for(const text of ["I'll send it tomorrow",'I’ll send it tomorrow','Ill send it tomorrow',"I'm going to send it",'I’m going to send it']) {
    const payload=payloadContext.payload(messages(text));
    equal(JSON.parse(payload.body).messages.at(-1).content,text);
  }
  // Mutation failures must reject, and a failed queued operation cannot poison the next.
  const data={Intl,Date,Set,Map,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,queueMicrotask(){},crypto:require('crypto').webcrypto,window:{addEventListener(){}},document:{addEventListener(){}},getSession:()=>({user:{id:'owner'}}),getConfig:async()=>({supabaseUrl:'https://mock.invalid',supabaseKey:'mock'}),authHeaders:async()=>({Authorization:'Bearer mock'}),onAuthChange:fn=>fn({user:{id:'owner'}}),logout(){}};
  let mode='empty';
  data.fetch=async(url,o)=>({ok:mode!=='http',status:mode==='http'?500:200,json:async()=>mode==='malformed'?{}:o.method==='GET'?[]:mode==='success'?[{id:'one',title:'Tea',status:'open'}]:[]});
  vm.runInNewContext(source('js/tasks-data.js').replace(/^import[^\n]+\n/,'').replace(/export /g,'')+'\nthis.api={addTask,editTask,deleteTask};',data);
  for(const method of ['addTask','editTask','deleteTask']) for(const failure of ['empty','http','malformed']) {
    mode=failure;let threw=false;
    try{await(method==='addTask'?data.api[method]({title:'Tea'},'chat','one'):data.api[method]('one',{status:'done'}));}catch(e){threw=!!e.message;}
    equal(threw,true);
  }
  mode='success';equal((await data.api.addTask({title:'Tea'},'chat','one')).id,'one');
  console.log('PASS: '+checks+' round regression assertions; '+dates.length+' date fixtures; no live model calls.');
};
