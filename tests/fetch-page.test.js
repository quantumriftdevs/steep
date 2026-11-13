const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function run() {
 let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 let calls=[],reply=()=>new Response('<title>Page &amp; title</title><nav>NOISE</nav><h1>Heading</h1><p>'+('Useful evidence about this public page. '.repeat(8))+'</p>',{headers:{'content-type':'text/html'}});
 const mock=async(u,o)=>{calls.push({u,o});return reply(u,o);};
 const env={GROQ_API_KEY:'mock',TAVILY_API_KEY:'mock'};
 function load(file,overrides={},globals={}) {const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:n=>overrides[n] || (n==='node:dns'?{promises:{lookup:async()=>[{address:'93.184.216.34'}]}}:require(n.startsWith('./')?'../api/'+n.slice(2):n)),URL,TextDecoder,Buffer,AbortSignal,AbortController,fetch:mock,process:{env},setTimeout,clearTimeout,console,...globals});return module.exports;}
 const page=load('api/fetch-page.js');
 eq(Array.from(page.urlsIn('Read (https://example.com/a). https://example.com/a#x ftp://example.com https://two.com! https://three.com https://four.com')),['https://example.com/a','https://two.com/','https://three.com/']);
 eq(page.urlsIn('no links ftp://x.com javascript:alert(1)').length,0);
 eq(page.urlsIn('https://example.com/'+ 'a'.repeat(1600)).length,0);
 ok(page.urlsIn('https://example.com/a_(b)')[0].endsWith('(b)'));
 const clean=page.extractText('<head><title>NOISE</title></head><script>EVIL</script><style>CSS</style><nav>NAV</nav><h1>A &amp; B</h1><p>Hello &#65; &#x1F600;</p><ul><li>One</li><li>Two</li></ul>');
 ok(clean.includes('A & B') && clean.includes('Hello A 😀') && /One\s+Two/.test(clean));ok(!/NOISE|EVIL|CSS|NAV/.test(clean));eq(page.extractText('<p>'+'x'.repeat(15000)+'</p>').length,10000);
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.1.1','100.64.0.1','198.18.0.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1','2001:db8::1'])ok(!page.publicIP(ip),ip);
 ok(page.publicIP('93.184.216.34'));ok(page.publicIP('2606:4700:4700::1111'));
 let out=await page.fetchPages(['https://example.com']);eq(out.sources.length,1);ok(out.context.includes('Useful evidence'));eq(out.sources[0].title,'Page & title');ok(out.context.includes('untrusted'));eq(out.failureReply,null);
 calls=[];await page.fetchPages(Array(5).fill('https://example.com'));eq(calls.length,3);
 for(const url of ['http://127.0.0.1','http://localhost','http://169.254.169.254','ftp://example.com','https://u:p@example.com','http://example.com:8080']){calls=[];out=await page.fetchPages([url]);eq(calls.length,0);ok(out.failureReply.includes("couldn't read"));}
 const privateDNS=load('api/fetch-page.js',{'node:dns':{promises:{lookup:async()=>[{address:'10.0.0.2'}]}}});calls=[];out=await privateDNS.fetchPages(['https://example.com']);eq(calls.length,0);ok(out.failureReply);
 reply=()=>new Response('',{status:404});out=await page.fetchPages(['https://example.com']);ok(out.failureReply.includes('HTTP 404'));eq(out.sources.length,0);
 reply=()=>new Response('<div id="root"></div><script>app()</script>',{headers:{'content-type':'text/html'}});out=await page.fetchPages(['https://example.com']);ok(out.failureReply.includes('no readable'));
 reply=()=>new Response('binary',{headers:{'content-type':'application/pdf'}});out=await page.fetchPages(['https://example.com']);ok(out.failureReply.includes('unsupported'));
 reply=()=>new Response('a'.repeat(262145),{headers:{'content-type':'text/plain'}});out=await page.fetchPages(['https://example.com']);ok(out.failureReply.includes('byte limit'));
 reply=()=>new Response('a',{headers:{'content-type':'text/plain','content-length':'262145'}});out=await page.fetchPages(['https://example.com']);ok(out.failureReply.includes('byte limit'));
 reply=()=>new Response('a'.repeat(20000),{headers:{'content-type':'text/plain'}});out=await page.fetchPages(['https://example.com']);ok(out.context.includes('a'.repeat(10000)));ok(!out.context.includes('a'.repeat(10001)));
 calls=[];reply=()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/secret'}});out=await page.fetchPages(['https://example.com']);eq(calls.length,1);ok(out.failureReply.includes('not a public'));
 calls=[];reply=()=>new Response('',{status:302,headers:{location:'/loop'}});out=await page.fetchPages(['https://example.com']);eq(calls.length,4);ok(out.failureReply.includes('redirect'));
 calls=[];reply=(u)=>u.includes('good')?new Response('Evidence '.repeat(30),{headers:{'content-type':'text/plain'}}):new Response('',{status:404});out=await page.fetchPages(['https://good.com','https://bad.com']);eq(out.sources.length,1);eq(out.failureReply,null);ok(out.context.includes('Could not read https://bad.com'));
 const aborted=new AbortController();aborted.abort();reply=async(u,o)=>{o.signal.throwIfAborted();};out=await page.fetchPages(['https://example.com'],aborted.signal);ok(out.failureReply.includes('cancelled'));
 // Exercise 10s timeout without a real wait or any network.
 let timeoutMs; const quick=load('api/fetch-page.js',{}, {AbortSignal:{any:AbortSignal.any.bind(AbortSignal),timeout(ms){timeoutMs=ms;const c=new AbortController();setTimeout(()=>c.abort(),2);return c.signal;}}});
 reply=(u,o)=>new Promise((resolve,reject)=>{if(o.signal.aborted)return reject(new Error('aborted'));o.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});out=await quick.fetchPages(['https://example.com']);eq(timeoutMs,10000);ok(out.failureReply.includes('timed out'));
 reply=()=>{throw new Error('network failure')};out=await page.fetchPages(['https://example.com']);ok(out.failureReply.includes('network failure'));
 calls=[];reply=(u)=>u.endsWith('/next')?new Response('Final evidence '.repeat(30),{headers:{'content-type':'text/plain'}}):new Response('',{status:302,headers:{location:'/next'}});out=await page.fetchPages(['https://example.com']);eq(calls.length,2);eq(out.sources[0].url,'https://example.com/next');

 const research=load('api/research.js',{'./fetch-page':page}).research;
 calls=[];reply=()=>new Response('URL text '.repeat(30),{headers:{'content-type':'text/plain'}});out=await research([{role:'user',content:'summarize https://example.com'}],'u',new AbortController().signal);eq(calls.length,1);eq(calls[0].o.redirect,'manual');ok(out.context.includes('URL text'));
 calls=[];eq(await research([{role:'user',content:'hello'},{role:'assistant',content:'https://example.com'},{role:'user',content:'thanks'}],'u',new AbortController().signal),null);eq(calls.length,0);
 for(const text of ['hello','do not search the web for latest news','rewrite today news','translate latest news','summarize latest news','proofread latest news']){calls=[];await research([{role:'user',content:text}],'u',new AbortController().signal);eq(calls.length,0);}
 calls=[];reply=()=>new Response(JSON.stringify({results:[{title:'News',url:'https://news.com',content:'Fresh facts'}]}),{headers:{'content-type':'application/json'}});out=await research([{role:'user',content:'latest news'}],'u',new AbortController().signal);eq(calls.length,1);eq(calls[0].u,'https://api.tavily.com/search');const body=JSON.parse(calls[0].o.body);eq(body.search_depth,'basic');eq(body.chunks_per_source,1);eq(body.max_results,3);eq(body.include_raw_content,false);await research([{role:'user',content:'latest news'}],'u',new AbortController().signal);eq(calls.length,1);
 delete env.TAVILY_API_KEY;await assert.rejects(()=>research([{role:'user',content:'current weather'}],'u',new AbortController().signal),e=>e.code==='NOT_CONNECTED');checks++;
 let researchCalls=0; const web={research:async()=>{researchCalls++;return null;}};
 async function chat(route,auth=false){let output,status;env.SUPABASE_URL=auth?'https://auth.example.com':'';const handler=load('api/chat.js',{'./research':web,'./project-context':{projectPrompt:async()=>'',providerBody:JSON.stringify},'./doc-intent':{documentIntent:()=>route==='doc'?{format:'txt'}:null,documentInstruction:()=>'',documentMetadata:()=>({})},'./page-intent':{pageIntent:()=>route==='page'?{explicit:true}:null,pageInstruction:()=>'',pageResult:()=>({reply:'Page'})},'./task-intent':{...require('../api/task-intent'),taskIntent:()=>route==='task'?{type:'add'}:null}});reply=()=>new Response(JSON.stringify({choices:[{message:{content:'Hello'}}]}),{headers:{'content-type':'application/json'}});await handler({method:'POST',headers:{},body:{messages:[{role:'user',content:'latest news https://example.com'}]}},{setHeader(){},status(n){status=n;return this;},json(v){output=v;return v;}});return{status,output};}
 for(const route of ['doc','page','task']){researchCalls=0;await chat(route);eq(researchCalls,0);}researchCalls=0;out=await chat('normal');eq(out.status,200);eq(researchCalls,1);researchCalls=0;out=await chat('normal',true);eq(out.status,401);eq(researchCalls,0);env.SUPABASE_URL='';
 const ui={};vm.runInNewContext(fs.readFileSync('js/sources.js','utf8').replace(/export /g,'')+'\nthis.sourceList=sourceList;this.sourcesCard=sourcesCard;',Object.assign(ui,{URL,document:{createElement(tag){return{tag,children:[],append(x){this.children.push(x)},setAttribute(k,v){this[k]=v}}}}}));
 eq(ui.sourceList([{url:'javascript:alert(1)'},{url:'https://u:p@example.com'}]).length,0);eq(ui.sourcesCard([]),null);const card=ui.sourcesCard([{url:'https://example.com',title:'<script>bad</script>'}]);eq(card.children[1].textContent,'[1] <script>bad</script>');eq(card.children[1].rel,'noopener noreferrer');eq(card['aria-label'],'Reply sources');eq(ui.sourceList(Array(5).fill({url:'https://example.com',title:'t'.repeat(200)})).length,3);eq(ui.sourceList([{url:'https://example.com',title:'t'.repeat(200)}])[0].title.length,160);
 const app=fs.readFileSync('js/app.js','utf8');ok(app.includes('sourcesCard(m.sources)'));ok(app.includes('sources: sourceList(data.research.sources)'));
 console.log('PASS URL reading: '+checks+' assertions; all fetch and DNS mocked; no live Groq/Tavily calls.');return checks;
}
module.exports=run;if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
