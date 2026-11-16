const {createHmac,timingSafeEqual}=require('node:crypto');
function signature(req,params){
  const h=req.headers||{};
  const path=req.originalUrl||req.url||'/api/whatsapp-inbound';
  if(!/^\/api\/whatsapp-(?:inbound|link)(?:\?|$)/.test(path))return false;
  // Validate only the configured public origin, never a caller-supplied proxy host.
  const url='https://steep-app-three.vercel.app'+path;
  const data=url+Object.keys(params).sort().map(k=>k+String(params[k])).join('');
  const want=createHmac('sha1',process.env.TWILIO_AUTH_TOKEN).update(data).digest('base64');
  const got=h['x-twilio-signature'];
  return typeof got==='string' && Buffer.byteLength(got)===Buffer.byteLength(want) && timingSafeEqual(Buffer.from(got),Buffer.from(want));
}
module.exports=signature;
