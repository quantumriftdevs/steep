module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: 'Sign-in is not configured yet. Please try again later.' });
  return res.status(200).json({ supabaseUrl, supabaseKey });
};
