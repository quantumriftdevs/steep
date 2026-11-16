const {randomUUID}=require('node:crypto');
const COOLDOWN=25000, LIMIT=12000, TURNS=12;
function clip(value,n=1500) {
  const chars=Array.from(typeof value==='string'?value.trim():'');
  if(chars.length<=n) return chars.join('');
  const head=chars.slice(0,n-1).join('');
  const cut=head.lastIndexOf(' ');
  return (cut>n-120?head.slice(0,cut):head).trimEnd()+'…';
}
function history(rows) {
  const result=[]; let size=0;
  for(const m of (Array.isArray(rows)?rows:[]).slice(-TURNS).reverse()) {
    if(!m || !['user','assistant'].includes(m.role) || typeof m.content!=='string') continue;
    const content=clip(m.content);
    if(!content || size+content.length>LIMIT) continue;
    result.unshift({role:m.role,content}); size+=content.length;
  }
  return result;
}
async function claim(db,user,now) {
  const [old]=await db('whatsapp_chat_state',{user_id:'eq.'+user,select:'*',limit:'1'});
  if(old && Date.parse(old.next_reply_at)>now) return null;
  const row={user_id:user,revision:randomUUID(),next_reply_at:new Date(now+COOLDOWN).toISOString(),messages:history(old?.messages)};
  const rows=old ? await db('whatsapp_chat_state',{user_id:'eq.'+user,revision:'eq.'+old.revision,next_reply_at:'lte.'+new Date(now).toISOString()},'PATCH',row)
    : await db('whatsapp_chat_state',{on_conflict:'user_id'},'POST',row,'resolution=ignore-duplicates,return=representation');
  return rows.length?row:null;
}
module.exports={clip,history,claim,COOLDOWN,LIMIT,TURNS};
