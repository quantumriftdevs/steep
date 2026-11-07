// Delegated touch/mouse feedback; no action or geometry changes.
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = '/css/press.css'; document.head.append(css);
const targets = '.glass-disc,.chat-pill button,.chat-options button,.settings-row,.back-link,#send,.profile-avatar,.new-chat,#conversations button,.side-nav,.response-actions button';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let pressed;
function release() { if (pressed) pressed.classList.remove('is-pressed'); pressed = null; }
document.addEventListener('pointerdown', event => {
  release();
  if (reduced.matches || event.button !== 0) return;
  const target = event.target.closest(targets);
  if (target && !target.disabled) { pressed = target; target.classList.add('is-pressed'); }
}, { passive: true });
document.addEventListener('pointerup', release, { passive: true });
document.addEventListener('pointercancel', release, { passive: true });
window.addEventListener('blur', release);
window.addEventListener('pagehide', release);
reduced.addEventListener('change', release);
