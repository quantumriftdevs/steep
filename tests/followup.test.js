const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm');
const task = require('../api/task-intent');
const doc = require('../api/doc-intent'), page = require('../api/page-intent');
const messages = content => [{role:'user',content}];
const now = Date.parse('2026-11-12T10:00:00+01:00');
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
for(const noun of ['meeting','appointment','call','interview','exam','deadline','flight','class','session','date']) equal(task.taskSuggestionEligible(messages('I have a '+noun+' Friday'),now),true);
equal(task.taskSuggestionEligible(messages('I have a meeting by 6 today'),now),true);
equal(task.parseDue('I have a meeting by 6 today',now),'2026-11-12T18:00:00+01:00');
equal(task.taskSuggestionEligible(messages('I have a meeting'),now),false);
for(const text of ["I'll arrange a meeting",'I’ll arrange a meeting']) equal(task.taskSuggestionEligible(messages(text),now),true);
for(const prefix of ['Maybe ','I might have ','Someday ','Perhaps ','Eventually ','I wish ','Hypothetical ']) equal(task.taskSuggestionEligible(messages(prefix+'a meeting Friday'),now),false);
for(const text of ['Do I have a meeting Friday?','I have a meeting Friday?']) equal(task.taskSuggestionEligible(messages(text),now),false);
equal(task.taskSuggestionEligible([...messages('I have a meeting Friday'),{role:'assistant',content:'Okay'},...messages('Thanks')],now),false);
for(const text of ['remind me about my 6pm meeting','remind me of my 6pm meeting','set a reminder for my 6pm meeting']) {
    equal(task.taskIntent(messages(text),false)?.type,'add');
    equal(task.parseDue(text,now),'2026-11-12T18:00:00+01:00');
    equal(task.taskIntent(messages(text),true),null);
}
equal(task.taskIntent(messages('set a reminder for the exam Friday'),false)?.type,'add');
equal(task.parseDue('set a reminder for the exam Friday',now),'2026-11-13T09:00:00+01:00');
for(const text of ['remind me about my 6pm document','set a reminder for the exam page']) equal(task.taskIntent(messages(text),false),null);
for(const [text,due] of [['today at 6am','2026-11-12T06:00:00+01:00'],['today at 06:00','2026-11-12T06:00:00+01:00'],['today by 6','2026-11-12T18:00:00+01:00']]) equal(task.parseDue(text,now),due);
const source=fs.readFileSync(require.resolve('../api/chat.js'),'utf8');
const passage='Steep has built-in tasks and reminders.';
class FixedDate extends Date {constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
const imports=n=>n==='./task-intent'?task:n==='./doc-intent'?doc:n==='./page-intent'?page:n==='./research'?{research:async()=>null}:n==='./personality'?{prompt:'chat'}:{projectPrompt:async()=> 'chat',providerBody:body=>JSON.stringify(body)};
async function run(){
    for(const [text,normal] of [['I have a meeting by 6 today',true],['Hello',true],['remind me about my 6pm meeting',false],['Create a document about tea',false],['Build a website about tea',false]]) {
        let system='',output,calls=0;
        const context={module:{exports:{}},require:imports,Date:FixedDate,process:{env:{GROQ_API_KEY:'mock'}},Buffer,AbortController,AbortSignal,setTimeout,clearTimeout};
        context.fetch=async(url,options)=>{
            calls++;system=JSON.parse(options.body).messages[0].content;
            const begin=system.match(/<<<STEEP_TASK_[a-f0-9]+:BEGIN>>>/)?.[0];
            const content=begin?'Good plan.\n'+begin+'\n'+JSON.stringify({title:'Meeting at 6pm',due:null})+'\n'+begin.replace(':BEGIN>>>',':END>>>'):'Good plan.';
            return {ok:true,status:200,json:async()=>({choices:[{message:{content}}]})};
        };
        vm.runInNewContext(source,context);
        await context.module.exports({method:'POST',headers:{},body:{messages:messages(text)}},{setHeader(){},status(){return this;},json(o){output=o;}});
        equal(calls,1);
        equal(system.includes(passage),normal);
        if(normal && text!=='Hello') {equal(output.taskSuggest.title,'Meeting at 6pm');equal(output.taskSuggest.due,'2026-11-12T18:00:00+01:00');equal(output.reply,'Good plan.');}
        if(text==='Hello') equal(output.taskSuggest,undefined);
        if(text.startsWith('remind')) {equal(output.taskIntent,'add');equal(output.taskDue,'2026-11-12T18:00:00+01:00');}
    }
    console.log('PASS: '+checks+' follow-up assertions; mocked model only.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
