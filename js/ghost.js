// Temporary conversations live only in memory, outside the saved chat list.
export function temporaryChat() {
  return { id: 'temporary', temporary: true, messages: [] };
}
export const ghostIcon = '<svg viewBox="0 0 32 36" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4 16a12 12 0 0 1 24 0v16q-3 4-6 0-3 4-6 0-3 4-6 0-3 4-6 0V16ZM11 14a2 3 0 1 0 0 6 2 3 0 1 0 0-6Zm10 0a2 3 0 1 0 0 6 2 3 0 1 0 0-6Z"/></svg>';
export function ghostEmpty() {
  const empty = document.createElement('section');
  empty.className = 'ghost-empty';
  empty.innerHTML = ghostIcon + '<p>This chat vanishes when you close it.</p>';
  return empty;
}
export function setupGhost() {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/css/glass.css'; document.head.append(css);
  const menu = document.getElementById('open-menu');
  menu.classList.add('glass-disc');
  menu.querySelector('path').setAttribute('d', 'M4 6h16M4 12h11M4 18h6');
  const ghost = document.createElement('button');
  ghost.id = 'ghost-chat'; ghost.type = 'button'; ghost.className = 'icon glass-disc';
  ghost.setAttribute('aria-label', 'Start temporary chat');
  ghost.setAttribute('aria-pressed', 'false'); ghost.title = 'Start temporary chat';
  ghost.innerHTML = ghostIcon;
  document.getElementById('connection').replaceWith(ghost);
  // Keep the original initials circle; make only its destination interactive.
  const avatar = document.getElementById('profile-avatar');
  const link = document.createElement('a');
  link.id = avatar.id; link.className = avatar.className;
  link.textContent = avatar.textContent; link.href = '/app/settings.html';
  link.setAttribute('aria-label', 'Open settings'); avatar.replaceWith(link);
  return ghost;
}
export function updateGhost(button, current, busy) {
  button.disabled = busy;
  button.setAttribute('aria-pressed', String(!!current.temporary));
  const label = current.temporary ? 'Close temporary chat' : 'Start temporary chat';
  button.setAttribute('aria-label', label); button.title = label;
}
