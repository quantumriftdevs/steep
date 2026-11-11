import { shareChat, activeShare, stopSharing } from './shares.js';
import { getSession } from './auth.js';
import { requireAuth } from './guest.js';
// Chat actions share the app's state and persistence, never a second store.
export function setupChatActions(ghost, api) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/css/chat-actions.css'; document.head.append(css);
  const wrap = document.createElement('div'); wrap.className = 'chat-actions';
  ghost.before(wrap); wrap.append(ghost);
  const svg = path => '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
  function button(label, path, parent) {
    const b = document.createElement('button'); b.type = 'button';
    b.setAttribute('aria-label', label); b.innerHTML = svg(path); parent.append(b); return b;
  }
  const pill = document.createElement('div'); pill.className = 'chat-pill'; wrap.append(pill);
  const fresh = button('Start new chat', '<path d="M20 11a8 8 0 0 1-8 8H5l2-3a8 8 0 1 1 13-5ZM12 7v8M8 11h8"/>', pill);
  const more = button('Chat options', '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', pill);
  more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'chat-options');
  const panel = document.createElement('div'); panel.id = 'chat-options'; panel.className = 'chat-options'; panel.hidden = true; wrap.append(panel);
  let menuVersion = 0;
  function close() { menuVersion++; panel.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  function row(label, path, action) {
    const b = button(label, path, panel); const text = document.createElement('span'); text.textContent = label; b.append(text);
    b.onclick = () => {
      if (['Pin', 'Delete'].includes(label)) {
        const c = api.current();
        if (!requireAuth(() => { api.adopt(c); action(); })) return;
      }
      action();
    }; return b;
  }
  const pin = row('Pin', '<path d="m9 3 6 0-1 6 4 4H6l4-4-1-6ZM12 13v8"/>', () => {
    const c = api.current(); c.pinned = !c.pinned; close(); api.change();
  });
  row('Share', '<path d="M12 15V3M8 7l4-4 4 4M5 13v7h14v-7"/>', () => {
    const c = api.current(); close(); shareChat(c, api.notice);
  });
  const revoke = row('Stop sharing', '<path d="m4 4 16 16M9 9l-3 3a4 4 0 0 0 6 6l3-3M15 15l3-3a4 4 0 0 0-6-6l-3 3"/>', () => {
    const c = api.current(); close(); stopSharing(c, api.notice);
  });
  revoke.hidden = true;
  function openRename() {
    const c = api.current(); if (c.temporary) return;
    if (!requireAuth(() => { api.adopt(c); openRename(); })) return;
    panel.hidden = false; more.setAttribute('aria-expanded', 'true');
    // The sidebar can derive a title from messages even when stored titles are missing.
    const firstUser = c.messages.find(m => m.role === 'user' && typeof m.content === 'string');
    editor.hidden = false;
    name.value = c.customTitle?.trim() || c.title?.trim() || (firstUser?.content || '').replace(/\s+/g, ' ').trim() || 'Conversation';
    name.focus(); name.select();
  }
  const rename = row('Rename', '<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>', openRename);
  const editor = document.createElement('form'); editor.className = 'chat-rename'; editor.hidden = true;
  const name = document.createElement('input'); name.maxLength = 80; name.required = true; name.style.fontSize = '16px'; name.setAttribute('aria-label', 'Chat title');
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save title'; editor.append(name, save); panel.append(editor);
  editor.onsubmit = e => {
    e.preventDefault(); const title = name.value.trim(); if (!title) return;
    api.current().customTitle = title; close(); api.change();
  };
  const divider = document.createElement('hr'); panel.append(divider);
  const del = row('Delete', '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>', () => {
    close(); if (confirm('Delete this chat? This cannot be undone.')) api.remove();
  });
  del.className = 'delete-chat';
  fresh.onclick = () => { close(); api.newChat(); };
  more.onclick = async () => {
    if (!panel.hidden) { close(); return; }
    panel.hidden = false; editor.hidden = true; revoke.hidden = true;
    more.setAttribute('aria-expanded', 'true');
    const version = ++menuVersion, c = api.current();
    if (getSession()) try {
      const shared = await activeShare(c);
      if (version === menuVersion && api.current().id === c.id) revoke.hidden = !shared;
    } catch { /* Sharing itself reports errors; local menu actions remain available. */ }
  };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { close(); more.focus(); } });
  return { openRename, update(c, busy) {
    const active = c.messages.length > 0; wrap.classList.toggle('has-messages', active);
    ghost.inert = active; pill.inert = !active; fresh.disabled = more.disabled = busy;
    pin.hidden = rename.hidden = !!c.temporary;
    pin.querySelector('span').textContent = c.pinned ? 'Unpin' : 'Pin'; pin.setAttribute('aria-label', c.pinned ? 'Unpin' : 'Pin');
    close();
  } };
}
