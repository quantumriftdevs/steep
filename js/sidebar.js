import { onAuthChange } from './auth.js';
import { profileInitial } from './profile.js';
export function setupProfile() {
  const update = () => { const avatar = document.getElementById('profile-avatar'); if (avatar) avatar.textContent = profileInitial(); };
  onAuthChange(update); window.addEventListener('steep:profile-change', update);
  window.addEventListener('storage', update); update();
}
export function pinMarker(button, pinned) {
  if (!pinned) return;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-label', 'Pinned'); icon.classList.add('row-pin');
  const path = document.createElementNS(icon.namespaceURI, 'path'); path.setAttribute('d', 'm9 3 6 0-1 6 4 4H6l4-4-1-6ZM12 13v8'); icon.append(path); button.append(icon);
}
export function recentLabel(button, title) {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true'); icon.classList.add('app-icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M20 11a8 8 0 0 1-8 8H5l2-3a8 8 0 1 1 13-5Z'); icon.append(path);
  const label = document.createElement('span'); label.textContent = title; button.append(icon, label);
}
