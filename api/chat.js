const { prompt } = require('./personality');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.status(503).json({ code: 'NOT_CONNECTED', error: "Steep isn't connected yet - add the API key in Vercel" });
  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 100 ||
      messages.some(m => !m || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || !m.content.trim() || m.content.length > 12000)) {
    return res.status(400).json({ error: 'Please send a valid conversation.' });
  }
  const model = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
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
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(502).json({ error: 'Steep could not connect to the model. Try again.' });
  }
};
