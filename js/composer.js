// Decorative icons only; the existing form, textarea and submit button stay intact.
const form = document.getElementById('composer');
const input = document.getElementById('prompt');
const send = document.getElementById('send');
function decoration(path) {
  const icon = document.createElement('span');
  icon.className = 'composer-decoration';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
  return icon;
}
form.insertBefore(decoration('<path d="M12 5v14M5 12h14"/>'), input);
form.insertBefore(decoration('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6"/>'), send);
send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/></svg>';
