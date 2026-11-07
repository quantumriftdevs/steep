const { prompt } = require('./personality');

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
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!groqKey && !key) return res.status(503).json({ code: 'NOT_CONNECTED', error: "Steep isn't connected yet - add the API key in Vercel" });
  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 100 ||
      messages.some(m => !m || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || !m.content.trim() || m.content.length > 40000)) {
    return res.status(400).json({ error: 'Please send a valid conversation.' });
  }
  if (groqKey) {
    const model = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, ...messages.map(({ role, content }) => ({ role, content }))] })
      });
      const data = await response.json();
      if (!response.ok) return res.status(502).json({
        error: 'Steep could not reach the model. Check your key, model and quota in Vercel and Google AI Studio.',
        detail: `Groq HTTP ${response.status}: ${typeof data.error?.message === 'string' ? data.error.message.slice(0, 500) : 'Upstream request failed'}`
      });
      const reply = data.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) return res.status(502).json({ error: 'Steep did not receive a text response. Try again.' });
      return res.status(200).json({ reply, provider: 'groq' });
    } catch (error) {
      return res.status(502).json({ error: 'Steep could not connect to the model. Try again.' });
    }
  }
  const model = (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) return res.status(500).json({ error: 'Invalid model configuration.' });
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({
      error: 'Steep could not reach the model. Check your key, model and quota in Vercel and Google AI Studio.',
      detail: `Gemini HTTP ${response.status}: ${typeof data.error?.message === 'string' ? data.error.message.slice(0, 500) : 'Upstream request failed'}`
    });
    const reply = (data.candidates?.[0]?.content?.parts || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
    if (!reply.trim()) return res.status(502).json({ error: 'Steep did not receive a text response. Try again.' });
    return res.status(200).json({ reply, provider: 'gemini' });
  } catch (error) {
    return res.status(502).json({ error: 'Steep could not connect to the model. Try again.' });
  }
};
