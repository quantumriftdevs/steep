const { research } = require('./research');
const { prompt } = require('./personality'); const { projectPrompt, providerBody } = require('./project-context');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const authUrl = (process.env.SUPABASE_URL || '').trim();
  let userId;   if (authUrl) {
    const authorization = req.headers.authorization || '';
    const unauthorized = () => res.status(401).json({ error: 'Please sign in to keep using Steep.' });
    if (!/^Bearer\s+\S+$/i.test(authorization)) return unauthorized();
    try {
      const user = await fetch(authUrl + '/auth/v1/user', {
        headers: { apikey: process.env.SUPABASE_ANON_KEY || '', Authorization: authorization },
        signal: AbortSignal.timeout(8000)
      });
      if (!user.ok || !(userId = (await user.json()).id)) return unauthorized();
    } catch (_) { return unauthorized(); }
  }
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (!groqKey) return res.status(503).json({ code: 'NOT_CONNECTED', error: "Steep isn't connected yet - add GROQ_API_KEY in Vercel" });
  const messages = req.body && req.body.messages;
  if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > 3500000) return res.status(413).json({ error: 'Message exceeds the 3.5 MB payload limit.' });
  const validImage = image => typeof image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) && (image.length - 23) % 4 === 0;
  if (!Array.isArray(messages) || !messages.length || messages.length > 100 ||
      messages.some(m => !m || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || !m.content.trim() || m.content.length > 3500000 || (m.images !== undefined && (m.role !== 'user' || !Array.isArray(m.images) || m.images.length > 3 || m.images.some(image => !validImage(image)))))) {
    return res.status(400).json({ error: 'Please send a valid conversation.' });
  }
  const imageCount = messages.reduce((count, m) => count + (m.images?.length || 0), 0);
  if (imageCount > 3) return res.status(400).json({ error: 'Only 3 images can be sent per request.' });
  let systemPrompt; try { systemPrompt = await projectPrompt(req, userId, prompt); } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Project context is unavailable. Try again.' }); } const isProject = req.body?.projectId !== undefined;
    const controller = new AbortController(); res.on?.('close', () => { if (!res.writableEnded) controller.abort(); }); let web; try { web = await research(messages, userId, controller.signal); } catch (error) { if (controller.signal.aborted) return; return res.status(error.status || 503).json({ ...(error.code ? { code: error.code } : {}), error: error.status ? error.message : 'Web research is unavailable right now. Please try again shortly.' }); } if (web) systemPrompt += web.context; const model = (imageCount ? (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b') : (process.env.GROQ_MODEL || 'openai/gpt-oss-120b')).trim();
    try {
      const body = providerBody({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages.map(({ role, content, images }) => ({ role, content: images?.length ? [{ type: 'text', text: content }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] : content }))] }, isProject); if (body === null) return res.status(413).json({ error: 'Conversation and project context exceed the 3.5 MB payload limit.' }); const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ ...(response.status === 429 ? { retryAfter: (() => { const raw = response.headers.get('retry-after'); if (raw === null) return undefined; const seconds = Number(raw); return Number.isFinite(seconds) ? Math.max(0, seconds) : Math.max(0, (Date.parse(raw) - Date.now()) / 1000) || undefined; })() } : {}),
        error: 'Steep could not reach the model. Check your Groq key, model and quota in Vercel.',
        detail: `Groq HTTP ${response.status}: ${typeof data.error?.message === 'string' ? data.error.message.slice(0, 500) : 'Upstream request failed'}`
      });
      const reply = data.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) return res.status(502).json({ error: 'Steep did not receive a text response. Try again.' });
      return res.status(200).json({ reply, provider: 'groq', ...(web ? { research: { sources: web.sources } } : {}) });
    } catch (error) {
      return res.status(502).json({ error: 'Steep could not connect to the model. Try again.' });
    }
};
