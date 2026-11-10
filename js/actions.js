import './press.js'; import { projectRetry } from './projects-request.js'; import { projectDeleted } from './projects-context.js'; import { getSession } from './auth.js';
import { downloadImage } from './image-gen.js'; import { requireAuth } from './guest.js'; import { modelRequest, beginRequest, finishRequest } from './model-request.js';
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = '/css/responses.css'; document.head.append(css);
let speaking;
export function stopSpeech() {
  const button = speaking; speaking = null; if (button) { button.setAttribute('aria-pressed', 'false'); window.speechSynthesis?.cancel(); }
}
window.addEventListener('pagehide', stopSpeech);
export function responseActions(body, message, api) { if (Array.isArray(message.research?.sources)) { const sources = document.createElement('div'); sources.className = 'research-sources'; sources.textContent = 'Researched on the web'; message.research.sources.slice(0,3).forEach((s,i) => { try { const u = new URL(s.url); if (!['https:','http:'].includes(u.protocol)) return; const a = document.createElement('a'); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = '[' + (i+1) + '] ' + String(s.title || u.hostname).slice(0,160); sources.append(a); } catch {} }); body.append(sources); }
  const row = document.createElement('div'); row.className = 'response-actions';
  row.setAttribute('aria-label', 'Response actions');
  const note = document.createElement('span'); note.className = 'action-note'; note.setAttribute('role', 'status');
  function tell(text) { note.hidden = false; note.setAttribute('role', 'alert'); note.textContent = text; }
  function button(label, path, run) {
    const b = document.createElement('button'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
    b.disabled = api.busy(); b.onclick = run; row.append(b); return b;
  }
  async function copy() {
    try { await navigator.clipboard.writeText(message.content); tell('Copied'); }
    catch { tell('Could not copy. Please try again.'); }
  }
  button('Copy response', '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>', copy);
  button('Share response', '<path d="M12 15V3M8 7l4-4 4 4M5 13v7h14v-7"/>', async () => {
    try { if (navigator.share) await navigator.share({ text: message.content }); else await copy(); }
    catch (e) { if (e.name !== 'AbortError') tell('Could not share. Please try again.'); }
  });
  const play = button('Read response aloud', '<path d="m8 4 12 8-12 8V4Z"/>', () => {
    if (speaking === play) { stopSpeech(); return; }
    stopSpeech();
    if (!('speechSynthesis' in window)) { tell('Reading aloud is not supported here.'); return; }
    const speech = new SpeechSynthesisUtterance(message.content);
    speaking = play; play.setAttribute('aria-pressed', 'true');
    speech.onend = speech.onerror = () => { if (speaking === play) { play.setAttribute('aria-pressed', 'false'); speaking = null; } };
    window.speechSynthesis.speak(speech);
  }); play.setAttribute('aria-pressed', 'false');
  let up, down;
  function vote(value) {
    message.feedback = message.feedback === value ? null : value; api.save();
    up.setAttribute('aria-pressed', String(message.feedback === 'up'));
    down.setAttribute('aria-pressed', String(message.feedback === 'down'));
  }
  up = button('Like response', '<path d="M8 21H3V10h5m0 11h10l3-11h-8l1-6-3-2-3 8v11Z"/>', () => vote('up'));
  down = button('Dislike response', '<path d="M8 3H3v11h5M8 3h10l3 11h-8l1 6-3 2-3-8V3Z"/>', () => vote('down'));
  up.setAttribute('aria-pressed', String(message.feedback === 'up'));
  down.setAttribute('aria-pressed', String(message.feedback === 'down'));
  button('Retry response', '<path d="M20 7v6h-6M4 17v-6h6M6 6a8 8 0 0 1 14 7M18 18a8 8 0 0 1-14-7"/>', async function retry() { if (api.busy()) return;
    const chat = api.current(), index = chat.messages.indexOf(message);
    let end = index - 1;
    while (end >= 0 && chat.messages[end].role !== 'user') end--;
    if (end < 0) { tell('No message to retry yet.'); return; }
    if (!requireAuth(() => { api.adopt(chat); retry(); })) return; const controller = beginRequest(); const active = () => !controller.signal.aborted && api.current() === chat && !projectDeleted(chat); api.notice(''); api.lock(true); try { const prepared = await projectRetry(chat, chat.messages.slice(0, end + 1)); if (!active() || getSession()?.user?.id !== prepared.owner) return; if (prepared.notice) api.notice(prepared.notice); const response = await modelRequest(prepared.body, document.getElementById('error'), active, () => {}, controller.signal); const data = await response.json(); if (!response.ok) throw Error(data.error || 'Could not regenerate. Try again.'); if (!active() || getSession()?.user?.id !== prepared.owner) return; if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('Steep returned an empty reply. Try again.'); message.content = data.reply; message.feedback = null; message.research = data.research; api.save(); } catch (e) { if (e.name !== 'AbortError' && active()) api.notice(e.message || 'Could not regenerate. Try again.'); } finally { finishRequest(controller); api.lock(false); }
  });
  const images = [...body.querySelectorAll('.sg-card')];
  images.forEach((card, index) => button(images.length > 1 ? 'Download image ' + (index + 1) : 'Download image', '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>', () => downloadImage(card, tell)));
  row.append(note); body.after(row);
}
// Passive scroll events include iOS momentum scrolling; opacity keeps row space.
const thread = document.getElementById('thread');
let scrollTimer;
thread?.addEventListener('scroll', () => {
  thread.classList.add('actions-scrolling'); clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => thread.classList.remove('actions-scrolling'), 1000);
}, { passive: true });
