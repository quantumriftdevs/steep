const {randomUUID}=require('node:crypto');
const LIMIT=12000, TURNS=12;
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
// Reads never reserve a time slot: each inbound message may complete immediately.
async function read(db,user) {
  const [row]=await db('whatsapp_chat_state',{user_id:'eq.'+user,select:'*',limit:'1'});
  return {revision:row?.revision,messages:history(row?.messages)};
}
// Merge delivered turns against the latest revision, never overwrite a stale snapshot.
// Bounded immediate CAS retries protect storage without delaying or retrying delivery.
async function append(db,user,turns) {
  for(let attempt=0;attempt<12;attempt++) {
    const old=await read(db,user);
    const row={user_id:user,revision:randomUUID(),messages:history([...old.messages,...turns])};
    const rows=old.revision
      ? await db('whatsapp_chat_state',{user_id:'eq.'+user,revision:'eq.'+old.revision},'PATCH',row)
      : await db('whatsapp_chat_state',{on_conflict:'user_id'},'POST',row,'resolution=ignore-duplicates,return=representation');
    if(rows.length) return true;
  }
  console.error('whatsapp-chat: history contention');
  return false;
}
module.exports={clip,history,read,append,LIMIT,TURNS};
