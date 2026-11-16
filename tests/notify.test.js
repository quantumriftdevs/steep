// Built-ins only. Every fetch is mocked; never contact a live provider.
const assert=require('node:assert/strict');
const notify=require('../api/notify');
async function run() {
  let checks=0;
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const original={env:process.env,fetch:global.fetch,now:Date.now,error:console.error};
  const now=Date.parse('2026-11-15T23:00:00+01:00');
  const env={NOTIFY_SECRET:'test-secret',SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock-key',NOTIFY_USER_EMAIL:'owner@example.invalid',TWILIO_ACCOUNT_SID:'ACmock',TWILIO_AUTH_TOKEN:'mock-token',WHATSAPP_TO:'+2348000000000'};
  const task=(id,due=now,extra={})=>({id,user_id:'owner-id',title:'Make tea',status:'open',completed_at:null,due_at:new Date(due).toISOString(),...extra});
  let tasks,log,calls,mode,failDB,failStage,clock=now;
  function reset(rows=[task('a')]) {clock=now;tasks=rows; log=new Map(); calls=[];mode='ok';failDB=false;failStage='';process.env={...env};}
  const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
  global.fetch=async(url,opts={})=>{
    calls.push({url,opts});
    const u=new URL(url),p=u.searchParams;
    if(u.hostname==='api.twilio.com') {
      eq(opts.method,'POST'); eq(opts.body.get('From'),'whatsapp:+14155238886'); eq(opts.body.get('To'),'whatsapp:+2348000000000');
      eq(opts.headers.Authorization,'Basic '+Buffer.from('ACmock:mock-token').toString('base64'));
      eq(opts.body.get('Body').includes('(Lagos)'),true);
      if(mode==='first-fails') {mode='ok';throw {code:20003};}
      if(mode==='throw-null') throw null;
      if(mode==='throw-string') throw 'unexpected';
      if(mode==='throw-getter') throw {get code(){throw Error('getter');}};
      if(mode==='throw-code') throw {code:63016};
      if(mode==='null-json') return response(201,null);
      if(mode==='missing-sid') return response(201,{});
      if(mode==='timeout') throw Error('timeout');
      if(mode==='invalid-json') return {ok:true,status:201,json:async()=>{throw Error('bad JSON');}};
      if(mode!=='ok') return response(400,{code:Number(mode),message:'Private provider details must not leak'});
      return response(201,{sid:'SMmock',status:'queued'});
    }
    if(u.hostname!=='mock.invalid') throw Error('Unexpected live fetch blocked: '+u.hostname);
    if(failDB) return response(500,{});
    if(u.pathname==='/auth/v1/admin/users') return response(200,{users:[{id:'owner-id',email:env.NOTIFY_USER_EMAIL}]});
    if(u.pathname==='/rest/v1/tasks') {
      eq(p.get('user_id'),'eq.owner-id');
      let found=tasks.filter(t=>t.user_id==='owner-id');
      if(p.has('id') && failStage==='fresh') {failStage='';throw null;}
      if(p.has('id')) found=found.filter(t=>'eq.'+t.id===p.get('id') && 'eq.'+t.due_at===p.get('due_at'));
      else found=found.slice(Number(p.get('offset')),Number(p.get('offset'))+500);
      return response(200,found);
    }
    if(u.pathname==='/rest/v1/notify_log') {
      const data=JSON.parse(opts.body),key=opts.method==='POST'?data.task_id+'|'+data.due_at:p.get('task_id').slice(3)+'|'+p.get('due_at').slice(3);
      if(opts.method==='POST') {if(log.has(key))return response(201,[]);log.set(key,{...data});return response(201,[data]);}
      if(opts.method==='PATCH' && (failStage===data.status || failStage==='every-patch')) {if(failStage!=='every-patch') failStage='';throw {code:99999};}
      const old=log.get(key);
      if(!old || (p.has('status') && 'eq.'+old.status!==p.get('status'))) return response(200,[]);
      Object.assign(old,data);return response(200,[old]);
    }
    throw Error('Unexpected mock route: '+u.pathname);
  };
  Date.now=()=>clock;console.error=()=>{};
  async function invoke(req={method:'GET',headers:{'x-notify-secret':'test-secret'}}) {
    const res={statusCode:200,setHeader(k,v){this[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
    await notify(req,res);eq(res['Cache-Control'],'no-store');return res;
  }
  const twilio=()=>calls.filter(c=>c.url.startsWith('https://api.twilio.com'));
  try {
    reset();for(const req of [{method:'GET',headers:{}},{method:'GET',query:{secret:'wrong'}},{method:'GET',query:{secret:['test-secret']}}]) {eq((await invoke(req)).statusCode,401);eq(calls.length,0);}
    delete process.env.NOTIFY_SECRET;eq((await invoke()).statusCode,401);eq(calls.length,0);
    reset();eq((await invoke({method:'DELETE',headers:{'x-notify-secret':'test-secret'}})).statusCode,405);eq(calls.length,0);
    for(const name of Object.keys(env).filter(k=>k!=='NOTIFY_SECRET')) {reset();delete process.env[name];const r=await invoke();eq(r.statusCode,503);eq(r.body.missing,[name]);eq(calls.length,0);}
    reset();process.env.WHATSAPP_TO='bad';eq((await invoke()).statusCode,503);eq(calls.length,0);
    reset([task('now'),task('old',now-86400000),task('future',now+1),task('done',now,{status:'done'}),task('completed',now,{completed_at:new Date(now).toISOString()}),task('tomb',now,{tombstone:true}),task('deleted',now,{deleted_at:new Date(now).toISOString()}),task('null',now,{due_at:null}),task('invalid',now,{due_at:'bad'}),task('other',now,{user_id:'another-id'})]);
    eq((await invoke()).body.accepted,2);eq(twilio().length,2);eq([...log.keys()].map(k=>k.split('|')[0]),['old','now']);eq((await invoke()).body.accepted,0);eq(twilio().length,2);
    reset();eq((await invoke({method:'GET',query:{secret:'test-secret'}})).body.accepted,1);eq([...log.values()][0].status,'sent');eq(typeof [...log.values()][0].notified_at,'string');
    // Exactly the roll shape in tasks-data: same ID, next due, open, completed_at=null.
    tasks=[task('a',now+86400000,{recurrence:'daily'})];eq((await invoke()).body.accepted,0);
    clock=now+86400000;tasks=[task('a',clock,{recurrence:'daily'})];eq((await invoke()).body.accepted,1);eq(log.size,2);
    reset(Array.from({length:7},(_,i)=>task(String(i),now-i*1000)));eq((await invoke()).body.accepted,3);eq((await invoke()).body.accepted,3);eq((await invoke()).body.accepted,1);eq(twilio().length,7);
    for(const code of [63016,63015,21608,20003,99999]) {reset();mode=String(code);const r=await invoke();eq(r.statusCode,200);eq(r.body.errors[0].code,code);eq([...log.values()][0].status,'failed');eq([...log.values()][0].notified_at,undefined);mode='ok';eq((await invoke()).body.accepted,1);eq(twilio().length,2);}
    for(const failure of ['timeout','invalid-json','throw-null','throw-string','throw-getter','throw-code','null-json','missing-sid']) {
      reset();mode=failure;const r=await invoke();eq(r.statusCode,200);
      eq([r.body.claimed,r.body.sent,r.body.failed],[1,0,1]);
      eq([...log.values()][0].status,'failed');
      eq([...log.values()][0].error_code,failure==='throw-code'?63016:null);
      mode='ok';eq((await invoke()).body.accepted,1);eq(twilio().length,2);
    }
    reset([task('a'),task('b')]);mode='first-fails';
    {const r=await invoke();eq(r.statusCode,200);eq([r.body.claimed,r.body.sent,r.body.failed],[2,1,1]);eq([...log.values()].map(x=>x.status),['failed','sent']);eq([...log.values()][0].error_code,20003);eq(twilio().length,2);}
    reset([task('a'),task('b'),task('c'),task('d')]);mode='throw-null';
    {const r=await invoke();eq(r.statusCode,200);eq([r.body.claimed,r.body.sent,r.body.failed,r.body.attempts],[3,0,3,3]);eq([...log.values()].map(x=>x.status),['failed','failed','failed']);eq(twilio().length,3);}
    for(const stage of ['fresh','sent','failed','every-patch']) {
      reset([task('a'),task('b')]);failStage=stage;
      if(stage==='failed' || stage==='every-patch') mode='first-fails';
      const r=await invoke();eq(r.statusCode,200);eq(r.body.claimed,2);
      if(stage==='every-patch') {eq(r.body.failed,2);eq(r.body.sent,0);}
      else {eq(r.body.failed,1);eq(r.body.sent,1);eq([...log.values()][1].status,'sent');}
    }
    reset();await Promise.all([invoke(),invoke()]);eq(twilio().length,1);
    reset();failDB=true;eq((await invoke()).statusCode,503);eq(twilio().length,0);
    // Lagos midnight is 23:00 UTC: absolute timestamp comparison has no host-TZ dependency.
    eq(notify.dueTasks([task('exact',Date.parse('2026-11-16T00:00:00+01:00')),task('past',Date.parse('2026-11-15T23:59:59+01:00')),task('future',Date.parse('2026-11-16T00:00:01+01:00'))],Date.parse('2026-11-15T23:00:00Z')).map(t=>t.id),['past','exact']);
    eq(notify.dueTasks([task('b'),task('a')],now).map(t=>t.id),['a','b']);
    console.log('Notify tests: '+checks+' assertions passed (mocked fetch only)');return checks;
  } finally {process.env=original.env;global.fetch=original.fetch;Date.now=original.now;console.error=original.error;}
}
module.exports=run;
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});

