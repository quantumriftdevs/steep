const LIMIT = 4 * 1024 * 1024;
const formats = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/flac': 'flac' };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const authUrl = (process.env.SUPABASE_URL || '').trim();
  if (authUrl) {
    const authorization = req.headers.authorization || '';
    const unauthorized = () => res.status(401).json({ error: 'Please sign in to keep using Steep.' });
    if (!/^Bearer\s+\S+$/i.test(authorization)) return unauthorized();
    try {
      const user = await fetch(authUrl + '/auth/v1/user', {
        headers: { apikey: process.env.SUPABASE_ANON_KEY || '', Authorization: authorization },
        signal: AbortSignal.timeout(8000)
      });
      if (!user.ok || !(await user.json()).id) return unauthorized();
    } catch (_) { return unauthorized(); }
  }
  const key = (process.env.GROQ_API_KEY || '').trim();
  if (!key) return res.status(503).json({ code: 'NOT_CONNECTED', error: "Steep isn't connected yet - add the API key in Vercel" });
  const tooLarge = () => res.status(413).json({ error: 'Audio request exceeds the 4 MiB limit.' });
  const invalid = () => res.status(400).json({ error: 'Please send valid, non-empty audio.' });
  if (Number(req.headers['content-length']) > LIMIT) return tooLarge();
  let body = req.body;
  let audio;
  let mime = String(req.headers['x-audio-format'] || 'audio/webm').split(';')[0].trim().toLowerCase();
  try {
    if (Buffer.isBuffer(body)) {
      if (body.length > LIMIT) return tooLarge();
      audio = body;
    } else {
      if (typeof body === 'string') {
        if (Buffer.byteLength(body) > LIMIT) return tooLarge();
        if (String(req.headers['content-type']).includes('application/json')) body = JSON.parse(body);
      }
      if (body && typeof body === 'object') {
        if (Buffer.byteLength(JSON.stringify(body)) > LIMIT) return tooLarge();
        if (!req.headers['x-audio-format'] && typeof body.format === 'string') {
          mime = body.format.includes('/') ? body.format : `audio/${body.format}`;
        }
        body = body.audio;
      }
      if (typeof body !== 'string' || !body.length || body.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return invalid();
      audio = Buffer.from(body, 'base64');
      if (audio.toString('base64').replace(/=+$/, '') !== body.replace(/=+$/, '')) return invalid();
    }
  } catch (_) { return invalid(); }
  if (!audio || audio.length < 12) return invalid();
  if (audio.length > LIMIT) return tooLarge();
  const ext = formats[mime];
  if (!ext) return res.status(400).json({ error: 'Unsupported x-audio-format. Use an audio MIME type such as audio/webm or audio/mp4.' });
  const head = audio.subarray(0, 12).toString('latin1');
  const hex = audio.subarray(0, 4).toString('hex');
  const valid = ext === 'webm' ? hex === '1a45dfa3' : ['mp4', 'm4a'].includes(ext) ? head.slice(4, 8) === 'ftyp' : ext === 'wav' ? head.startsWith('RIFF') && head.slice(8) === 'WAVE' : ext === 'ogg' ? head.startsWith('OggS') : ext === 'flac' ? head.startsWith('fLaC') : head.startsWith('ID3') || (audio[0] === 255 && (audio[1] & 224) === 224);
  if (!valid) return invalid();
  const model = (process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo').trim();
  const boundary = `steep-${require('crypto').randomBytes(16).toString('hex')}`;
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`),
    audio,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n--${boundary}--\r\n`)
  ]);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multipart,
      signal: AbortSignal.timeout(25000)
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = {}; }
    if (!response.ok) return res.status(502).json({ error: 'Steep could not reach the model. Check your Groq key, model and quota in Vercel.', detail: `Groq HTTP ${response.status}: ${typeof data.error?.message === 'string' ? data.error.message : raw || 'Upstream request failed'}`.slice(0, 500) });
    if (typeof data.text !== 'string' || !data.text.trim()) return res.status(502).json({ error: 'Steep did not receive a text response. Try again.' });
    return res.status(200).json({ text: data.text, provider: 'groq' });
  } catch (_) {
    return res.status(502).json({ error: 'Steep could not connect to the model. Try again.' });
  }
};
