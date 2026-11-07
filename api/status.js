module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.status(200).json({ connected: false, reason: 'No key configured' });
  const model = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) return res.status(200).json({ connected: false, reason: 'Invalid model configuration.' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, {
      method: 'GET',
      headers: { 'x-goog-api-key': key },
      signal: controller.signal
    });
    if (response.status === 200) return res.status(200).json({ connected: true });
    const data = await response.json().catch(() => ({}));
    const cause = typeof data.error?.message === 'string' ? data.error.message.slice(0, 500) : 'Upstream request failed';
    return res.status(200).json({ connected: false, reason: `Gemini HTTP ${response.status}: ${cause}` });
  } catch (error) {
    return res.status(200).json({ connected: false, reason: controller.signal.aborted ? 'validation timed out' : 'validation request failed' });
  } finally {
    clearTimeout(timeout);
  }
};
