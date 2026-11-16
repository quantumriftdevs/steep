const {randomBytes,randomUUID}=require('node:crypto');
const {config,database}=require('../server/whatsapp-db');
const sandbox='+1 415 523 8886';
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const conf=config();
  if(conf.missing) return res.status(503).json({error:'config-missing',missing:conf.missing});
  const token=req.headers?.authorization;
  if(!/^Bearer \S+$/i.test(token || '')) return res.status(401).json({error:'Unauthorized'});
  try {
    const r=await fetch(conf.base+'/auth/v1/user',{headers:{apikey:conf.key,Authorization:token},signal:AbortSignal.timeout(8000)});
    if(!r.ok) return res.status(401).json({error:'Unauthorized'});
    const user=await r.json();
    if(!user.id) return res.status(401).json({error:'Unauthorized'});
    const db=database(conf), [old]=await db('whatsapp_links',{select:'*',user_id:'eq.'+user.id});
    if(old?.status==='linked') return res.status(200).json({status:'linked',sandbox});
    if(req.method==='GET') return res.status(200).json({status:'unlinked',sandbox});
    if(old && Date.now()-Date.parse(old.updated_at)<30000) return res.status(429).json({error:'Please wait 30 seconds before getting a fresh code.'});
    const at=new Date().toISOString(), expires_at=new Date(Date.now()+900000).toISOString();
    const row={user_id:user.id,link_code:randomBytes(4).toString('hex').toUpperCase(),status:'pending',wa_id:null,linked_at:null,updated_at:at,expires_at,revision:randomUUID()};
    const rows=old ? await db('whatsapp_links',{id:'eq.'+old.id,status:'eq.pending',revision:'eq.'+old.revision},'PATCH',row)
      : await db('whatsapp_links',{},'POST',row);
    if(!rows.length) return res.status(409).json({error:'The link changed. Refresh Settings.'});
    return res.status(200).json({status:'pending',code:row.link_code,expires_at,sandbox});
  } catch {return res.status(503).json({error:'WhatsApp linking is unavailable. Please try again shortly.'});}
};
