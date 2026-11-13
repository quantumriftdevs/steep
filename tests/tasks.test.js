// Run: node tests/tasks.test.js — built-ins only; fetch is always mocked.
const assert = require('assert').strict;
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const task = require('../api/task-intent');
const doc = require('../api/doc-intent'), page = require('../api/page-intent');
const messages = content => [{ role: 'user', content }];
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
const fixtures = [
  ['remind me to email Ada Friday','add'], ['add milk to my list','add'],
  ["don't let me forget to pay rent",'add'], ['create a task to call Mum','add'],
  ['make a task: book dentist','add'], ['todo: buy tea','add'],
  ["what's on my list",'list'], ['my tasks','list'],
  ['what do I have to do','list'], ['show my tasks','list'],
  ['done with email Ada','complete'], ['I finished email Ada','complete'],
  ['mark email Ada done','complete'], ['check off email Ada','complete'],
  ['I completed email Ada','complete'], ['remove milk from my list','delete'],
  ['delete milk from my tasks','delete'], ['How do reminders work?',null],
  ['What should I do tomorrow?',null], ['create a PDF task list',null],
  ['build a landing page',null], ['Please remind me to call Ada.','add']
];
for (const [text, expected] of fixtures) equal(task.taskIntent(messages(text))?.type || null, expected);
equal(task.taskIntent(messages('todo: email Ada'), true), null);
equal(task.taskIntent(messages('I finished email Ada')).phrase, 'email Ada');
equal(task.taskIntent(messages('mark email Ada as done')).phrase, 'email Ada');
equal(!!doc.documentIntent(messages('create a PDF task list')), true);
equal(!!page.pageIntent(messages('build a landing page')), true);
const p = task.taskProtocol();
const block = data => p.begin + '\n' + JSON.stringify(data) + '\n' + p.end;
equal(task.taskAddResult(block({title:'Email Ada',due:'2026-11-13T09:00:00+01:00'}),p).taskDue, '2026-11-13T08:00:00.000Z');
equal(task.taskAddResult(block({title:'Buy tea',due:null}),p).taskDue,null);
equal(task.validDue('2026-02-30T09:00:00+01:00'),null);
equal(task.validDue('Friday'),null);
equal(task.taskAddResult(block({title:'x'.repeat(201)}),p).taskIntent,undefined);
equal(task.taskAddResult(block({title:'Email Ada'})+'\n'+p.end,p).taskIntent,undefined);
equal(task.taskSuggestionResult('Good plan.\n'+block({title:'Send proposal',due:null}),p),{reply:'Good plan.',taskSuggest:{title:'Send proposal',due:null}});
equal(task.taskSuggestionResult('Hello!',p),{reply:'Hello!'});
equal(task.taskSuggestionEligible(messages("I'll send the proposal Thursday")),true);
equal(task.taskSuggestionEligible(messages('Should I send it Thursday?')),false);
equal(task.taskSuggestionEligible(messages('I might send it someday')),false);
async function run() {
  const context = { Intl, Date, Set, Map, URLSearchParams, AbortController, crypto: require('crypto').webcrypto,
    setTimeout, clearTimeout, queueMicrotask: () => {}, window:{addEventListener(){}}, document:{addEventListener(){}},
    getSession: () => ({user:{id:'owner'}}), getConfig: async () => ({supabaseUrl:'https://mock.invalid',supabaseKey:'mock'}),
    authHeaders: async () => ({Authorization:'Bearer mock'}), onAuthChange: fn => fn({user:{id:'owner'}}), logout(){} };
  let rows = [], calls = [];
  context.fetch = async (url, options) => {
    calls.push(options.method); const query = new URL(url).searchParams;
    const id = query.get('id')?.slice(3); const body = options.body && JSON.parse(options.body);
    let result;
    if (options.method === 'POST') { result = [{...body,created_at:'2026-11-12T00:00:00Z'}]; rows.push(result[0]); }
    else if (options.method === 'PATCH') { rows = rows.map(t => t.id === id ? {...t,...body} : t); result = rows.filter(t=>t.id===id); }
    else if (options.method === 'DELETE') { result=rows.filter(t=>t.id===id); rows = rows.filter(t=>t.id!==id); }
    else result=rows.slice(Number(query.get('offset') || 0),Number(query.get('offset') || 0)+500);
    return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(result))};
  };
  const dataCode = source('js/tasks-data.js').replace(/^import[^\n]+\n/, '').replace(/export /g,'');
  context.URL = URL;
  vm.runInNewContext(dataCode + '\nthis.api={addTask,editTask,deleteTask,matchTask,taskGroup,taskRows};', context);
  const api = context.api;
  const added=await api.addTask({title:'Email Ada Friday'},'chat','one');
  equal(added.source,'chat'); equal(api.matchTask('email Ada',api.taskRows()).id,'one');
  equal(api.matchTask('unrelated',api.taskRows()),null);
  await api.editTask('one',{status:'done'}); equal(api.matchTask('email Ada',api.taskRows()),null);
  await api.deleteTask('one'); equal(api.taskRows().length,0);
  equal(calls.includes('POST') && calls.includes('PATCH') && calls.includes('DELETE'),true);
  equal(api.taskGroup({status:'open',due_at:'2026-11-13T00:30:00+01:00'},Date.parse('2026-11-12T23:00:00Z')),'Today');
  rows=Array.from({length:500},(_,i)=>({id:String(i),title:'Task '+i,status:'open'}));
  let capped=false; try { await api.addTask({title:'Extra'},'manual','extra'); } catch(e) { capped=/500/.test(e.message); } equal(capped,true);
  const imports = name => name === './task-intent' ? task : name === './doc-intent' ? doc : name === './page-intent' ? page : name === './research' ? {research:async()=>null} : name === './personality' ? {prompt:'Normal chat'} : {projectPrompt:async()=> 'Normal chat',providerBody: body=>JSON.stringify(body)};
  for (const [text, expected] of [['my tasks','list'],['I finished email Ada','complete'],['delete email Ada from my list','delete'],['remind me to email Ada Friday','add'],["I'll send the proposal Thursday",'suggest'],['Hello there','normal']]) {
    let count=0, output, status;
    const module={exports:{}};
    const fakeFetch=async (url,options) => {
      count++; const body=JSON.parse(options.body), system=body.messages[0].content;
      const begin=system.match(/<<<STEEP_TASK_[a-f0-9]+:BEGIN>>>/)?.[0];
      const end=begin?.replace(':BEGIN>>>',':END>>>');
      const content=expected==='add' || expected==='suggest' ? (expected==='suggest'?'Good plan.\n':'')+begin+'\n'+JSON.stringify({title:'Email Ada',due:'2026-11-13T09:00:00+01:00'})+'\n'+end : 'Hello!';
      return {ok:true,status:200,json:async()=>({choices:[{message:{content}}]})};
    };
    vm.runInNewContext(source('api/chat.js'),{module,require:imports,process:{env:{GROQ_API_KEY:'mock'}},Buffer,fetch:fakeFetch,AbortController,AbortSignal,setTimeout,clearTimeout,console});
    const res={setHeader(){},status(n){status=n;return this;},json(value){output=value;return value;}};
    await module.exports({method:'POST',headers:{},body:{messages:messages(text)}},res);
    equal(status,200); equal(count,['list','complete','delete'].includes(expected)?0:1);
    if (expected==='suggest') equal(output.taskSuggest.title,'Email Ada');
    else if (expected==='normal') equal(output.reply,'Hello!');
    else equal(output.taskIntent,expected);
  }
  console.log('PASS: '+checks+' assertions; '+fixtures.length+' intent fixtures; no live model calls.');
  await require('./round.test')();
  require('./doc-intent.test')();
  await require('./followup.test')();
  await require('./secretary.test')();
  await require('./fetch-page.test')();
  return checks;
}
module.exports=run;
if (require.main === module) run().catch(error=>{ console.error(error); process.exitCode=1; });
