// Explicit task commands only. Document/page routing always has priority.
const { randomBytes } = require('crypto');
const latest = messages => [...messages].reverse().find(m => m.role === 'user')?.content || '';
exports.taskIntent = (messages, blocked = false) => {
  const raw = latest(messages).trim().replace(/[’]/g, "'");
  // Conservative ambiguity rule: leave output/artifact language to existing paths.
  if (blocked || raw.length > 12000 || /\b(?:documents?|files?|pdf|docx|word|markdown|html|csv|pages?|websites?|landing\s+page)\b/i.test(raw)) return null;
  const text = raw.replace(/^(?:(?:please|can you|could you|would you|will you)\s+)+/i, '').replace(/[.!?]+$/, '').trim();
  if (/^(?:what(?:'s| is) on my (?:list|tasks)|my tasks|what do I have to do|show (?:me )?my tasks)$/i.test(text)) return { type: 'list' };
  const finish = phrase => { phrase = phrase.trim().replace(/[.!]+$/, '').trim(); return phrase && phrase.length <= 2000 ? phrase : null; };
  let match = text.match(/^(?:done with|I finished|I completed|check off)\s+(.+)$/i) || text.match(/^mark\s+(.+?)\s+(?:as\s+)?done$/i);
  if (match) { const phrase = finish(match[1]); return phrase ? { type: 'complete', phrase } : null; }
  match = text.match(/^(?:remove|delete)\s+(.+?)\s+from my (?:list|tasks)$/i);
  if (match) { const phrase = finish(match[1]); return phrase ? { type: 'delete', phrase } : null; }
  match = text.match(/^remind me to\s+(.+)$/i) || text.match(/^add\s+(.+?)\s+to my (?:list|tasks)$/i) || text.match(/^don't let me forget\s+(?:to\s+)?(.+)$/i) || text.match(/^(?:make|create)\s+(?:a\s+)?task(?:\s+to|\s*:)?\s+(.+)$/i) || text.match(/^todo\s*:\s*(.+)$/i);
  if (match && finish(match[1])) return { type: 'add', phrase: finish(match[1]) };
  return null;
};
exports.taskProtocol = () => {
  const marker = 'STEEP_TASK_' + randomBytes(16).toString('hex');
  return { begin: '<<<' + marker + ':BEGIN>>>', end: '<<<' + marker + ':END>>>' };
};
exports.validDue = value => {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return null;
  if (m[7] !== 'Z' && (Number(m[7].slice(1,3)) > 14 || Number(m[7].slice(4)) > 59 || (Number(m[7].slice(1,3)) === 14 && Number(m[7].slice(4)) !== 0))) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
function block(reply, protocol) {
  const lines = reply.replace(/\r\n?/g, '\n').split('\n');
  const starts = lines.filter(x => x === protocol.begin), ends = lines.filter(x => x === protocol.end);
  const a = lines.indexOf(protocol.begin), b = lines.indexOf(protocol.end);
  // Truncate malformed model metadata too; never display raw task JSON to users.
  const visible = (a < 0 ? reply : lines.slice(0, a).join('\n')).trim();
  if (starts.length !== 1 || ends.length !== 1 || b <= a || lines.slice(b+1).some(x => x.trim())) return { reply: visible, data: null };
  try { const data = JSON.parse(lines.slice(a+1,b).join('\n')); return { reply: visible, data: data && typeof data === 'object' && !Array.isArray(data) ? data : null }; } catch { return { reply: visible, data: null }; }
}
const title = value => typeof value === 'string' && value.trim() && [...value.trim()].length <= 200 ? value.trim() : null;
exports.taskAddResult = (reply, protocol) => {
  const result = block(reply, protocol), name = title(result.data?.title);
  if (!name) return { reply: "I couldn't prepare that task. Please try again with a short task title." };
  const notes = typeof result.data.notes === 'string' ? [...result.data.notes.trim()].slice(0,2000).join('') : null;
  return { taskIntent: 'add', taskTitle: name, taskNotes: notes || null, taskDue: exports.validDue(result.data.due), reply: 'Ready to add: ' + name + '.' };
};
exports.taskSuggestionResult = (reply, protocol) => {
  const result = block(reply, protocol), name = title(result.data?.title);
  return { reply: result.reply || 'What would you like to work on next?', ...(name ? { taskSuggest: { title: name, due: exports.validDue(result.data.due) } } : {}) };
};
exports.taskSuggestionEligible = messages => {
  const text = latest(messages).trim();
  return !/[?]/.test(text) && /\b(?:I'll|I’ll|I will|I need to|I must|I'm going to|I’m going to)\s+\w/i.test(text) && !/\b(?:maybe|might|someday|perhaps|eventually|wish|hypothetical)\b/i.test(text);
};
