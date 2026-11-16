const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const signature = require('../server/whatsapp-signature');
const origin = 'https://steep-app-three.vercel.app';
const saved = process.env.TWILIO_AUTH_TOKEN;
process.env.TWILIO_AUTH_TOKEN = 'local-regression-token';
let count = 0;
const eq = (a, b) => { assert.deepEqual(a, b); count++; };
const sign = (url, params) => createHmac('sha1', process.env.TWILIO_AUTH_TOKEN)
  .update(url + Object.keys(params).sort().map(k => k + params[k]).join('')).digest('base64');
// Capture both dispatch paths without invoking linking, auth or database logic.
const paths = ['../server/whatsapp-inbound', '../server/whatsapp-link'].map(require.resolve);
const cached = paths.map(p => require.cache[p]);
paths.forEach(p => { require.cache[p] = { id: p, filename: p, loaded: true,
  exports: (req, res) => { res.req = req; } }; });
const router = require('../api/whatsapp');
paths.forEach((p, i) => { if (cached[i]) require.cache[p] = cached[i]; else delete require.cache[p]; });
try {
  const params = { Body: 'Hi + tea', From: 'whatsapp:+2348000000000', MessageSid: 'SM-test' };
  for (const route of ['inbound', 'link']) {
    const path = '/api/whatsapp-' + route;
    for (const query of ['', 'z=%2B&x=a%20b&x=a+b', 'b=%2f&a=%2F&empty=', 'z=2&a=1']) {
      const original = path + (query ? '?' + query : '');
      const marker = '__steep_wa=' + route;
      for (const arrival of [path, '/api/whatsapp']) {
        for (const position of ['first', 'last']) {
          const rewritten = arrival + '?' + (position === 'first'
            ? marker + (query ? '&' + query : '') : (query ? query + '&' : '') + marker);
          const req = { method: 'POST', url: rewritten, headers: {
            host: 'steep-app-three.vercel.app', 'x-forwarded-proto': 'https',
            'content-type': 'application/x-www-form-urlencoded',
            'x-twilio-signature': sign(origin + original, params)
          }, body: new URLSearchParams(params).toString() };
          const res = {};
          router(req, res);
          eq(res.req.originalUrl, original);
          const decoded = Object.fromEntries(new URLSearchParams(req.body));
          eq(signature(req, decoded), true);
          req.headers['x-twilio-signature'] = sign(origin + rewritten, params);
          eq(signature(req, decoded), false);
          req.headers['x-twilio-signature'] = sign(origin + original, params);
          eq(signature(req, { ...decoded, Body: 'tampered' }), false);
        }
      }
      // Prefer the untouched original URL if the runtime re-encodes/reorders req.url.
      const req = { originalUrl: original, url: '/api/whatsapp?' + marker + '&a=1&z=2',
        headers: { host: 'steep-app-three.vercel.app', 'x-twilio-signature': sign(origin + original, params) } };
      router(req, {});
      eq(signature(req, params), true);
    }
  }
  const path = '/api/whatsapp-inbound';
  const req = { url: path, headers: { host: 'untrusted.invalid', 'x-forwarded-proto': 'http',
    'x-forwarded-host': 'untrusted.invalid', 'x-twilio-signature': sign('http://untrusted.invalid' + path, params) } };
  eq(signature(req, params), false);
  req.headers['x-twilio-signature'] = sign(origin + path, params);
  eq(signature(req, params), true);
  req.url = path + '?a=1&z=2';
  req.headers['x-twilio-signature'] = sign(origin + path + '?z=2&a=1', params);
  eq(signature(req, params), false); // Never guess a lost raw query order.
  req.headers['x-twilio-signature'] = 'bad';
  eq(signature(req, params), false);
  delete req.headers['x-twilio-signature'];
  eq(signature(req, params), false);
  for (const url of ['/api/other', 'https://untrusted.invalid/api/whatsapp-inbound']) {
    req.url=url; req.headers['x-twilio-signature']=sign(origin+url,params);
    eq(signature(req,params),false);
  }
  for (const url of ['/api/whatsapp?__steep_wa=inbound&__steep_wa=link',
    '/api/whatsapp-inbound?__steep_wa=link', '/api/whatsapp?__steep_wa=nope']) {
    const res={setHeader(){},status(n){this.code=n;return this;},json(){return this;}};
    router({url},res); eq(res.code,404);
  }
  console.log('WhatsApp rewrite: ' + count + ' assertions passed (offline only)');
} finally {
  if (saved === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = saved;
}
