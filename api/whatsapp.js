const inbound = require('../server/whatsapp-inbound');
const link = require('../server/whatsapp-link');
// Vercel can retain the public path while appending the rewrite's query marker.
module.exports = (req, res) => {
  const raw = req.originalUrl || req.url || '';
  const split = raw.indexOf('?');
  const path = split < 0 ? raw : raw.slice(0, split);
  let route = path === '/api/whatsapp-inbound' ? 'inbound' : path === '/api/whatsapp-link' ? 'link' : null;
  if (route || path === '/api/whatsapp') {
    // Split raw bytes, not URLSearchParams: HMAC covers query order and encoding.
    const query = split < 0 ? [] : raw.slice(split + 1).split('&');
    const markers = query.filter(p => p.startsWith('__steep_wa='));
    const marker = markers[0];
    const selected = marker === '__steep_wa=inbound' ? 'inbound' : marker === '__steep_wa=link' ? 'link' : null;
    if (markers.length && (markers.length !== 1 || !selected || (route && route !== selected))) route = null;
    else {
      route ||= selected;
      if (route && marker) {
        const rest = query.filter(p => p !== marker).join('&');
        req.originalUrl = '/api/whatsapp-' + route + (rest ? '?' + rest : '');
      }
    }
  }
  if (route === 'inbound') return inbound(req, res);
  if (route === 'link') return link(req, res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({ error: 'Not found' });
};
