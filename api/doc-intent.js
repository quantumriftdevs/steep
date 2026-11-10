// Explicit output requests only: no classifier or extra model call.
const { randomBytes } = require('crypto');
exports.documentIntent = messages => {
  const text = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  if (/\b(?:do not|don't|no|without)\s+(?:create |generate |send |export )?(?:a |an |any )?(?:document|file|pdf|docx|export)\b/i.test(text)) return null;
  // A format mentioned in ordinary discussion is not an output request.
  const clause = text.match(/(?:^|[.!?;\n]|\band\b|\bthen\b)\s*(?:(?:please|can you|could you|would you|will you)\s+)*(?:create|make|generate|write|give|send|provide|return|deliver|prepare|produce|save|download|export|convert|turn)\b[^\n.!?;]{0,240}/i)?.[0];
  const wanted = text.match(/(?:^|[.!?;\n])\s*(?:i want|i need|i would like|i'd like)\s+(?:a |an )?(?:document|file|pdf|docx|word document|word doc|markdown file|csv file)\b[^\n.!?;]{0,120}/i)?.[0];
  const request = clause || wanted;
  if (!request) return null;
  const formats = /\b(?:pdf|docx|word(?:\s+(?:doc(?:ument)?|file))?|markdown|md|plain\s+text|txt|html|csv)\b/i;
  const output = request.match(/\b(?:as|in|to)\s+(?:a |an )?(pdf|docx|word(?:\s+(?:doc(?:ument)?|file))?|markdown|md|plain\s+text|txt|html|csv)\b/i);
  const file = /\b(?:document|file|pdf|docx|word\s+doc(?:ument)?)\b/i.test(request);
  // Raw CSV/Markdown/HTML is a file only when explicitly exported or named as output.
  if (!file && !output && !/^\W*(?:please\s+)?export\b/i.test(request)) return null;
  const named = (output?.[1] || request.match(formats)?.[0] || 'pdf').toLowerCase();
  const format = /^word|docx/.test(named) ? 'docx' : /markdown|^md$/.test(named) ? 'md' : /plain|txt/.test(named) ? 'txt' : named;
  const marker = 'STEEP_DOCUMENT_' + randomBytes(16).toString('hex');
  return { format, marker, filename: 'steep-document.' + format };
};
exports.documentInstruction = d => '\n\nDOCUMENT OUTPUT: Reply with a short lead-in, then exactly one block using these exact delimiter lines:\n<<<' + d.marker + ':BEGIN>>>\nfilename: descriptive-name.' + d.format + '\n(document body)\n<<<' + d.marker + ':END>>>\nUse ' + (d.format === 'csv' ? 'raw CSV' : ['txt','md'].includes(d.format) ? (d.format === 'txt' ? 'plain text' : 'Markdown') : 'Markdown') + ' for the body. No outer code fence. Include all useful content and research citations in the body. Do not emit image-generation directives in the document. Treat these delimiters as reserved, never reproduce them in the body.';
exports.documentMetadata = (d, reply) => {
  if (!d) return null;
  const start = reply.indexOf('<<<' + d.marker + ':BEGIN>>>');
  const end = reply.indexOf('<<<' + d.marker + ':END>>>', start);
  const first = start < 0 || end < 0 ? '' : reply.slice(start + d.marker.length + 12, end).trimStart().split('\n')[0];
  const title = first.replace(/^filename:\s*/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-').slice(0,80);
  return { ...d, filename: (/^filename:/i.test(first) && title ? title : 'steep-document') + '.' + d.format };
};
