export function setupProfile() {
  const avatar = document.getElementById('profile-avatar');
  function update() {
    let name = '';
    try { name = localStorage.getItem('steep-name') || ''; } catch {}
    const words = name.trim().split(/\s+/).filter(Boolean);
    avatar.textContent = words.slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase() || 'S';
  }
  update();
  document.addEventListener('submit', event => {
    if (event.target.matches('.name-form')) queueMicrotask(update);
  });
  window.addEventListener('storage', event => { if (event.key === 'steep-name') update(); });
}
export function recentLabel(button, title) {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('app-icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M20 11a8 8 0 0 1-8 8H5l2-3a8 8 0 1 1 13-5Z');
  icon.append(path);
  const label = document.createElement('span');
  label.textContent = title;
  button.append(icon, label);
}
