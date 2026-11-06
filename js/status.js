export function checkConnection() {
  const status = document.getElementById('connection');
  const circle = '<svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>';
  const checked = '<svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
  fetch('/api/status', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(data => { status.innerHTML = data.connected ? checked + ' Key configured' : circle + ' Not connected'; })
    .catch(() => { status.innerHTML = circle + ' Connection unknown'; });
}
