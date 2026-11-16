const inbound = require('../server/whatsapp-inbound');
const link = require('../server/whatsapp-link');
// Rewrites select a handler; retain the public URL for Twilio signature checks.
module.exports = (req, res) => {
  const raw = req.originalUrl || req.url || '';
  const split = raw.indexOf('?');
  const path = split < 0 ? raw : raw.slice(0, split);
  let route = path === '/api/whatsapp-inbound' ? 'inbound'
    : path === '/api/whatsapp-link' ? 'link' : null;
  if (!route && path === '/api/whatsapp') {
    const query = split < 0 ? [] : raw.slice(split + 1).split('&');
    const marker = query.find(p => p === '__steep_wa=inbound' || p === '__steep_wa=link');
    route = marker ? marker.split('=')[1] : null;
    if (route) {
      const rest = query.filter(p => p !== marker).join('&');
      req.originalUrl = '/api/whatsapp-' + route + (rest ? '?' + rest : '');
    }
  }
  if (route === 'inbound') return inbound(req, res);
  if (route === 'link') return link(req, res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({error: 'Not found'});
};
