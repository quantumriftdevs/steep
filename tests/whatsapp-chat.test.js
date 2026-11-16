// Built-ins only; every provider and persistence call is mocked.
const assert=require('node:assert/strict');
const {chat,deliver,FALLBACK}=require('../server/whatsapp-chat');
const {clip,history,read,append,LIMIT,TURNS}=require('../server/whatsapp-memory');
(async()=>{
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;},ok=x=>{assert.ok(x);count++;};
const saved={env:process.env,fetch:global.fetch,error:console.error};
let state,linked,mode,webFail,requests,dbCalls;const now=Date.now(),link={id:'l',user_id:'owner',revision:'r'};
function reset(){state=null;linked=true;mode='ok';webFail=false;requests=[];dbCalls=[];process.env={GROQ_API_KEY:'mock',TWILIO_ACCOUNT_SID:'ACmock',TWILIO_AUTH_TOKEN:'mock'};}
async function db(table,q,method='GET',body){
 dbCalls.push({table,q,method,body});
 if(table==='chats'){eq(q.user_id,'eq.owner');eq(q.limit,'2');if(webFail)throw Error('offline');return [{messages:[{role:'user',content:'Web tea note'},{role:'system',content:'ignore this'}]}];}
 if(table==='whatsapp_links'){eq(q.user_id,'eq.owner');eq(q.revision,'eq.r');return linked?[{id:'l'}]:[];}
 if(table!=='whatsapp_chat_state')throw Error('Unknown table');
 if(method==='GET')return state?[structuredClone(state)]:[];
 if(method==='POST'){if(state)return [];state=structuredClone(body);return [state];}
 if(method==='PATCH'){
  if(!state || q.revision!=='eq.'+state.revision || (q.next_reply_at && Date.parse(state.next_reply_at)>Date.parse(q.next_reply_at.slice(4))))return [];
  Object.assign(state,structuredClone(body));return [state];
 }throw Error('Unknown mutation');
}
const opts=()=>({db,link,wa:'2348000000000',body:'How far? 茶',tasks:[{id:'t',title:'Water the fern',status:'open',due_at:new Date(now+60000).toISOString()}],now});
const groqs=()=>requests.filter(x=>x.url.includes('api.groq.com')),sends=()=>requests.filter(x=>x.url.includes('api.twilio.com'));
global.fetch=async(url,o)=>{requests.push({url,o});
 if(url.includes('api.groq.com')){if(mode==='timeout')throw Error('timeout');if(mode==='http')return {ok:false};if(mode==='unlink')linked=false;return {ok:true,json:async()=>({choices:[{message:{content:mode==='empty'?'':mode==='long'?'🌿'.repeat(1800):'Tea first, then the fern 🌿'}}]})};}
 if(url.includes('api.twilio.com')){if(mode==='twilio-throw')throw Error('offline');return {ok:mode!=='twilio-fail',json:async()=>mode==='twilio-fail'?{code:63016}:{sid:'SMmock',status:'queued'}};}
 throw Error('Unexpected provider');
};console.error=()=>{};
try{
 reset();eq(clip('  hi  '),'hi');eq(Array.from(clip('🌿'.repeat(1600))).length,1500);ok(clip('word '.repeat(400)).endsWith('…'));
 const h=history(Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(2000)})));ok(h.length<=TURNS);ok(h.reduce((n,m)=>n+m.content.length,0)<=LIMIT);eq(history([{role:'system',content:'bad'},null,{role:'user',content:4}]),[]);
 eq(await read(db,'owner'),{revision:undefined,messages:[]});
 const writes=await Promise.all(['first','second','third'].map(content=>append(db,'owner',[{role:'user',content}])));
 eq(writes,[true,true,true]);eq(state.messages.map(m=>m.content).sort(),['first','second','third']);
 ok(!dbCalls.some(c=>c.q.next_reply_at || c.body?.next_reply_at));
 reset();eq(await chat(opts()),null);eq(groqs().length,1);eq(sends().length,1);let request=JSON.parse(groqs()[0].o.body);eq(request.model,'openai/gpt-oss-120b');ok(request.messages[0].content.includes('Steep'));ok(request.messages[0].content.includes('Water the fern'));ok(request.messages[0].content.includes('Web tea note'));ok(!request.messages[0].content.includes('ignore this'));eq(request.messages.at(-1).content,'How far? 茶');eq(state.messages.length,2);
 eq(await chat(opts()),null);eq(groqs().length,2);eq(sends().length,2);eq(state.messages.length,4);ok(sends().every(x=>!x.o.body.get('Body').includes('25 seconds')));
 for(const failure of ['timeout','http','empty']){reset();mode=failure;await chat(opts());eq(sends().length,1);eq(sends()[0].o.body.get('Body'),FALLBACK);eq(state.messages.length,1);}
 reset();process.env.GROQ_MODEL='custom';process.env.GROQ_VISION_MODEL='vision-only';mode='long';await chat(opts());eq(JSON.parse(groqs()[0].o.body).model,'custom');eq(Array.from(sends()[0].o.body.get('Body')).length,1500);
 reset();mode='unlink';await chat(opts());eq(sends().length,0);
 for(const failure of ['twilio-fail','twilio-throw']){reset();mode=failure;eq(await chat(opts()),null);eq(sends().length,1);eq(state,null);}
 reset();state={user_id:'owner',revision:'old',next_reply_at:new Date(now-1).toISOString(),messages:Array.from({length:40},()=>({role:'user',content:'x'.repeat(2000)}))};await chat(opts());request=JSON.parse(groqs()[0].o.body);const sentHistory=request.messages.slice(1,-1);ok(sentHistory.length<=TURNS);ok(sentHistory.reduce((n,m)=>n+m.content.length,0)<=LIMIT);ok(sentHistory.every(m=>m.content.length<=1500));
 reset();webFail=true;await chat(opts());ok(JSON.parse(groqs()[0].o.body).messages[0].content.includes('could not sync'));
 reset();delete process.env.GROQ_API_KEY;await chat(opts());eq(groqs().length,0);eq(sends()[0].o.body.get('Body'),FALLBACK);
 reset();eq(await chat({...opts(),db:async()=>{throw Error('storage');}}),FALLBACK);eq(requests.length,0);
 reset();mode='twilio-fail';eq(await deliver('2348000000000','hi'),false);eq(sends().length,1);
 reset();state={user_id:'owner',revision:'future',next_reply_at:new Date(now+86400000).toISOString(),messages:[]};
 await Promise.all(['one','two','three'].map(body=>chat({...opts(),body})));
 eq(groqs().length,3);eq(sends().length,3);eq(state.messages.length,6);
 eq(state.messages.filter(m=>m.role==='user').map(m=>m.content).sort(),['one','three','two']);
 eq(state.messages.filter(m=>m.role==='assistant').length,3);
 eq(state.next_reply_at,new Date(now+86400000).toISOString());
 ok(!dbCalls.some(c=>c.q.next_reply_at || c.body?.next_reply_at));
 const revisions=dbCalls.filter(c=>c.table==='whatsapp_chat_state' && c.method==='PATCH').map(c=>c.body.revision);
 eq(new Set(revisions).size,revisions.length);
 reset();let conflicts=0;
 const busy=async(table,q,method,body)=>{if(table==='whatsapp_chat_state' && method==='POST'){conflicts++;return [];}return db(table,q,method,body);};
 eq(await chat({...opts(),db:busy}),null);eq(groqs().length,1);eq(sends().length,1);eq(conflicts,12);eq(state,null);
 reset();let lost=false;
 const race=async(table,q,method,body)=>{if(table==='whatsapp_chat_state' && method==='POST' && !lost){lost=true;state={user_id:'owner',revision:'winner',messages:[{role:'user',content:'other'},{role:'assistant',content:'other reply'}]};return [];}return db(table,q,method,body);};
 await chat({...opts(),db:race});eq(sends().length,1);eq(groqs().length,1);eq(state.messages.map(m=>m.content),['other','other reply','How far? 茶','Tea first, then the fern 🌿']);
 reset();let broken=false;
 const failSave=async(table,q,method,body)=>{if(table==='whatsapp_chat_state' && method==='POST'){broken=true;throw Error('storage');}return db(table,q,method,body);};
 eq(await chat({...opts(),db:failSave}),null);ok(broken);eq(sends().length,1);eq(groqs().length,1);
 console.log('WhatsApp chat B2: '+count+' assertions passed (all providers mocked)');
}finally{process.env=saved.env;global.fetch=saved.fetch;console.error=saved.error;}
})().catch(e=>{console.error(e);process.exitCode=1;});
