// Explicit task commands only. Document/page routing always has priority.
const { randomBytes } = require('crypto');
const latest = messages => [...messages].reverse().find(m => m.role === 'user')?.content || '';
function baseTaskIntent(messages, blocked = false, now = Date.now()) {
  const raw = latest(messages).trim().replace(/[’]/g, "'");
  // Conservative ambiguity rule: leave output/artifact language to existing paths.
  if (blocked || raw.length > 12000 || /\b(?:documents?|files?|pdf|docx|word|markdown|html|csv|pages?|websites?|landing\s+page)\b/i.test(raw)) return null;
  const text = raw.replace(/^(?:(?:please|can you|could you|would you|will you)\s+)+/i, '').replace(/[.!?]+$/, '').trim();
  if (/^(?:what(?:'s| is) on my (?:list|tasks)|my tasks|what do I have to do|show (?:me )?my tasks)$/i.test(text)) return { type: 'list' };
  if (/^(?:remind me for|set (?:a )?reminder (?:for|to))\b/i.test(text) && /\b(?:maybe|might|someday|perhaps|eventually|wish|hypothetical)\b/i.test(text)) return null;
  const finish = phrase => { phrase = phrase.trim().replace(/[.!]+$/, '').trim(); return phrase && phrase.length <= 2000 ? phrase : null; };
  let match = text.match(/^(?:done with|I finished|I completed|check off|complete my)\s+(.+)$/i) || text.match(/^mark\s+(.+?)\s+(?:as\s+)?done$/i);
  if (match) { const phrase = finish(match[1]); return phrase ? { type: 'complete', phrase } : null; }
  match = text.match(/^delete my\s+(.+)$/i) || text.match(/^(?:remove|delete)\s+(.+?)\s+from my (?:list|tasks)$/i);
  if (match) { const phrase = finish(match[1]); return phrase ? { type: 'delete', phrase } : null; }
  match = text.match(/^(?:remind me (?:to|about|of|for)|set (?:a )?reminder (?:for|to))\s+(.+)$/i) || text.match(/^add\s+(.+?)\s+to my (?:list|tasks)$/i) || text.match(/^don't let me forget\s+(?:to\s+)?(.+)$/i) || text.match(/^(?:make|create)\s+(?:a\s+)?task(?:\s+to|\s*:)?\s+(.+)$/i) || text.match(/^todo\s*:\s*(.+)$/i);
  if (match && finish(match[1])) return { type: 'add', phrase: finish(match[1]) };
  // New noun-style reminder anchors require a due date; keep speculative requests out.
  match = text.match(/^(?:remind me for|reminder for)\s+(.+)$/i);
  if (match && finish(match[1]) && exports.parseDue(match[1], now) &&
      !/\b(?:maybe|might|someday|perhaps|eventually|wish|hypothetical)\b/i.test(match[1])) return { type: 'add', phrase: finish(match[1]) };
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
  return { taskIntent: 'add', taskTitle: name, taskNotes: notes || null, taskDue: exports.validDue(result.data.due), reply: "I couldn't save that task - please try again." };
};
exports.taskSuggestionResult = (reply, protocol) => {
  const result = block(reply, protocol), name = title(result.data?.title);
  return { reply: result.reply || 'What would you like to work on next?', ...(name ? { taskSuggest: { title: name, due: exports.validDue(result.data.due) } } : {}) };
};
exports.taskSuggestionEligible = (messages, now = Date.now()) => {
  const text = latest(messages).replace(/[‘’]/g, "'").trim();
  // Bare capital-I forms are a defensive safety net, never case-insensitive.
  const commitment = /\b(?:I'll|I will|I need to|I must|I'm going to)\s+\w/i.test(text) || /\bIll\s+\w/.test(text) || /\bIm\s+\w/.test(text);
  const eventWithDue = /\b(?:meeting|appointment|call|interview|exam|deadline|flight|class|session|date)\b/i.test(text) && exports.parseDue(text, now) !== null;
  return !/[?]/.test(text) && (commitment || eventWithDue) && !/\b(?:maybe|might|someday|perhaps|eventually|wish|hypothetical)\b/i.test(text);
};

// Lagos has a fixed UTC+01:00 offset. UTC getters below represent Lagos wall time,
// not the host timezone. Unqualified days use 09:00; tonight uses 20:00.
exports.parseDue = (text, now = Date.now()) => {
  if (typeof text !== 'string') return null;
  const instant = new Date(now).getTime(), hourMs = 3600000, dayMs = 86400000;
  if (!Number.isFinite(instant)) return null;
  const wallNow = instant + hourMs, local = new Date(wallNow), raw = text.toLowerCase();
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const format = wall => Number.isFinite(new Date(wall).getTime()) ? new Date(wall).toISOString().slice(0,19) + '+01:00' : null;
  const time = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || raw.match(/\b(\d{1,2}):(\d{2})\b/) || raw.match(/\b(?:at|by)\s+(\d{1,2})\b/);
  let hour = /\btonight\b/.test(raw) ? 20 : 9, minute = 0;
  if (time) {
    hour = Number(time[1]); minute = Number(time[2] || 0);
    if (minute > 59 || (time[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (time[3]) hour = hour % 12 + (time[3] === 'pm' ? 12 : 0);
    // Bare at/by 1-7 means afternoon; explicit AM/PM and 24-hour clocks stay exact.
    else if (/^(?:at|by)\s/i.test(time[0]) && hour >= 1 && hour <= 7) hour += 12;
  }
  const clock = hour * hourMs + minute * 60000;
  const minutes = raw.match(/\bin\s+(\d+)\s+(?:minutes?|mins?)\b/);
  if (minutes) {
    const n = Number(minutes[1]);
    return Number.isSafeInteger(n) && n <= 36500 ? format(wallNow + n * 60000) : null;
  }
  const relative = raw.match(/\bin\s+(\d+)\s+(days?|hours?|weeks?)\b/);
  if (relative) {
    const n = Number(relative[1]), unit = relative[2];
    if (!Number.isSafeInteger(n) || n > 36500) return null;
    // Hours are elapsed time; days/weeks are calendar dates at the chosen clock.
    return format(unit.startsWith('hour') ? wallNow + n * hourMs : midnight + n * dayMs * (unit.startsWith('week') ? 7 : 1) + clock);
  }
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const weekday = raw.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekday) {
    let delta = (weekdays.indexOf(weekday[2]) - local.getUTCDay() + 7) % 7;
    if (midnight + delta * dayMs + clock < wallNow) delta += 7;
    // 'next Friday' is one week AFTER the nearest still-upcoming Friday.
    if (weekday[1]) delta += 7;
    return format(midnight + delta * dayMs + clock);
  }
  if (/\bnext\s+week\b/.test(raw)) return format(midnight + ((8-local.getUTCDay()) % 7 || 7) * dayMs + clock);
  if (/\btomorrow\b/.test(raw)) return format(midnight + dayMs + clock);
  if (/\b(today|tonight)\b/.test(raw)) return format(midnight + clock);
  const months = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const md = raw.match(new RegExp('\\b('+months+')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b'));
  const dm = !md && raw.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+('+months+')\\.?(?:,?\\s+(\\d{4}))?\\b'));
  if (md || dm) {
    const m = md || dm, name = md ? m[1] : m[2], day = Number(md ? m[2] : m[1]);
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(name.slice(0,3));
    let year = Number(m[3] || local.getUTCFullYear());
    if (!m[3] && Date.UTC(year,month,day) + clock < wallNow) year++;
    if (day < 1 || day > new Date(Date.UTC(year,month+1,0)).getUTCDate()) return null;
    return format(Date.UTC(year,month,day) + clock);
  }
  // A time without a date means its next occurrence (today or tomorrow).
  if (time) return format(midnight + clock + (midnight + clock < wallNow ? dayMs : 0));
  return null;
};

// Deterministic secretary commands. All routing keeps artifact precedence.
exports.recurrence = text => {
  if (/\b(?:every\s+2\s+weeks|biweekly)\b/i.test(text)) return 'biweekly';
  const monthly = String(text).match(/\b(?:monthly|every\s+month)(?:\s+on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?)?\b/i);
  if (monthly) return monthly[1] ? (Number(monthly[1]) >= 1 && Number(monthly[1]) <= 31 ? 'monthly:' + Number(monthly[1]) : null) : 'monthly';
  const m = String(text).match(/\bevery\s+(day|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  return word === 'day' ? 'daily' : word === 'weekday' ? 'weekdays' : 'weekly:' + ({monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,sunday:7}[word]);
};
exports.taskIntent = (messages, blocked = false, now = Date.now()) => {
  const raw = latest(messages).trim();
  if (blocked || raw.length > 12000 || /\b(?:documents?|files?|pdf|docx|word|markdown|html|csv|pages?|websites?|landing\s+page)\b/i.test(raw)) return null;
  const text = raw.replace(/^(?:(?:please|can you|could you|would you|will you)\s+)+/i, '').replace(/[.!?]+$/, '').trim();
  const query = text.match(/^(?:what(?:'s| is) due (this week|tomorrow)|what(?:'s| is) overdue|what do I have (tomorrow)|what did I finish (this week|this month))$/i);
  if (query) return {type:'list', query: /finish/i.test(text) ? 'finished:' + (query[3] === 'this month' ? 'month' : 'week') : /overdue/i.test(text) ? 'overdue' : (query[1] || query[2]) === 'tomorrow' ? 'tomorrow' : 'week'};
  const checkin = text.match(/^(?:ask me|check (?:on me|in with me) about)\s+(.+)$/i);
  if (checkin && !/\b(?:maybe|might|someday|perhaps|eventually|wish|hypothetical)\b/i.test(checkin[1])) return {type:'add', phrase:checkin[1], checkin:true, recurrence:exports.recurrence(checkin[1])};
  const move = text.match(/^(?:move|reschedule|push|change)\s+(?:my\s+)?(.+?)\s+to\s+(.+)$/i);
  if (move) return {type:'reschedule', phrase:move[1], due:exports.parseDue(move[2], now)};
  const snooze = text.match(/^snooze\s+(?:my\s+)?(.+)$/i);
  if (snooze) return {type:'reschedule', phrase:snooze[1], due:new Date(now + 3600000).toISOString()};
  const result = baseTaskIntent(messages, blocked, now);
  const bare = text.match(/^remind me\s+(?!to\b|about\b|of\b)(.+)$/i);
  if (bare && result?.type !== 'add') {
    const due = exports.parseDue(bare[1], now);
    if (due) return {type:'clarify', due};
  }
  if (result?.type === 'add' && /^(?:(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|today|tonight|tomorrow|next week|in \d+ (?:minutes?|mins?|hours?|days?|weeks?))(?:\s+(?:at|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?$/i.test(result.phrase)) {
    const due = exports.parseDue(result.phrase,now); if (due) return {type:'clarify',due};
  }

  if (result?.type === 'add') result.recurrence = exports.recurrence(result.phrase);
  return result;
};
exports.pendingAnswer = (text, pending, blocked = false, now = Date.now()) => {
  if (blocked || !exports.validDue(pending?.due) || !Number.isFinite(pending?.at) || now - pending.at > 600000 || now < pending.at) return null;
  const title = String(text).trim();
  if (!title || [...title].length > 120 || title.split(/\s+/).length > 16 || /[?\n]/.test(title)) return null;
  if (exports.taskIntent([{role:'user',content:title}], false, now) || /\b(?:hello|hi|thanks|thank|never mind|nevermind|cancel|forget it|instead|weather|what|why|how|explain|tell me|write|generate|create|make|search|find|maybe|might|someday|perhaps|eventually|wish|hypothetical|documents?|files?|pdf|docx|word|markdown|html|csv|pages?|websites?)\b/i.test(title)) return null;
  // A short action phrase is an answer; ordinary conversation drops pending state.
  if (/^(?:I(?:['’]m| am| think| feel| have)|let['’]s|actually|anyway|can you|could you|we |it |that |the weather)\b/i.test(title)) return null;
  return title.replace(/^to\s+/i,'').replace(/[.!]+$/, '').trim();
};
// Remove only recognized scheduling suffixes, never executable markup.
exports.cleanTaskTitle = text => String(text).replace(/\s+\b(?:monthly|biweekly|every\s+(?:2\s+weeks|month|day|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b.*$/i,'').replace(/\s+\b(?:(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|today|tomorrow|tonight|later|next week|in \d+ (?:minutes?|mins?|hours?|days?|weeks?)|at \d{1,2}|by \d{1,2})\b.*$/i,'').trim();
exports.checkinQuestion = text => {
  const name = exports.cleanTaskTitle(text).replace(/^about\s+/i,'').replace(/[?.!]+$/,'').trim();
  if (!name || [...name].length > 170) return null;
  if (/^how\s+/i.test(name)) return name.replace(/^how\s+(.+?)\s+went$/i,'How did $1 go').replace(/^how/i,'How') + '?';
  return 'How are things with ' + name + '?';
};
exports.recurrenceDue = (phrase, recurrence, now = Date.now()) => {
  const parsed = exports.parseDue(phrase, now);
  if (!recurrence?.startsWith('monthly:')) return parsed;
  const day = Number(recurrence.split(':')[1]), wall = new Date((parsed ? Date.parse(parsed) : now) + 3600000);
  const hour = parsed ? wall.getUTCHours() : 9, minute = parsed ? wall.getUTCMinutes() : 0;
  let month = wall.getUTCMonth(), year = wall.getUTCFullYear(), due;
  do { due = Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate()),hour,minute)-3600000; month++; } while (due <= now);
  return new Date(due).toISOString();
};
