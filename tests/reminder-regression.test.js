// Reminder routing and display regressions. No live model calls.
const assert = require('assert').strict;
const fs = require('fs'), vm = require('vm');
const task = require('../api/task-intent');
module.exports = async function () {
  let checks = 0;
  const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
  const now = Date.parse('2026-11-13T15:15:38.896+01:00');
  const messages = content => [{role:'user',content}];
  for (const text of ['Remind me for school in 2 mins','Please remind me for school in 2 minutes','reminder for school in 2 min','remind me for school tomorrow','reminder for school Friday']) {
    eq(task.taskIntent(messages(text),false,now).type,'add');
    eq(task.taskIntent(messages(text),false,now).phrase, text.replace(/^(?:Please )?(?:Remind me for|reminder for) /i,''));
    eq(task.taskIntent(messages(text),true,now),null);
  }
  for (const text of ['remind me to email Ada in 2 mins','remind me about school in 2 mins','remind me of school in 2 mins','set a reminder for school in 2 mins']) eq(task.taskIntent(messages(text),false,now).type,'add');
  for (const text of ['set reminder for school in 2 mins','set a reminder to call Ada in 2 mins','remind me for school']) eq(task.taskIntent(messages(text),false,now).type,"add");
  for (const unit of ['min','mins','minute','minutes']) eq(task.parseDue('school in 2 '+unit,now),'2026-11-13T15:17:38+01:00');
  eq(task.parseDue('in 36501 mins',now),null);
  eq(task.parseDue('in 2 mins',NaN),null);
  for (const text of ['remind me in 2 mins','remind me for in 2 mins','reminder for in 2 mins','reminder for tomorrow']) eq(task.taskIntent(messages(text),false,now).type,'clarify');
  for (const word of ['maybe','might','someday','perhaps','eventually','wish','hypothetical']) eq(task.taskIntent(messages('reminder for '+word+' school in 2 mins'),false,now)?.type === 'add',false);
  for (const text of ['reminder for school','remind me for a PDF tomorrow','reminder for a website tomorrow']) eq(task.taskIntent(messages(text),false,now),null);
  const source = fs.readFileSync(require.resolve('../api/chat'),'utf8');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  async function chat(text, modelReply) {
    let output, status, count=0;
    const module = {exports:{}};
    const imports = name => name === './task-intent' ? task : name === './doc-intent' ? require('../api/doc-intent') : name === './page-intent' ? require('../api/page-intent') : name === './research' ? {research:async()=>null} : name === './personality' ? {prompt:'Normal chat'} : {projectPrompt:async()=> 'Normal chat',providerBody:JSON.stringify};
    vm.runInNewContext(source,{module,require:imports,process:{env:{GROQ_API_KEY:'mock'}},Buffer,Date:Clock,fetch:async(url,options)=> {
      count++;
      const system=JSON.parse(options.body).messages[0].content;
      const begin=system.match(/<<<STEEP_TASK_[a-f0-9]+:BEGIN>>>/)[0];
      return {ok:true,json:async()=>({choices:[{message:{content:typeof modelReply === 'function' ? modelReply(begin,begin.replace(':BEGIN',':END')) : modelReply}}]})};
    },AbortController,AbortSignal,setTimeout,clearTimeout,console});
    await module.exports({method:'POST',headers:{},body:{messages:messages(text)}},{setHeader(){},status(n){status=n;return this;},json(o){output=o;return o;}});
    eq(status,200);eq(count,1); return JSON.parse(JSON.stringify(output));
  }
  const json='{"title":"School reminder","due":"2026-11-13T15:17:38.896+01:00"}';
  for (const metadata of ['<<>\n'+json+'\n<<>>','<<BROKEN>>\n'+json+'\n<<END>>','<<'+json+'>>','<<<STEEP_TASK_bad:BEGIN>>>\n'+json+'\n<<<STEEP_TASK_bad:END>>>','<<>\n'+json,'<<>','<<<STEEP_TASK_bad:END>>>']) {
    const result=await chat('Hello there','Clean reply.\n\n'+metadata);
    eq(result.reply,'Clean reply.');eq(result.taskSuggest,undefined);eq(result.taskIntent,undefined);
  }
  for (const [input, expected] of [
    ['Before.\n<<>\n'+json+'\n<<>>\nAfter.','Before.\n\nAfter.'],
    ['Math: 2 << 3','Math: 2 << 3'],
    ['Example '+json,'Example '+json],
    ['Clean.\n<<>\n{"title":"School } reminder","due":null}\n<<>>','Clean.']
  ]) eq((await chat('Hello there',input)).reply,expected);
  const wellFormed=(begin,end)=>'Good plan.\n'+begin+'\n'+json+'\n'+end;
  const suggestion=await chat("I'll go to school in 2 mins",wellFormed);
  eq(suggestion.reply,'Good plan.');eq(suggestion.taskSuggest.title,'School reminder');eq(suggestion.taskIntent,undefined);
  // The newly recognized anchor now prepares an explicit ADD, never a suggestion.
  const missed=await chat('set a reminder to call Ada in 2 mins',wellFormed);
  eq(missed.taskTitle,'School reminder');eq(missed.taskIntent,'add');eq(missed.taskSuggest,undefined);
  const ineligible=await chat('Hello there',wellFormed);
  eq(ineligible.reply,'Good plan.');eq(ineligible.taskSuggest,undefined);eq(ineligible.taskIntent,undefined);
  const add=await chat('Remind me for school in 2 mins',(begin,end)=>begin+'\n'+json+'\n'+end);
  eq(add.taskIntent,'add');eq(add.taskTitle,'School reminder');eq(add.taskDue,'2026-11-13T15:17:38+01:00');eq(add.taskSuggest,undefined);
  // Same public client path: only taskIntent=add saves, then returns the existing confirmation.
  const client=fs.readFileSync(require.resolve('../js/tasks.js'),'utf8');
  const start=client.indexOf('export async function taskReply'), end=client.indexOf('export function taskCard',start);
  let saves=0, saved;
  const context={getSession:()=>({user:{id:'owner'}}),addTask:async data=>{saves++;saved=data;return {id:'school',title:data.title,due_at:data.due_at};},crypto:require('crypto').webcrypto,taskRows:()=>[]};
  vm.runInNewContext(client.slice(start,end).replace('export ', '')+';this.taskReply=taskReply;',context);
  eq(await context.taskReply(suggestion),null);eq(saves,0);
  const confirmation=await context.taskReply(add);
  eq(confirmation.content,'Added that to your tasks.');eq(saves,1);eq(saved.title,'School reminder');eq(saved.due_at,add.taskDue);
  console.log('PASS: '+checks+' reminder regression assertions; fetch mocked.');
};
