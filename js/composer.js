import { createVoice } from './voice.js';

// Decorative plus/mic; text submits still use the original app handler.
const form = document.getElementById('composer');
const input = document.getElementById('prompt');
const send = document.getElementById('send');
function decoration(path) {
  const icon = document.createElement('span'); icon.className = 'composer-decoration';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
  return icon;
}
form.insertBefore(decoration('<path d="M12 5v14M5 12h14"/>'), input);
form.insertBefore(decoration('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6"/>'), send);
send.innerHTML = '<svg class="send-wave" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/></svg><svg class="send-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4M6 10l6-6 6 6"/></svg><svg class="send-stop" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>';
const status = document.createElement('span'); status.className = 'voice-status'; status.hidden = true;
status.setAttribute('role', 'status');
status.innerHTML = '<span class="voice-dot" aria-hidden="true"></span><span class="voice-label"></span><span class="voice-timer" aria-live="off"></span><span class="voice-bars" aria-hidden="true"></span>';
form.insertBefore(status, send);
const label = status.querySelector('.voice-label'), timer = status.querySelector('.voice-timer');
[8, 15, 22, 12, 26, 18, 10, 21, 14, 24, 11, 19, 26, 15, 9, 20].forEach((height, index) => {
  const bar = document.createElement('i'); bar.style.setProperty('--height', height + 'px');
  bar.style.setProperty('--delay', (index % 5) * -.16 + 's'); status.querySelector('.voice-bars').append(bar);
});
// Error notices go ABOVE the pill, never below the input.
const notice = document.createElement('p'); notice.className = 'voice-error'; notice.hidden = true;
notice.setAttribute('role', 'alert'); form.before(notice);
let voiceState = 'idle';
function syncIcon() {
  const active = voiceState !== 'idle', hasText = input.value.length > 0;
  send.classList.toggle('has-text', hasText);
  send.type = active || !hasText ? 'button' : 'submit';
  send.setAttribute('aria-label', voiceState === 'recording' ? 'Stop recording' : active ? 'Transcribing voice note' : hasText ? 'Send message' : 'Record voice note');
}
const voice = createVoice({
  onState(state) {
    voiceState = state; const active = state !== 'idle';
    form.classList.toggle('voice-active', active); form.classList.toggle('voice-recording', state === 'recording');
    input.disabled = active; send.disabled = state === 'requesting' || state === 'transcribing';
    status.hidden = !active; timer.hidden = state !== 'recording';
    label.textContent = state === 'recording' ? 'Recording' : state === 'requesting' ? 'Opening mic…' : 'transcribing…';
    syncIcon();
  },
  onTime(seconds) {
    const text = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    if (timer.textContent !== text) timer.textContent = text;
  },
  onText(text) {
    input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  },
  onError(text) { notice.textContent = text; notice.hidden = false; input.focus(); }
});
send.addEventListener('click', event => {
  if (voiceState === 'idle' && input.value.length) return;
  event.preventDefault();
  if (voiceState === 'recording') voice.stop();
  else if (voiceState === 'idle' && !send.disabled) { notice.hidden = true; voice.start(); }
});
form.addEventListener('submit', event => {
  if (voiceState !== 'idle') { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
input.addEventListener('input', () => { notice.hidden = true; syncIcon(); });
form.addEventListener('submit', () => queueMicrotask(syncIcon));
// Also cover app-driven fills (suggestions) and clears (chat switches/errors).
document.addEventListener('click', () => queueMicrotask(syncIcon));
new MutationObserver(() => {
  if (voiceState !== 'idle') voice.cancel();
  notice.hidden = true; syncIcon();
}).observe(document.getElementById('messages'), { childList: true, subtree: true });
window.addEventListener('pagehide', () => { if (voiceState !== 'idle') voice.cancel(); });
syncIcon();
