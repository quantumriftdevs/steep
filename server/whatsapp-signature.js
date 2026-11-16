const {createHmac,timingSafeEqual}=require('node:crypto');
function signature(req,params) {
  const h=req.headers || {}, proto=(h['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host=(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
  const path=req.originalUrl || req.url || '/api/whatsapp-inbound';
  const url=proto+'://'+host+path;
  const data=url+Object.keys(params).sort().map(k=>k+String(params[k])).join('');
  const want=createHmac('sha1',process.env.TWILIO_AUTH_TOKEN).update(data).digest('base64');
  const got=h['x-twilio-signature'];
  return typeof got==='string' && Buffer.byteLength(got)===Buffer.byteLength(want) && timingSafeEqual(Buffer.from(got),Buffer.from(want));
}
module.exports=signature;
