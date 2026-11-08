module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (groqKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${groqKey}` },
        signal: controller.signal
      });
      if (response.status === 200) return res.status(200).json({ connected: true, provider: 'groq' });
      const data = await response.json().catch(() => ({}));
      const cause = typeof data.error?.message === 'string' ? data.error.message.slice(0, 500) : 'Upstream request failed';
      return res.status(200).json({ connected: false, reason: `Groq HTTP ${response.status}: ${cause}` });
    } catch (error) {
      return res.status(200).json({ connected: false, reason: controller.signal.aborted ? 'validation timed out' : 'validation request failed' });
    } finally {
      clearTimeout(timeout);
    }
  }
  return res.status(200).json({ connected: false, reason: 'No GROQ_API_KEY configured' });
};
