const {read,append,clip,history}=require('./whatsapp-memory');
const context=require('./whatsapp-context');
const creation=require('./whatsapp-create');
const mutation=require('./whatsapp-mutate');
const editor=require('./whatsapp-edit');
const FALLBACK='I lost my train of thought for a moment 🌿 Please try that again shortly.';
async function deliver(to,text) {
  try {
    const sid=process.env.TWILIO_ACCOUNT_SID, token=process.env.TWILIO_AUTH_TOKEN;
    if(!sid || !token) throw Error('configuration');
    const r=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'/Messages.json',{
      method:'POST',headers:{Authorization:'Basic '+Buffer.from(sid+':'+token).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({From:'whatsapp:+14155238886',To:'whatsapp:+'+to,Body:clip(text)}),signal:AbortSignal.timeout(8000)});
    const data=await r.json();
    if(!r.ok || !data?.sid || ['failed','undelivered'].includes(data.status)) {
      console.error('whatsapp-chat: delivery rejected',Number.isInteger(data?.code)?data.code:null);return false;
    }
    return true;
  } catch {console.error('whatsapp-chat: delivery unavailable');return false;}
}
function failure(phase,error,details={}) {
  const classes=['Error','TypeError','SyntaxError','AbortError','TimeoutError','CompletionLengthError','EmptyCompletionError'];
  const status=details.status ?? error?.status;
  console.error('whatsapp-chat: reply unavailable',{phase,error_class:classes.includes(error?.name)?error.name:'Error',status:null,finish_reason:null,content_length:0,...details,status:Number.isInteger(status)?status:null});
}
async function chat({db,link,wa,body,tasks,now}) {
  let state, memoryWarning='';
  try { state=await read(db,link.user_id); }
  catch(error) {state={messages:[]};memoryWarning='\nRecent WhatsApp history is unavailable; do not assume earlier messages or actions.';failure('memory',error);}
  const user={role:'user',content:clip(body)};
  let answer=FALLBACK, generated=false, action, edit;
  let phase='groq', status=null, finishReason=null, contentLength=0, completionTokens=null, reasoningTokens=null;
  try {
    const key=(process.env.GROQ_API_KEY || '').trim();
    if(!key) throw Error('configuration');
    phase='context';
    const system=await context(db,link.user_id,tasks,now)+'\n'+mutation.PROMPT+memoryWarning;
    const model=process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
    phase='groq';
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({model,messages:[{role:'system',content:system},...history(state.messages),user],response_format:{type:'json_object'},max_completion_tokens:4096,...(model.includes('gpt-oss')?{reasoning_effort:'low'}:{})}),signal:AbortSignal.timeout(10000)});
    status=Number.isInteger(r.status)?r.status:null;
    if(!r.ok) throw Error('provider');
    const data=await r.json();
    const choice=data?.choices?.[0], content=choice?.message?.content;
    finishReason=['stop','length','tool_calls','function_call','content_filter'].includes(choice?.finish_reason)?choice.finish_reason:null;
    contentLength=typeof content==='string'?content.length:0;
    const tokens=value=>Number.isSafeInteger(value) && value>=0?value:null;
    completionTokens=tokens(data?.usage?.completion_tokens);
    reasoningTokens=tokens(data?.usage?.completion_tokens_details?.reasoning_tokens);
    if(finishReason==='length') throw Object.assign(Error('completion'),{name:'CompletionLengthError'});
    if(typeof content!=='string' || !content.trim()) throw Object.assign(Error('completion'),{name:'EmptyCompletionError'});
    phase='decode';
    const decoded=mutation.decode(content,body,now);
    answer=clip(decoded.reply);action=decoded.task;edit=decoded.mutation;
    if(!answer) throw Error('empty');generated=true;
  } catch(error) {answer=FALLBACK;failure(phase,error,{status,finish_reason:finishReason,content_length:contentLength,completion_tokens:completionTokens,reasoning_tokens:reasoningTokens});}
  try {
    const [live]=await db('whatsapp_links',{user_id:'eq.'+link.user_id,id:'eq.'+link.id,status:'eq.linked',wa_id:'eq.'+wa,revision:'eq.'+link.revision,select:'id'});
    if(!live) return null;
    if(edit) {
      try {answer=clip(await editor.save(db,link.user_id,edit,now));}
      catch {answer='Sorry, I could not check that task. Nothing changed. Please try again shortly 🌿';}
    }
    if(action) {
      try { answer=clip(await creation.save(db,link.user_id,action)+'\n'+clip(answer,700)); }
      catch {answer='I could not save that task just now. Please try again shortly 🌿';}
    }
    if(await deliver(wa,answer)) {
      await append(db,link.user_id,[user,...(generated?[{role:'assistant',content:answer}]:[])]);
    }
  } catch {console.error('whatsapp-chat: state unavailable');}
  return null;
}
module.exports={chat,deliver,FALLBACK};
