const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
(async()=>{
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;},ok=x=>{assert.ok(x);count++;};
const source=fs.readFileSync('js/whatsapp-settings.js','utf8').replace(/^import[^;]+;/,'');
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(cache=null,linked=false) {
 let now=1800000000000,user='owner',auth,click,unClick,confirm=true;const calls=[],nav=[],store=new Map(),queue=[];
 if(cache) store.set('steep:whatsapp-link:owner',JSON.stringify({code:'ABC12345',expires_at:new Date(now+cache.life).toISOString(),created_at:now-cache.age}));
 const unlink={addEventListener:(name,fn)=>{eq(name,'click');unClick=fn;}},button={addEventListener:(name,fn)=>{eq(name,'click');click=fn;}},status={};
 class Clock extends Date {static now(){return now;}}
 const ctx={Date:Clock,JSON,encodeURIComponent,document:{getElementById:id=>id==='whatsapp-link'?button:id==='whatsapp-unlink'?unlink:status},
 getSession:()=>user?{user:{id:user}}:null,authHeaders:async()=>({Authorization:'Bearer mock'}),onAuthChange:fn=>{auth=fn;},
 sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 window:{confirm:()=>confirm,location:{assign:url=>nav.push(url)}},fetch:async(url,opts)=>{
  eq(url,'/api/whatsapp-link');if(opts.body){eq(JSON.parse(opts.body).action,'unlink');eq(opts.headers.Authorization,'Bearer mock');eq(opts.headers['Content-Type'],'application/json');}calls.push(opts.method||'GET');
  const r=queue.shift();if(!r)throw Error('Unexpected fetch');return {ok:r.status<300,status:r.status,json:async()=>r.body};
 }};
 vm.runInNewContext(source,ctx);const response=(body,status=200)=>queue.push({body,status});
 response({status:linked?'linked':'unlinked'});auth({user:{id:user}});await tick();
 return {unlink,unClick:async()=>{await unClick();await tick();},confirm:v=>confirm=v,button,status,calls,nav,store,response,click:async()=>{await click();await tick();},advance:ms=>now+=ms,signout:()=>{user=null;auth(null);}};
}
const unlinked={status:'unlinked'};
const pending={status:'pending',code:'ABC12345',expires_at:new Date(1800000900000).toISOString()};
let x=await setup();eq(x.button.hidden,false);ok(x.status.textContent.includes('Tap Send when WhatsApp opens.'));ok(x.status.textContent.includes('join repeat-hidden'));ok(x.status.textContent.includes('72 hours'));
x.response(unlinked);x.response(pending);await x.click();eq(x.calls.join(','),'GET,GET,POST');eq(x.nav[0],'https://wa.me/14155238886?text=ABC12345');ok(x.status.textContent.includes('Manual fallback: send ABC12345 to +1 415 523 8886'));eq(x.button.disabled,false);
x.response(unlinked);await x.click();eq(x.calls.join(','),'GET,GET,POST,GET');eq(x.nav.length,2);
x=await setup({life:119000,age:31000});x.response(unlinked);x.response(pending);await x.click();eq(x.calls.at(-1),'POST');eq(x.nav.length,1);
x=await setup({life:119000,age:1000});x.response(unlinked);await x.click();eq(x.calls.join(','),'GET,GET');eq(x.nav.length,1);
x=await setup({life:119000,age:31000});x.response(unlinked);x.response({error:'throttled'},429);await x.click();eq(x.nav.length,1);
x=await setup({life:-1,age:31000});x.response(unlinked);x.response({error:'Please wait 30 seconds'},429);await x.click();eq(x.nav.length,0);ok(x.status.textContent.includes('Please wait'));eq(x.button.disabled,false);
x=await setup(null,true);eq(x.button.hidden,true);eq(x.status.textContent,'WhatsApp is linked 🌿');eq(x.nav.length,0);
x=await setup();x.response(unlinked);x.response({status:'linked'});await x.click();eq(x.button.hidden,true);eq(x.nav.length,0);
x=await setup({life:900000,age:31000});x.response({error:'Offline'},503);await x.click();eq(x.nav.length,0);ok(x.status.textContent.includes('Manual fallback'));x.signout();eq(x.store.size,0);eq(x.status.textContent,'');
x=await setup({life:900000,age:31000},true);eq(x.unlink.hidden,false);x.confirm(false);await x.unClick();eq(x.calls.length,1);x.confirm(true);x.response({error:'Offline'},503);await x.unClick();ok(x.status.textContent.includes('Offline'));eq(x.unlink.hidden,false);x.response(unlinked);await x.unClick();eq(x.store.size,0);eq(x.button.hidden,false);eq(x.unlink.hidden,true);eq(x.unlink.disabled,false);x.response(unlinked);x.response(pending);await x.click();eq(x.nav.length,1);x.signout();eq(x.unlink.hidden,true);
const html=fs.readFileSync('app/settings.html','utf8'),css=fs.readFileSync('css/settings.css','utf8');
ok(html.includes('id="whatsapp-link" type="button">Link WhatsApp</button>'));ok(!html.includes('id="whatsapp-panel" hidden'));ok(!source.includes('window.open'));ok(!source.includes('send link '));ok(css.includes('.settings-page input:focus{outline:none;box-shadow:none;}'));ok(css.includes('font-size:16px;min-height:44px'));
console.log('WhatsApp Settings B2: '+count+' assertions passed (mocked DOM, storage and fetch)');
})().catch(e=>{console.error(e);process.exitCode=1;});
