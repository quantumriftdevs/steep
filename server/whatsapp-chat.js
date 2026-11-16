const {read,append,clip,history}=require('./whatsapp-memory');
const context=require('./whatsapp-context');
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
async function chat({db,link,wa,body,tasks,now}) {
  let state;
  try { state=await read(db,link.user_id); }
  catch {console.error('whatsapp-chat: memory unavailable');return FALLBACK;}
  const user={role:'user',content:clip(body)};
  let answer=FALLBACK, generated=false;
  try {
    const key=(process.env.GROQ_API_KEY || '').trim();
    if(!key) throw Error('configuration');
    const system=await context(db,link.user_id,tasks,now);
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',messages:[{role:'system',content:system},...history(state.messages),user],max_tokens:600}),signal:AbortSignal.timeout(10000)});
    if(!r.ok) throw Error('provider');
    const data=await r.json();answer=clip(data?.choices?.[0]?.message?.content);
    if(!answer) throw Error('empty');generated=true;
  } catch {answer=FALLBACK;console.error('whatsapp-chat: reply unavailable');}
  try {
    const [live]=await db('whatsapp_links',{user_id:'eq.'+link.user_id,id:'eq.'+link.id,status:'eq.linked',wa_id:'eq.'+wa,revision:'eq.'+link.revision,select:'id'});
    if(!live) return null;
    if(await deliver(wa,answer)) {
      await append(db,link.user_id,[user,...(generated?[{role:'assistant',content:answer}]:[])]);
    }
  } catch {console.error('whatsapp-chat: state unavailable');}
  return null;
}
module.exports={chat,deliver,FALLBACK};
