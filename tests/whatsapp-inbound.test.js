// No live providers: every fetch is replaced and unknown routes throw.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHmac}=require('node:crypto');
let chatCalls=[];require.cache[require.resolve('../server/whatsapp-chat')]={exports:{chat:async args=>{chatCalls.push(args);return 'Mock chat reply';}}};
const router=require('../api/whatsapp'); const inbound=(req,res)=>router(req,res),linkAPI=(req,res)=>router({...req,url:'/api/whatsapp-link'},res);
const {nextOccurrence,snoozeMinutes}=require('../server/whatsapp-tasks');
(async()=>{
let count=0; const eq=(a,b)=>{assert.deepEqual(a,b);count++;},ok=a=>{assert.ok(a);count++;};
const saved={env:process.env,fetch:global.fetch,now:Date.now};
const now=Date.parse('2026-11-16T12:00:00Z'),env={SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock',TWILIO_AUTH_TOKEN:'token',GROQ_API_KEY:'mock'};
let receipts,links,tasks,logs,classification,calls,clock,sid,fail,auth;
const task=(id='a',extra={})=>({id,user_id:'owner',title:'Tea & <rest>',status:'open',completed_at:null,due_at:new Date(now-60000).toISOString(),...extra});
function reset(){chatCalls=[];receipts=[];links=[{id:'link',user_id:'owner',wa_id:'2348000000000',status:'linked',link_code:'ABC12345',updated_at:new Date(now-60000).toISOString(),revision:'r1',seen_sids:[]}];tasks=[task()];logs=[];classification='OTHER';calls=[];clock=now;sid=0;fail=false;auth=true;process.env={...env};}
Date.now=()=>clock;
const response=(status,data)=>({ok:status<300,status,json:async()=>structuredClone(data)});
function matches(row,p){return [...p].every(([k,v])=>{
 if(['select','order','limit','offset','on_conflict'].includes(k)) return true;
 if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
 if(v.startsWith('gt.'))return Date.parse(row[k])>Date.parse(v.slice(3));
 if(v.startsWith('in.'))return v.slice(4,-1).split(',').includes(row[k]);
 throw Error('Unmocked filter '+k+' '+v);
});}
global.fetch=async(url,opts={})=>{
 const u=new URL(url);calls.push({url,opts});
 if(u.hostname==='api.groq.com'){if(classification==='throw')throw Error('mock');if(classification==='http')return response(500,{});return response(200,{choices:[{message:{content:classification}}]});}
 eq(u.hostname,'mock.invalid');
 if(fail)throw Error('mock outage');
 if(u.pathname==='/auth/v1/user')return response(auth?200:401,auth?{id:'owner'}:{});
 const table=u.pathname.split('/').at(-1),rows={whatsapp_links:links,tasks,notify_log:logs,whatsapp_inbound_log:receipts}[table];
 if(!rows)throw Error('Unexpected provider');
 let found=rows.filter(r=>matches(r,u.searchParams));
 if(opts.method==='POST'){const data=JSON.parse(opts.body);if(table==='whatsapp_inbound_log'){if(receipts.some(r=>r.message_sid===data.message_sid))return response(201,[]);receipts.push(data);return response(201,[data]);}if(rows.some(r=>r.user_id===data.user_id))return response(409,{});const row={id:'new',...data};rows.push(row);return response(201,[row]);}
 if(opts.method==='DELETE'){found.forEach(row=>rows.splice(rows.indexOf(row),1));return response(200,found);}
 if(opts.method==='PATCH'){const data=JSON.parse(opts.body);found.forEach(r=>Object.assign(r,data));return response(200,found);}
 if(u.searchParams.has('order')){const field=u.searchParams.get('order').split('.')[0],desc=u.searchParams.get('order').includes('.desc');found.sort((a,b)=>(String(a[field]||'z').localeCompare(String(b[field]||'z')))*(desc?-1:1));}
 const limit=Number(u.searchParams.get('limit')||found.length);return response(200,found.slice(0,limit));
};
function req(body,extra={}){
 const params={From:'whatsapp:+2348000000000',Body:body,MessageSid:'SM'+(++sid),ProfileName:'Mock',...extra.params};
 const r={method:'POST',url:'/api/whatsapp-inbound?x=a%20b',headers:{'x-forwarded-proto':'https','x-forwarded-host':'steep-app-three.vercel.app'},body:params,...extra};delete r.params;
 const url='https://steep-app-three.vercel.app'+(r.originalUrl||r.url);
 r.headers['x-twilio-signature']=createHmac('sha1',env.TWILIO_AUTH_TOKEN).update(url+Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('base64');
 return r;
}
async function invoke(handler,r){const res={statusCode:200,setHeader(k,v){this[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}};await handler(r,res);eq(res['Cache-Control'],'no-store');return res;}
async function send(text,extra){return invoke(inbound,req(text,extra));}
try{
reset();let r=await send('tasks');eq(chatCalls.length,0);eq(r.statusCode,200);ok(r['Content-Type'].startsWith('text/xml'));ok(r.body.includes('&amp; &lt;rest&gt;'));ok(r.body.includes('(Lagos)'));
for(const signature of ['',undefined,'bad','a'.repeat(28)]){reset();const q=req('okay');q.headers['x-twilio-signature']=signature;r=await invoke(inbound,q);eq(r.statusCode,403);eq(calls.length,0);eq(tasks[0].status,'open');}
reset();let q=req('tasks');q.body.Body='tampered';eq((await invoke(inbound,q)).statusCode,403);
reset();q=req('tasks');q.body=new URLSearchParams(q.body).toString();eq((await invoke(inbound,q)).statusCode,200);
reset();q=req('tasks',{originalUrl:'/api/whatsapp-inbound?z=%2B&x=2'});eq((await invoke(inbound,q)).statusCode,200);
reset();q=req('tasks');delete q.headers['x-forwarded-host'];q.headers.host='steep-app-three.vercel.app';eq((await invoke(inbound,q)).statusCode,200);
reset();q=req('tasks');q.method='GET';eq((await invoke(inbound,q)).statusCode,405);
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TWILIO_AUTH_TOKEN']){reset();delete process.env[name];r=await send('okay');eq(r.statusCode,503);ok(r.body.missing.includes(name));eq(calls.length,0);}
reset();links=[];r=await send('hello');ok(r.body.includes('Settings'));eq(tasks[0].status,'open');
reset();links=[];r=await send('link ABC12345');ok(r.body.includes('expired'));eq(links.length,0);
// Bare hex is deliberate: everyday replies must not consume a link-code attempt.
for(const text of ['ABC12345','abc12345','  aBc12345  ','link ABC12345','LiNk abc12345 please']) {
  reset();Object.assign(links[0],{status:'pending',wa_id:null,expires_at:new Date(now+900000).toISOString()});
  r=await send(text);ok(r.body.includes('You’re linked to Steep'));eq(links[0].status,'linked');eq(links[0].wa_id,'2348000000000');
  ok(calls.some(c=>c.opts.method==='PATCH' && c.url.includes('link_code=eq.ABC12345')));
}
for(const text of ['DEADBEEF','deadbeef']) {
  reset();links=[];r=await send(text);ok(r.body.includes('expired or was already used'));eq(links.length,0);
  ok(calls.some(c=>c.opts.method==='PATCH' && c.url.includes('link_code=eq.DEADBEEF')));
}
for(const text of ['snooze','thanks','okay','hello','ABC123','ABC123456','ABC12345 please','ZZZZZZZZ']) {
  reset();links=[];r=await send(text);ok(r.body.includes('tap Link WhatsApp, then tap Send in WhatsApp. 🌿'));
  ok(!r.body.includes('expired'));ok(!calls.some(c=>c.opts.method==='PATCH' && c.url.includes('link_code=')));
}
for(const text of ['ABC12345','abc12345','link ABC12345']) {
  reset();r=await send(text);eq(links[0].status,'linked');eq(tasks[0].status,'open');
  ok(!calls.some(c=>c.opts.method==='PATCH' && c.url.includes('link_code=')));
}
const authReq={method:'POST',headers:{authorization:'Bearer mock'}};
reset();links=[];r=await invoke(linkAPI,authReq);eq(r.statusCode,200);ok(/^[A-F0-9]{8}$/.test(r.body.code));eq(Date.parse(r.body.expires_at)-clock,900000);eq(r.body.sandbox,'+1 415 523 8886');const code=r.body.code;
r=await send('LiNk '+code.toLowerCase()+' please');ok(r.body.includes('linked'));eq(links[0].wa_id,'2348000000000');eq(links[0].status,'linked');
r=await invoke(linkAPI,{method:'GET',headers:authReq.headers});eq(r.body.status,'linked');
r=await send('link '+code,{params:{From:'whatsapp:+2348111111111'}});ok(r.body.includes('expired'));
reset();links[0].status='pending';links[0].wa_id=null;links[0].expires_at=new Date(now).toISOString();r=await send('link ABC12345');ok(r.body.includes('expired'));eq(links[0].status,'pending');
reset();links[0].status='pending';links[0].wa_id=null;links[0].updated_at=new Date(now-1000).toISOString();eq((await invoke(linkAPI,authReq)).statusCode,429);clock+=30001;r=await invoke(linkAPI,authReq);eq(r.statusCode,200);ok(r.body.code!=='ABC12345');
reset();eq((await invoke(linkAPI,{method:'POST',headers:{}})).statusCode,401);eq(calls.length,0);
reset();auth=false;eq((await invoke(linkAPI,authReq)).statusCode,401);
for(const word of ['yes','yeah','Yup','yep','yh','correct','exactly','affirmative','sure','sure thing','ok','okay','okey','do it','go ahead','please do',' YES! ']){reset();r=await send(word);eq(tasks[0].status,'done');eq(tasks[0].completed_at,new Date(now).toISOString());ok(r.body.includes('Done'));eq(calls.filter(c=>c.url.includes('groq')).length,0);}
for(const word of ['done','yes o','no wahala','do am','abeg do','oya','sí','oui','да','はい','sure thang']){reset();classification='YES';await send(word);eq(tasks[0].status,'done');eq(calls.filter(c=>c.url.includes('groq')).length,1);}
for(const answer of ['NO','OTHER','YES, done','throw','http']){reset();classification=answer;r=await send('oya');eq(tasks[0].status,'open');ok(r.body.includes('Mock chat reply'));}
reset();delete process.env.GROQ_API_KEY;await send('oya');eq(tasks[0].status,'open');
reset();classification='YES';await send('yes but change this task to tomorrow instead please');eq(tasks[0].status,'open');eq(calls.filter(c=>c.url.includes('groq')).length,0);
for(const [text,minutes] of [['snooze 10',10],['snooze 30m',30],['SNOOZE 2h',120]]){reset();r=await send(text);eq(tasks[0].due_at,new Date(now+minutes*60000).toISOString());eq(tasks[0].status,'open');ok(r.body.includes('breathing room'));}
for(const text of ['snooze 0','snooze -1','snooze 2d','snooze abc','snooze 99999999999999999999'])eq(snoozeMinutes(text),null);
reset();tasks=[task('old',{due_at:new Date(now-120000).toISOString()}),task('new')];logs=[{task_id:'old',due_at:tasks[0].due_at,notified_at:'2026-11-16T11:00Z',status:'sent'},{task_id:'new',due_at:tasks[1].due_at,notified_at:'2026-11-16T11:59Z',status:'sent'}];await send('okay');eq(tasks[0].status,'open');eq(tasks[1].status,'done');
reset();tasks=[task('old',{due_at:new Date(now-120000).toISOString()}),task('new')];await send('okay');eq(tasks[0].status,'done');eq(tasks[1].status,'open');
reset();tasks=[task('future',{due_at:new Date(now+60000).toISOString()})];r=await send('okay');ok(r.body.includes('No due'));eq(tasks[0].status,'open');
reset();tasks=[];ok((await send('tasks')).body.includes('No open'));
reset();tasks=Array.from({length:7},(_,i)=>task(String(i),{title:'Task '+i}));r=await send('tasks');ok(r.body.includes('Task 4'));ok(!r.body.includes('Task 5'));
reset();r=await send('hello there');eq(chatCalls.length,1);eq(chatCalls[0].body,'hello there');ok(r.body.includes('Mock chat reply'));eq(tasks[0].status,'open');
reset();q=req('okay');await invoke(inbound,q);tasks.push(task('b'));r=await invoke(inbound,q);ok(r.body.includes('already handled'));eq(tasks[1].status,'open');
const source=fs.readFileSync('js/tasks-data.js','utf8'),pure=source.slice(source.indexOf('export const validRecurrence'),source.indexOf('export const surfaceKey')).replaceAll('export ','');
const appNext=Function(pure+';return nextOccurrence;')();
for(const recurrence of ['daily','weekdays','weekly:1','weekly:7','biweekly','monthly','monthly:31'])for(const due of ['2024-01-31T09:00:00Z','2026-11-13T20:15:33.123Z']){
 eq(nextOccurrence(due,recurrence,now),appNext(due,recurrence,now));reset();tasks=[task('a',{due_at:due,recurrence})];r=await send('okay');eq(tasks[0].status,'open');eq(tasks[0].completed_at,null);eq(tasks[0].due_at,appNext(due,recurrence,now));ok(r.body.includes('Next:'));
}
reset();tasks=Array.from({length:160},(_,i)=>task('chunk-'+i));logs=[{task_id:'chunk-1',due_at:tasks[1].due_at,notified_at:'2026-11-16T11:00Z',status:'sent'},{task_id:'chunk-159',due_at:tasks[159].due_at,notified_at:'2026-11-16T11:59Z',status:'sent'}];await send('okay');eq(tasks[159].status,'done');eq(tasks[1].status,'open');eq(calls.filter(c=>c.url.includes('/notify_log?')).length,3);
reset();fail=true;r=await send('okay');eq(r.statusCode,503);eq(tasks[0].status,'open');
for(const p of ['server/whatsapp-inbound.js','server/whatsapp-link.js'])ok(!fs.readFileSync(p,'utf8').includes('api.twilio.com'));
const html=fs.readFileSync('app/settings.html','utf8');ok(html.includes('class="settings-group" aria-label="WhatsApp settings"'));ok(html.includes('id="whatsapp-panel"'));ok(fs.readFileSync('js/settings.js','utf8').includes("import './whatsapp-settings.js'"));
// Rewrites and router paths: all providers remain mocked.
const rewrites=JSON.parse(fs.readFileSync('vercel.json','utf8')).rewrites;
for(const name of ['inbound','link']) eq(rewrites.find(v=>v.source==='/api/whatsapp-'+name).destination,'/api/whatsapp?__steep_wa='+name);
eq(fs.readdirSync('api').filter(p=>p.endsWith('.js')).length,12);
for(const query of ['', '?x=a%20b', '?z=%2B&x=2', '?x=1&x=2']) {
  reset(); const original='/api/whatsapp-inbound'+query;
  const q=req('tasks',{url:original});
  q.url='/api/whatsapp?__steep_wa=inbound'+(query?'&'+query.slice(1):'');
  const r=await invoke(router,q); eq(r.statusCode,200); eq(q.originalUrl,original);
}
reset(); let routed=req('tasks'); routed.originalUrl=routed.url;
routed.url='/api/whatsapp?__steep_wa=link';
eq((await invoke(router,routed)).statusCode,200);
reset(); routed=req('tasks'); routed.url='/api/whatsapp?__steep_wa=inbound&x=a%20b'; routed.body.Body='tampered';
eq((await invoke(router,routed)).statusCode,403); eq(calls.length,0);
for(const route of ['inbound','link']) {
  reset(); eq((await invoke(router,{method:'DELETE',url:'/api/whatsapp?__steep_wa='+route,headers:{}})).statusCode,405); eq(calls.length,0);
}
reset(); eq((await invoke(router,{method:'GET',url:'/api/whatsapp?__steep_wa=link',headers:{}})).statusCode,401); eq(calls.length,0);
for(const url of ['/api/whatsapp','/api/whatsapp?__steep_wa=nope','/api/other']) {
  reset(); eq((await invoke(router,{method:'POST',url,headers:{}})).statusCode,404); eq(calls.length,0);
}
// Exercise the real inbound handler with urlencoded bodies after either rewrite shape.
for (const query of ['', 'z=%2B&x=a%20b&x=a+b', 'b=%2f&a=%2F&empty=', 'z=2&a=1']) {
  const original='/api/whatsapp-inbound'+(query?'?'+query:'');
  for (const path of ['/api/whatsapp','/api/whatsapp-inbound']) {
    for (const atEnd of [false,true]) {
      reset(); const q=req('tasks',{url:original});
      q.url=path+'?'+(atEnd?(query?query+'&':'')+'__steep_wa=inbound':'__steep_wa=inbound'+(query?'&'+query:''));
      q.body=new URLSearchParams(q.body).toString();
      eq((await invoke(router,q)).statusCode,200); eq(q.originalUrl,original);
      q.headers['x-twilio-signature']='bad';
      eq((await invoke(router,q)).statusCode,403);
    }
  }
}
reset();
const unlinkReq={method:'POST',headers:{authorization:'Bearer mock'},body:{action:'unlink'}};
r=await invoke(linkAPI,{...unlinkReq,headers:{}});eq(r.statusCode,401);eq(links.length,1);
r=await invoke(linkAPI,unlinkReq);eq(r.statusCode,200);eq(r.body.status,'unlinked');eq(links.length,0);
r=await send('hello');ok(!r.body.includes('Mock chat reply'));eq(chatCalls.length,0);
r=await send('ABC12345');eq(links.length,0);eq(chatCalls.length,0);
r=await invoke(linkAPI,unlinkReq);eq(r.body.status,'unlinked');
r=await invoke(linkAPI,{method:'POST',headers:{authorization:'Bearer mock'}});eq(r.body.status,'pending');const freshCode=r.body.code;ok(/^[A-F0-9]{8}$/.test(freshCode));
r=await send('link '+freshCode);eq(links[0].status,'linked');eq(links[0].wa_id,'2348000000000');eq(chatCalls.length,0);
r=await send('How far today?');eq(chatCalls.length,1);ok(r.body.includes('Mock chat reply'));
r=await invoke(linkAPI,unlinkReq);eq(links.length,0);
r=await invoke(linkAPI,{method:'POST',headers:{authorization:'Bearer mock'}});eq(links[0].status,'pending');await invoke(linkAPI,unlinkReq);eq(links.length,0);
reset();r=await send('photo',{params:{NumMedia:'1'}});eq(chatCalls.length,0);ok(r.body.includes('not supported'));

// Creation lives only beyond the existing command, signature and linking gates.
for(const text of ['okay','done','tasks','snooze 10','snooze 2h']){reset();if(text==='done')classification='YES';await send(text);eq(chatCalls.length,0);ok(!calls.some(c=>c.opts.method==='POST' && c.url.includes('/tasks?')));}
for(const status of ['pending','unlinked']){reset();links[0].status=status;await send('remind me to call mom tomorrow 6pm');eq(chatCalls.length,0);ok(!calls.some(c=>c.opts.method==='POST' && c.url.includes('/tasks?')));}
reset();links=[];await send('remind me to call mom tomorrow 6pm');eq(chatCalls.length,0);
reset();await send('remind me to call mom tomorrow 6pm');eq(chatCalls.length,1);eq(chatCalls[0].link.user_id,'owner');eq(chatCalls[0].body,'remind me to call mom tomorrow 6pm');

// Editing/deleting remains in free chat, after all existing commands.
for(const text of ['move call mom to Friday 4pm','change call mom to 7pm','rename call mom to call mum','delete the call mom task','cancel my reminder to call mom','make watering the plants weekly instead of daily','abeg shift call mom go Friday by 4']){
 reset();classification='OTHER';const before=structuredClone(tasks);await send(text);eq(chatCalls.length,1);eq(chatCalls[0].body,text);eq(tasks,before);
}
for(const text of ['okay','tasks','snooze 10']){reset();classification='YES';await send(text);eq(chatCalls.length,0);}
for(const text of ['delete the call mom task','rename call mom to call mum']){reset();links=[];await send(text);eq(chatCalls.length,0);eq(tasks.length,1);ok(!calls.some(c=>c.opts.method==='DELETE'));}

for(const status of ['pending','unlinked']){reset();links[0].status=status;await send('delete the call mom task');eq(chatCalls.length,0);eq(tasks.length,1);ok(!calls.some(c=>c.opts.method==='DELETE'));}
console.log('WhatsApp B2: '+count+' assertions passed (all providers mocked)');
}finally{process.env=saved.env;global.fetch=saved.fetch;Date.now=saved.now;}
})().catch(e=>{console.error(e);process.exitCode=1;});
