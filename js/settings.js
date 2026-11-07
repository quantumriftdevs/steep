import './press.js';
import { checkConnection } from './status.js';
import { setupProfile } from './sidebar.js';

const $ = id => document.getElementById(id);
const feedback = text => { $('settings-feedback').textContent = text; };
function readName() {
  try { return localStorage.getItem('steep-name') || ''; } catch { return ''; }
}
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
    localStorage.setItem('steep-name', name);
    showName(); closePanel('profile-panel'); feedback('Got it. Steep will call you ' + name + '.');
  } catch { feedback('This browser could not save your name. Please try again.'); }
});
$('cancel-clear').addEventListener('click', () => {
  closePanel('clear-panel'); feedback('Your chats are staying right here.');
});
$('confirm-clear').addEventListener('click', () => {
  try {
    localStorage.removeItem('steep-conversations-v1');
    closePanel('clear-panel'); feedback('Saved chats cleared. A fresh start awaits.');
  } catch { feedback('This browser could not clear your chats. Please try again.'); }
});
showName(); setupProfile();
// One request per settings page load, never polling.
checkConnection();
