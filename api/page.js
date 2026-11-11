// Generated HTML is never granted Steep's origin, even in a top-level tab.
const CSP = "sandbox allow-scripts allow-popups allow-forms; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const screen = (title, message) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + ' · Steep</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fcf8f1;color:#38251d;font:16px/1.6 system-ui,sans-serif}main{max-width:30rem;padding:2rem}h1{font-size:clamp(2rem,7vw,3rem);line-height:1.1}p{opacity:.8}</style></head><body><main><p>steep.</p><h1>' + title + '</h1><p>' + message + '</p></main></body></html>';
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  const gone = () => res.status(404).send(screen('This page is gone or expired', 'Preview links last seven days. Ask Steep for a fresh page.'));
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).send(screen('Use a preview link', 'Open this page with your browser.')); }
  const token = req.query?.token;
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) return gone();
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  const unavailable = () => res.status(503).send(screen('Preview unavailable', 'Please try this link again shortly.'));
  if (!url || !key) return unavailable();
  try {
    // Explicit select is essential: anon has no access to user_id.
    const response = await fetch(url + '/rest/v1/pages?select=html,expires_at,revoked_at&token=eq.' + token + '&revoked_at=is.null&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&limit=1', {
      headers: { apikey: key, Authorization: 'Bearer ' + key }, cache: 'no-store', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return unavailable();
    const rows = await response.json(), row = Array.isArray(rows) && rows[0];
    if (!row || row.revoked_at || !(Date.parse(row.expires_at) > Date.now()) || typeof row.html !== 'string' || !row.html.trim() || row.html.length > 500000) return gone();
    return res.status(200).send(req.method === 'HEAD' ? '' : row.html);
  } catch (_) { return unavailable(); }
};
