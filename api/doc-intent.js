// Explicit output requests only: no classifier or extra model call.
const { randomBytes } = require('crypto');
exports.documentIntent = messages => {
  const text = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  if (/\b(?:do not|don't|no|without)\s+(?:create |generate |send |export )?(?:a |an |any )?(?:document|file|pdf|docx|export)\b/i.test(text)) return null;
  // Keep format recognition local to an output request or missing-file clause.
  const formats = /\b(?:pdf|docx|word(?:\s+(?:doc(?:ument)?|file))?|markdown|md|plain\s+text|txt|html|csv)\b/i;
  const follow = text.match(/(?:^|[,.!?;\n]|\band\b|\bthen\b)\s*(?:(?:where\s+is|where['’]s|(?:i\s+)?(?:don't|do not|can't|cannot)\s+(?:see|find)|(?:you\s+)?(?:didn't|did not|haven't|have not)\s+(?:send|sent|attach|attached|provide|provided|deliver|delivered))\b[^\n.!?;]{0,80}?\b(?:document|file|pdf|docx|word\s+doc(?:ument)?|markdown|md|plain\s+text|txt|html|csv)\b|(?:the\s+|my\s+)?(?:document|file|pdf|docx|word\s+doc(?:ument)?|markdown|md|plain\s+text|txt|html|csv)\s+(?:is\s+)?missing\b)/i)?.[0];
  const clause = text.match(/(?:^|[,.!?;\n]|\band\b|\bthen\b)\s*(?:(?:please|can you|could you|would you|will you)\s+)*(?:create|make|generate|write|give|send|provide|return|deliver|prepare|produce|save|download|export|convert|turn|draft|compile)\b[^\n,.!?;]{0,240}/i)?.[0];
  const wanted = text.match(/(?:^|[,.!?;\n])\s*(?:i want|i need|i would like|i'd like)\s+(?:a |an )?(?:document|file|pdf|docx|word document|word doc|markdown file|csv file)\b[^\n,.!?;]{0,120}/i)?.[0];
  const request = follow || clause || wanted;
  if (!request) return null;
  const output = request.match(/\b(?:as|in|to)\s+(?:a |an )?(pdf|docx|word(?:\s+(?:doc(?:ument)?|file))?|markdown|md|plain\s+text|txt|html|csv)\b/i);
  const file = /\b(?:document|file|pdf|docx|word\s+doc(?:ument)?)\b/i.test(request);
  // Bare Markdown/CSV/HTML names count only inside the matched output clause.
  const namedOutput = !!clause && /\b(?:markdown|csv|html)\b/i.test(request);
  if (!follow && !file && !output && !namedOutput && !/^\W*(?:please\s+)?export\b/i.test(request)) return null;
  const named = (output?.[1] || request.match(formats)?.[0] || 'pdf').toLowerCase();
  const format = /^word|docx/.test(named) ? 'docx' : /markdown|^md$/.test(named) ? 'md' : /plain|txt/.test(named) ? 'txt' : named;
  const marker = 'STEEP_DOCUMENT_' + randomBytes(16).toString('hex');
  return { format, marker, filename: 'steep-document.' + format };
};
exports.documentInstruction = d => '\n\nDOCUMENT OUTPUT: Reply with a short lead-in, then exactly one block using these exact delimiter lines:\n<<<' + d.marker + ':BEGIN>>>\nfilename: descriptive-name.' + d.format + '\n(document body)\n<<<' + d.marker + ':END>>>\nUse ' + (d.format === 'csv' ? 'raw CSV' : ['txt','md'].includes(d.format) ? (d.format === 'txt' ? 'plain text' : 'Markdown') : 'Markdown') + ' for the body. No outer code fence. Include all useful content and research citations in the body. Do not emit image-generation directives in the document. Treat these delimiters as reserved, never reproduce them in the body. The document content must be plain readable text only; never output base64, data URIs, or encoded file contents. Never claim a file is attached. You cannot attach or encode files: Steep automatically converts the marked text into the downloadable file.';
exports.documentMetadata = (d, reply) => {
  if (!d) return null;
  const begin = '<<<' + d.marker + ':BEGIN>>>', finish = '<<<' + d.marker + ':END>>>';
  const start = reply.indexOf(begin), end = reply.indexOf(finish, start + begin.length);
  if (start < 0 || end < 0) return null;
  const block = reply.slice(start + begin.length, end).trim();
  if (!block.replace(/^filename:[^\n]*(?:\n|$)/i, '').trim()) return null;
  const first = block.split('\n')[0];
  const title = first.replace(/^filename:\s*/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-').slice(0,80);
  return { ...d, filename: (/^filename:/i.test(first) && title ? title : 'steep-document') + '.' + d.format };
};
