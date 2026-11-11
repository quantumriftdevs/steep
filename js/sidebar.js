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

let cancelRename;
export function closeSidebarRename() { cancelRename?.(); }
export function openSidebarRename(chat, persist) {
  if (chat.temporary) return;
  closeSidebarRename();
  const list = document.getElementById('conversations');
  const row = [...list.children].find(button => button.dataset.chatId === chat.id);
  if (!row || row.disabled) return;
  const editor = document.createElement('form'); editor.className = 'sidebar-rename';
  const name = document.createElement('input'); name.type = 'text'; name.maxLength = 80;
  name.setAttribute('aria-label', 'Chat title');
  const firstUser = chat.messages.find(m => m.role === 'user' && typeof m.content === 'string');
  name.value = chat.customTitle || chat.title || (firstUser?.content || '').replace(/\s+/g, ' ').trim() || 'Conversation';
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save title';
  editor.append(name, save);
  const cancel = () => {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', escape, true);
    if (editor.isConnected) editor.replaceWith(row);
    if (cancelRename === cancel) cancelRename = null;
  };
  const outside = e => { if (!editor.contains(e.target)) cancel(); };
  const escape = e => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation(); cancel(); row.focus();
  };
  editor.onsubmit = e => {
    e.preventDefault(); const title = name.value.trim(); cancel();
    if (title) { chat.customTitle = title; persist(); }
  };
  // The original row (and its navigation/long-press handlers) is detached while editing.
  row.replaceWith(editor); cancelRename = cancel;
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('click', outside, true);
  document.addEventListener('keydown', escape, true);
  name.focus(); name.select();
}
