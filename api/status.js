module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ connected: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) });
};
