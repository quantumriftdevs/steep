import './press.js';
import { profileName, saveProfileName } from './profile.js';
import { checkConnection } from './status.js';
import { setupProfile } from './sidebar.js';
import { onAuthChange, logout, maskEmail, getSession } from './auth.js';
const $ = id => document.getElementById(id);
const feedback = text => { $('settings-feedback').hidden = false; $('settings-feedback').textContent = text; };
onAuthChange(session => {
  if (!session) { location.replace('/app/'); return; }
  $('account-email').textContent = maskEmail(session.user.email); showName();
});
$('auth-logout').addEventListener('click', logout);
function readName() { return profileName(); }
function showName() {
  const name = readName();
  $('account-name').textContent = name || 'Your Steep space';
  $('settings-name').value = name;
}
function closePanel(id) {
  $(id).hidden = true;
  document.querySelector('[aria-controls="' + id + '"]').setAttribute('aria-expanded', 'false');
}
document.querySelectorAll('.settings-row').forEach(row => {
  row.addEventListener('click', () => {
    const panel = $(row.getAttribute('aria-controls'));
    panel.hidden = !panel.hidden;
    row.setAttribute('aria-expanded', String(!panel.hidden));
    if (panel.id === 'profile-panel' && !panel.hidden) $('settings-name').focus();
  });
});
$('profile-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('settings-name').value.trim().slice(0, 60);
  if (!name) { feedback('Pop in a name first.'); return; }
  try {
    saveProfileName(name); showName(); closePanel('profile-panel');
    feedback('Got it. Steep will call you ' + name + '.');
  } catch { feedback('This browser could not save your name. Please try again.'); }
});
$('cancel-clear').addEventListener('click', () => {
  closePanel('clear-panel'); feedback('Your chats are staying right here.');
});
$('confirm-clear').addEventListener('click', () => {
  try {
    const owner = getSession()?.user?.id;
    if (!owner) { feedback('Please sign in before clearing this browser’s chat cache.'); return; }
    const key = 'steep-conversations-v2:' + owner;
    const cached = JSON.parse(localStorage.getItem(key) || '{}');
    if (Object.keys(cached.pending || {}).length) {
      feedback('Some chats are still syncing. Wait for sync to finish before clearing this browser’s cache.'); return;
    }
    localStorage.setItem(key, JSON.stringify({ chats: [], pending: {}, migrated: true }));
    closePanel('clear-panel');
    feedback('Downloaded chat cache cleared in this browser. Synced chats will reload when you open the app. Nothing was deleted from your account.');
  } catch { feedback('This browser could not clear its chat cache. Please try again.'); }
});
showName(); setupProfile();
// One request per settings page load, never polling.
checkConnection();
