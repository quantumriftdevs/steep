import { getSession, onAuthChange } from './auth.js';
// Pending actions live only in this tab; no auth/session protocol changes.
let pending = null;
export const pendingGuest = () => !!pending;
export function requireAuth(action) {
  if (getSession()) return true;
  pending ||= action;
  window.dispatchEvent(new Event('steep:auth-required'));
  return false;
}
onAuthChange(session => {
  if (!session || !pending) return;
  // Store/account reset listeners finish before replaying exactly once.
  queueMicrotask(() => {
    if (!getSession() || !pending) return;
    const action = pending; pending = null; action();
  });
});
// Settings saves and voice transcription also require an account.
document.addEventListener('click', event => {
  if (getSession()) return;
  const link = event.target.closest('a[href$="settings.html"]');
  const mic = event.target.closest('#send[aria-label="Record voice note"]');
  if (!link && !mic) return;
  event.preventDefault(); event.stopImmediatePropagation();
  requireAuth(() => { if (link) location.href = link.href; else document.getElementById('send')?.click(); });
}, true);
