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
  function close() { panel.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  function row(label, path, action) {
    const b = button(label, path, panel); const text = document.createElement('span'); text.textContent = label; b.append(text);
    b.onclick = action; return b;
  }
  const pin = row('Pin', '<path d="m9 3 6 0-1 6 4 4H6l4-4-1-6ZM12 13v8"/>', () => {
    const c = api.current(); c.pinned = !c.pinned; close(); api.change();
  });
  row('Share', '<path d="M12 15V3M8 7l4-4 4 4M5 13v7h14v-7"/>', async () => {
    const c = api.current(); const text = c.messages.map(m => (m.role === 'user' ? 'You' : 'Steep') + ': ' + m.content).join('\n\n');
    close();
    try {
      if (navigator.share) await navigator.share({ title: c.customTitle || c.title || 'Steep chat', text });
      else { await navigator.clipboard.writeText(text); api.notice('Chat copied. Share it wherever you like.'); }
    } catch (e) { if (e.name !== 'AbortError') api.notice('Could not share this chat. Please try again.'); }
  });
  const rename = row('Rename', '<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>', () => {
    editor.hidden = false; name.value = api.current().customTitle || api.current().title || ''; name.focus(); name.select();
  });
  const editor = document.createElement('form'); editor.className = 'chat-rename'; editor.hidden = true;
  const name = document.createElement('input'); name.maxLength = 80; name.required = true; name.setAttribute('aria-label', 'Chat title');
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save title'; editor.append(name, save); panel.append(editor);
  editor.onsubmit = e => { e.preventDefault(); const title = name.value.trim(); if (!title) return; api.current().customTitle = title; close(); api.change(); };
  const divider = document.createElement('hr'); panel.append(divider);
  const del = row('Delete', '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>', () => { close(); api.remove(); }); del.className = 'delete-chat';
  fresh.onclick = () => { close(); api.newChat(); };
  more.onclick = () => { panel.hidden = !panel.hidden; editor.hidden = true; more.setAttribute('aria-expanded', String(!panel.hidden)); };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { close(); more.focus(); } });
  return { update(c, busy) {
    const active = c.messages.length > 0;
    wrap.classList.toggle('has-messages', active); ghost.inert = active; pill.inert = !active;
    fresh.disabled = more.disabled = busy;
    pin.hidden = rename.hidden = !!c.temporary;
    pin.querySelector('span').textContent = c.pinned ? 'Unpin' : 'Pin';
    pin.setAttribute('aria-label', c.pinned ? 'Unpin' : 'Pin'); close();
  } };
}
