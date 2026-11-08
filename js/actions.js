import './press.js';
import { downloadImage } from './image-gen.js';
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = '/css/responses.css'; document.head.append(css);
let speaking;
export function stopSpeech() {
  if (speaking) { window.speechSynthesis?.cancel(); speaking.setAttribute('aria-pressed', 'false'); speaking = null; }
}
window.addEventListener('pagehide', stopSpeech);
export function responseActions(body, message, api) {
  const row = document.createElement('div'); row.className = 'response-actions';
  row.setAttribute('aria-label', 'Response actions');
  const note = document.createElement('span'); note.className = 'action-note'; note.setAttribute('role', 'status');
  function tell(text) { note.textContent = text; setTimeout(() => { note.textContent = ''; }, 2400); }
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
  button('Retry response', '<path d="M20 7v6h-6M4 17v-6h6M6 6a8 8 0 0 1 14 7M18 18a8 8 0 0 1-14-7"/>', async () => {
    if (api.busy()) return;
    const chat = api.current(), index = chat.messages.indexOf(message);
    let end = index - 1;
    while (end >= 0 && chat.messages[end].role !== 'user') end--;
    if (end < 0) { tell('No message to retry yet.'); return; }
    const history = chat.messages.slice(0, end + 1).slice(-99).map(({ role, content }) => ({ role, content }));
    api.notice(''); api.lock(true);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      const data = await response.json();
      if (api.current() !== chat) return;
      if (!response.ok) throw new Error(data.error || 'Could not regenerate. Try again.');
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Steep returned an empty reply. Try again.');
      message.content = data.reply; message.feedback = null; api.save();
    } catch (e) { if (api.current() === chat) api.notice(e.message || 'Could not regenerate. Try again.'); }
    finally { api.lock(false); }
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
