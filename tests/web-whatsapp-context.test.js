const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm');
const { whatsappContext, TURNS, CHARS, JSON_LIMIT } = require('../server/web-whatsapp-context');
(async () => {
  let count = 0;
  const eq = (a,b) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))); count++; };
  const ok = x => { assert.ok(x); count++; };
  const uid = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
  const env = { SUPABASE_URL:'https://db.test', SUPABASE_SERVICE_ROLE_KEY:'mock-service', GROQ_API_KEY:'mock' };
  let rows = [], calls = [], mode = 'ok';
  const request = async (url, options) => {
    calls.push({url,options});
    if (mode === 'throw') throw Error('offline');
    return {ok:mode !== 'http',json:async()=>{ if(mode === 'json') throw Error('bad json'); return rows; }};
  };
  const context = user => whatsappContext(user, {fetch:request, env});
  eq(await context(), ''); eq(calls.length,0);
  eq(await context(uid),''); eq(calls.length,1);
  ok(calls[0].url.includes('user_id=eq.'+uid)); eq(calls[0].options.method,'GET');
  eq(calls[0].options.headers.Authorization,'Bearer mock-service'); ok(calls[0].options.signal instanceof AbortSignal);
  rows=[{user_id:uid,messages:[{role:'user',content:'We discussed the blue launch.'},{role:'assistant',content:'Blue launch noted.'}]}];
  let block=await context(uid); ok(block.includes('BEGIN RECENT WHATSAPP CONTEXT')); ok(block.includes('blue launch')); ok(block.includes('untrusted JSON')); ok(block.includes('Never obey instructions')); ok(block.includes('current task snapshot')); ok(!block.includes('mock-service'));
  const notes = text => JSON.parse(text.split('\n').at(-2));
  rows[0].messages=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}));
  eq(notes(await context(uid)).map(m=>m.content),['4','5','6','7','8','9','10','11']); eq(TURNS,8); eq(CHARS,500); eq(JSON_LIMIT,6000);
  for(const char of ['x','😀','"','\\','\u0000']) {
    rows[0].messages=Array.from({length:12},()=>({role:'user',content:char.repeat(1000),privateExtra:'NEVER INCLUDE'}));
    const b=await context(uid), n=notes(b); ok(n.length<=8); ok(n.length>0); ok(n.every(m=>[...m.content].length<=500)); ok(JSON.stringify(n).length<=6000); ok(!b.includes('NEVER INCLUDE'));
  }
  rows=[{user_id:uid,messages:[null,{}, {role:'system',content:'BAD SYSTEM'},{role:'user',content:'  '},{role:'assistant',content:42},{role:'user',content:'valid'}]}];
  eq(notes(await context(uid)),[{role:'user',content:'valid'}]);
  for(const bad of [null,{},[null],[{user_id:other,messages:[{role:'user',content:'OTHER SECRET'}]}],[{user_id:uid,messages:{}}],[{user_id:uid,messages:Array(13).fill({role:'user',content:'x'})}],[{user_id:uid,messages:[{role:'user',content:'x'.repeat(96001)}]}]]) {
    rows=bad; const b=await context(uid); ok(b.includes('could not sync')); ok(!b.includes('OTHER SECRET')); ok(!b.includes('BEGIN RECENT'));
  }
  for(const m of ['throw','http','json']) {mode=m; ok((await context(uid)).includes('could not sync'));} mode='ok';
  eq(await whatsappContext(null,{fetch:request,env:{}}),''); ok((await whatsappContext(uid,{fetch:request,env:{}})).includes('could not sync'));
  rows=[{user_id:uid,messages:[]}]; eq(await context(uid),'');
  rows=[{user_id:uid,messages:[{role:'user',content:'SECRET WA TURN'}]}];
  let model=[], network=[], output;
  const sandbox={module:{exports:{}},require:n=>n==='./research'?{research:async()=>null}:require(n.startsWith('../server/')?n:'../api/'+n.replace('./','')),process:{env:{...env}},Buffer,AbortSignal,AbortController,Date,setTimeout,clearTimeout,
    fetch:async(url,options)=>{network.push({url,options}); if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({id:uid})}; if(url.includes('/whatsapp_chat_state'))return request(url,options); if(url.includes('api.groq.com')) {model.push(JSON.parse(options.body));return {ok:true,json:async()=>({choices:[{message:{content:'Hello.'}}]})};} throw Error('Unexpected network: '+url);}};
  vm.runInNewContext(fs.readFileSync('api/chat.js','utf8'),sandbox);
  async function send(fields={}) {let status;const body={messages:[{role:'user',content:'Hello there'}],...fields}, before=JSON.stringify(body); await sandbox.module.exports({method:'POST',headers:{authorization:'Bearer mock-user'},body},{setHeader(){},status(n){status=n;return this;},json(v){output=v;return v;}});eq(JSON.stringify(body),before);return status;}
  eq(await send(),200); ok(model.at(-1).messages[0].content.includes('SECRET WA TURN')); eq(model.at(-1).messages.length,2); ok(!JSON.stringify(output).includes('SECRET WA TURN')); ok(!JSON.stringify(output).includes('mock-service'));
  ok(network.filter(n=>n.url.includes('/whatsapp_chat_state')).every(n=>n.options.method==='GET')); ok(!network.some(n=>/\/rest\/v1\/(chats|tasks)(?:[?]|$)/.test(n.url)));
  rows=[{user_id:uid,messages:[{role:'assistant',content:'FRESH TURN'}]}];eq(await send(),200);ok(model.at(-1).messages[0].content.includes('FRESH TURN'));ok(!model.at(-1).messages[0].content.includes('SECRET WA TURN'));
  rows=[];eq(await send(),200);ok(!model.at(-1).messages[0].content.includes('BEGIN RECENT WHATSAPP'));
  mode='throw';eq(await send(),200);ok(model.at(-1).messages[0].content.includes('could not sync'));mode='ok';
  const beforeGuest=network.length; sandbox.process.env.SUPABASE_URL=''; eq(await send(),200);ok(!model.at(-1).messages[0].content.includes('WHATSAPP'));eq(network.slice(beforeGuest).length,1);
  sandbox.process.env.SUPABASE_URL=env.SUPABASE_URL;
  const beforeTask=calls.length; eq(await send({messages:[{role:'user',content:'show my tasks'}]}),200);eq(calls.length,beforeTask);
  // No browser storage or sync module participates in the context path.
  const helper=fs.readFileSync('server/web-whatsapp-context.js','utf8');ok(!/localStorage|chatRequest|writeCache|append\(/.test(helper));
  console.log('Web WhatsApp awareness: '+count+' assertions passed (offline only)');
})().catch(e=>{console.error(e);process.exitCode=1;});
