// Page output is deliberately separate from the protected document detector.
const { randomBytes } = require('crypto');
const things = /\b(?:landing\s+page|web\s*page|web\s*site|home\s*page|calculator|quiz|game|counter|portfolio(?:\s+page)?|(?:web\s+|small\s+)?app)\b/i;
const explicit = /\b(?:landing\s+page|web\s*page|web\s*site|home\s*page|portfolio\s+page|(?:web\s+|small\s+)?app)\b|\bas\s+(?:a\s+)?(?:page|site|app)\b/i;
const build = /(?:^|[.!?;\n])\s*(?:(?:please|can you|could you|would you|will you)\s+)*(?:make|build|create|design|generate|develop|code|write)\b[^.!?;\n]{0,300}/i;
exports.pageIntent = messages => {
  const index = messages.findLastIndex(m => m.role === 'user');
  const text = messages[index]?.content || '';
  if (/\b(?:do not|don't|never)\s+(?:make|build|create|design|generate|preview)\b|\b(?:explain|tell me|how (?:do|can|to)|what is)\b/i.test(text)) return null;
  const clause = text.match(build)?.[0] || '';
  const asPage = /\b(?:show|send|give|turn|convert|render)\b[^.!?;\n]{0,220}\bas\s+(?:a\s+)?(?:web\s*page|page|site|app)\b/i.test(text);
  const preview = /^(?:please\s+)?(?:(?:can|could) you\s+)?(?:show|give|make|create|build)?\s*(?:me\s+)?(?:a\s+)?(?:live\s+)?preview\b/i.test(text) || /\b(?:show|give)\s+(?:me\s+)?a\s+(?:live\s+)?preview\b/i.test(text);
  const previous = messages.slice(0, index).reverse().find(m => m.role === 'assistant');
  const refine = /Web page preview:/i.test(previous?.content || '') && /^(?:please\s+)?(?:make it\b|refine\b|improve\b|redesign\b|change\b|add\b|remove\b|update\b|use\b)/i.test(text);
  if (!(clause && things.test(clause)) && !asPage && !preview && !refine) return null;
  // Document intent wins ambiguous calculator/game/PDF requests; explicit web output may override it.
  const clearPage = explicit.test(clause) || asPage || (preview && !/\b(?:pdf|docx|document|file)\b/i.test(text));
  if (/\b(?:pdf|docx|word document|markdown|csv|txt|document)\b/i.test(text) && !clearPage) return null;
  const title = (things.exec(text)?.[0] || (refine ? 'Updated web page' : 'Web page')).replace(/\b\w/g, c => c.toUpperCase()).slice(0,200);
  return { title, explicit: clearPage, marker: 'STEEP_PAGE_' + randomBytes(16).toString('hex') };
};
exports.pageInstruction = p => '\n\nPAGE OUTPUT (use this instead of a normal text-only answer): Build ONE complete valid self-contained HTML document for the user. Include <!doctype html>, html, head, viewport meta and body. ALL CSS and JavaScript must be inline. NO external resources whatsoever: no CDNs, imports, web fonts, external images, network calls, frames or dependencies. Data URIs are allowed. Use system fonts, inline SVG or CSS artwork. Mobile-first for phone users, responsive layouts, accessible labels and contrast, keyboard controls, modern typography, generous spacing, coherent color palette, polished hover/press/focus states, and real useful content, never lorem ipsum. Make requested controls actually work locally. Do not use localStorage, cookies, alert, eval or external form submission: the preview has an opaque sandbox origin and no network access. For refinements, rebuild a fresh complete page based on the conversation, never a diff. Keep the HTML below 500000 characters. Accompany it with one short friendly chat sentence, no HTML or code in that sentence. Then emit these exact standalone lines, with no code fences:\n<<<' + p.marker + ':TITLE>>> a concise descriptive page title\n<<<' + p.marker + ':BEGIN>>>\n(the entire HTML document)\n<<<' + p.marker + ':END>>>\nNever repeat these reserved markers inside the HTML.';
exports.pageResult = (p, reply) => {
  const fallback = "I couldn't prepare that preview. Please ask me to build the page again.";
  const clean = value => /<\/?[a-z][^>]*>|<!doctype|```\s*html/i.test(value) ? fallback : value.replace(/<<<STEEP_PAGE_[^\n]*|<<STEEP-PAGE-[^\n]*/g, '').trim();
  if (!p) return { reply: clean(reply) || fallback };
  const begin = '<<<' + p.marker + ':BEGIN>>>', end = '<<<' + p.marker + ':END>>>';
  const titleMark = '<<<' + p.marker + ':TITLE>>>';
  const lines = reply.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.indexOf(begin), finish = lines.indexOf(end);
  const titleLine = lines.find(line => line.startsWith(titleMark));
  const html = start >= 0 && finish > start ? lines.slice(start + 1, finish).join('\n').trim() : '';
  const prose = start >= 0 ? lines.slice(0, start).filter(line => !line.startsWith(titleMark)).join('\n') : reply;
  const valid = html.length <= 500000 && /^<!doctype html>\s*<html\b[\s\S]*<head\b[\s\S]*<body\b[\s\S]*<\/html>$/i.test(html);
  if (!valid || lines.filter(line => line === begin).length !== 1 || lines.filter(line => line === end).length !== 1) return { reply: clean(prose) || fallback };
  return { pageIntent: true, pageTitle: (titleLine?.slice(titleMark.length).replace(/<[^>]*>/g, '').trim() || p.title).slice(0,200), pageHtml: html, reply: clean(prose) || 'Your web page is ready to preview.' };
};
