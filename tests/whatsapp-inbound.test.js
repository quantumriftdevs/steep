// No live providers: every fetch is replaced and unknown routes throw.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHmac}=require('node:crypto');
const inbound=require('../api/whatsapp-inbound'),linkAPI=require('../api/whatsapp-link');
const {nextOccurrence,snoozeMinutes}=require('../server/whatsapp-tasks');
(async()=>{
let count=0; const eq=(a,b)=>{assert.deepEqual(a,b);count++;},ok=a=>{assert.ok(a);count++;};
const saved={env:process.env,fetch:global.fetch,now:Date.now};
const now=Date.parse('2026-11-16T12:00:00Z'),env={SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock',TWILIO_AUTH_TOKEN:'token',GROQ_API_KEY:'mock'};
let receipts,links,tasks,logs,classification,calls,clock,sid,fail,auth;
const task=(id='a',extra={})=>({id,user_id:'owner',title:'Tea & <rest>',status:'open',completed_at:null,due_at:new Date(now-60000).toISOString(),...extra});
function reset(){receipts=[];links=[{id:'link',user_id:'owner',wa_id:'2348000000000',status:'linked',link_code:'ABC12345',updated_at:new Date(now-60000).toISOString(),revision:'r1',seen_sids:[]}];tasks=[task()];logs=[];classification='OTHER';calls=[];clock=now;sid=0;fail=false;auth=true;process.env={...env};}
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
 if(opts.method==='PATCH'){const data=JSON.parse(opts.body);found.forEach(r=>Object.assign(r,data));return response(200,found);}
 if(u.searchParams.has('order')){const field=u.searchParams.get('order').split('.')[0],desc=u.searchParams.get('order').includes('.desc');found.sort((a,b)=>(String(a[field]||'z').localeCompare(String(b[field]||'z')))*(desc?-1:1));}
 const limit=Number(u.searchParams.get('limit')||found.length);return response(200,found.slice(0,limit));
};
function req(body,extra={}){
 const params={From:'whatsapp:+2348000000000',Body:body,MessageSid:'SM'+(++sid),ProfileName:'Mock',...extra.params};
 const r={method:'POST',url:'/api/whatsapp-inbound?x=a%20b',headers:{'x-forwarded-proto':'https','x-forwarded-host':'app.invalid'},body:params,...extra};delete r.params;
 const url='https://app.invalid'+(r.originalUrl||r.url);
 r.headers['x-twilio-signature']=createHmac('sha1',env.TWILIO_AUTH_TOKEN).update(url+Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('base64');
 return r;
}
async function invoke(handler,r){const res={statusCode:200,setHeader(k,v){this[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}};await handler(r,res);eq(res['Cache-Control'],'no-store');return res;}
async function send(text,extra){return invoke(inbound,req(text,extra));}
try{
reset();let r=await send('tasks');eq(r.statusCode,200);ok(r['Content-Type'].startsWith('text/xml'));ok(r.body.includes('&amp; &lt;rest&gt;'));ok(r.body.includes('(Lagos)'));
for(const signature of ['',undefined,'bad','a'.repeat(28)]){reset();const q=req('okay');q.headers['x-twilio-signature']=signature;r=await invoke(inbound,q);eq(r.statusCode,403);eq(calls.length,0);eq(tasks[0].status,'open');}
reset();let q=req('tasks');q.body.Body='tampered';eq((await invoke(inbound,q)).statusCode,403);
reset();q=req('tasks');q.body=new URLSearchParams(q.body).toString();eq((await invoke(inbound,q)).statusCode,200);
reset();q=req('tasks',{originalUrl:'/api/whatsapp-inbound?z=%2B&x=2'});eq((await invoke(inbound,q)).statusCode,200);
reset();q=req('tasks');delete q.headers['x-forwarded-host'];q.headers.host='app.invalid';eq((await invoke(inbound,q)).statusCode,200);
reset();q=req('tasks');q.method='GET';eq((await invoke(inbound,q)).statusCode,405);
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TWILIO_AUTH_TOKEN']){reset();delete process.env[name];r=await send('okay');eq(r.statusCode,503);ok(r.body.missing.includes(name));eq(calls.length,0);}
reset();links=[];r=await send('hello');ok(r.body.includes('Settings'));eq(tasks[0].status,'open');
reset();links=[];r=await send('link ABC12345');ok(r.body.includes('expired'));eq(links.length,0);
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
for(const answer of ['NO','OTHER','YES, done','throw','http']){reset();classification=answer;r=await send('oya');eq(tasks[0].status,'open');ok(r.body.includes('Full chat'));}
reset();delete process.env.GROQ_API_KEY;await send('oya');eq(tasks[0].status,'open');
reset();classification='YES';await send('yes but change this task to tomorrow instead please');eq(tasks[0].status,'open');eq(calls.filter(c=>c.url.includes('groq')).length,0);
for(const [text,minutes] of [['snooze 10',10],['snooze 30m',30],['SNOOZE 2h',120]]){reset();r=await send(text);eq(tasks[0].due_at,new Date(now+minutes*60000).toISOString());eq(tasks[0].status,'open');ok(r.body.includes('breathing room'));}
for(const text of ['snooze 0','snooze -1','snooze 2d','snooze abc','snooze 99999999999999999999'])eq(snoozeMinutes(text),null);
reset();tasks=[task('old',{due_at:new Date(now-120000).toISOString()}),task('new')];logs=[{task_id:'old',due_at:tasks[0].due_at,notified_at:'2026-11-16T11:00Z',status:'sent'},{task_id:'new',due_at:tasks[1].due_at,notified_at:'2026-11-16T11:59Z',status:'sent'}];await send('okay');eq(tasks[0].status,'open');eq(tasks[1].status,'done');
reset();tasks=[task('old',{due_at:new Date(now-120000).toISOString()}),task('new')];await send('okay');eq(tasks[0].status,'done');eq(tasks[1].status,'open');
reset();tasks=[task('future',{due_at:new Date(now+60000).toISOString()})];r=await send('okay');ok(r.body.includes('No due'));eq(tasks[0].status,'open');
reset();tasks=[];ok((await send('tasks')).body.includes('No open'));
reset();tasks=Array.from({length:7},(_,i)=>task(String(i),{title:'Task '+i}));r=await send('tasks');ok(r.body.includes('Task 4'));ok(!r.body.includes('Task 5'));
reset();r=await send('hello there');ok(r.body.includes('Full chat is coming'));eq(tasks[0].status,'open');
reset();q=req('okay');await invoke(inbound,q);tasks.push(task('b'));r=await invoke(inbound,q);ok(r.body.includes('already handled'));eq(tasks[1].status,'open');
const source=fs.readFileSync('js/tasks-data.js','utf8'),pure=source.slice(source.indexOf('export const validRecurrence'),source.indexOf('export const surfaceKey')).replaceAll('export ','');
const appNext=Function(pure+';return nextOccurrence;')();
for(const recurrence of ['daily','weekdays','weekly:1','weekly:7','biweekly','monthly','monthly:31'])for(const due of ['2024-01-31T09:00:00Z','2026-11-13T20:15:33.123Z']){
 eq(nextOccurrence(due,recurrence,now),appNext(due,recurrence,now));reset();tasks=[task('a',{due_at:due,recurrence})];r=await send('okay');eq(tasks[0].status,'open');eq(tasks[0].completed_at,null);eq(tasks[0].due_at,appNext(due,recurrence,now));ok(r.body.includes('Next:'));
}
reset();tasks=Array.from({length:160},(_,i)=>task('chunk-'+i));logs=[{task_id:'chunk-1',due_at:tasks[1].due_at,notified_at:'2026-11-16T11:00Z',status:'sent'},{task_id:'chunk-159',due_at:tasks[159].due_at,notified_at:'2026-11-16T11:59Z',status:'sent'}];await send('okay');eq(tasks[159].status,'done');eq(tasks[1].status,'open');eq(calls.filter(c=>c.url.includes('/notify_log?')).length,3);
reset();fail=true;r=await send('okay');eq(r.statusCode,503);eq(tasks[0].status,'open');
for(const p of ['api/whatsapp-inbound.js','api/whatsapp-link.js'])ok(!fs.readFileSync(p,'utf8').includes('api.twilio.com'));
const html=fs.readFileSync('app/settings.html','utf8');ok(html.includes('class="settings-group" aria-label="WhatsApp settings"'));ok(html.includes('id="whatsapp-panel"'));ok(fs.readFileSync('js/settings.js','utf8').includes("import './whatsapp-settings.js'"));
console.log('WhatsApp B1: '+count+' assertions passed (all providers mocked)');
}finally{process.env=saved.env;global.fetch=saved.fetch;Date.now=saved.now;}
})().catch(e=>{console.error(e);process.exitCode=1;});
