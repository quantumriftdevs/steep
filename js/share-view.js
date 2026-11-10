import { renderMarkdown } from './markdown.js';
const host = document.getElementById('shared-messages'), status = document.getElementById('share-status');
const token = new URLSearchParams(location.search).get('t') || location.pathname.split('/').filter(Boolean)[1] || '';
const imageURL = value => typeof value === 'string' && /^(https:\/\/|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(value);
function attachment(value, body) {
  for (const a of Array.isArray(value) ? value : [value]) {
    if (!a || typeof a !== 'object') continue;
    const src = a.original && imageURL(a.original) ? a.original : a.thumb || a.jpeg || a.dataUrl;
    if (a.kind === 'image' && imageURL(src)) { const img = document.createElement('img'); img.src = src; img.alt = String(a.name || 'Shared image'); img.className = 'attach-preview'; img.referrerPolicy = 'no-referrer'; body.append(img); }
    else { const name = document.createElement('p'); name.textContent = String(a.name || 'Attachment'); body.append(name); }
  }
}
async function load() {
  if (!/^[a-f0-9]{32}$/i.test(token)) { status.textContent = 'This link is no longer available'; return; }
  try {
    const configResponse = await fetch('/api/config', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error('config');
    const config = await configResponse.json();
    // Always anonymous: a signed-in owner's token must never bypass revocation.
    const response = await fetch(config.supabaseUrl + '/rest/v1/shares?select=title,snapshot,created_at&token=eq.' + token + '&revoked_at=is.null&limit=1', { headers: { apikey: config.supabaseKey, Authorization: 'Bearer ' + config.supabaseKey }, cache: 'no-store' });
    if (!response.ok) throw new Error('network');
    const rows = await response.json(), row = rows[0];
    if (!row || !Array.isArray(row.snapshot?.messages)) { status.textContent = 'This link is no longer available'; return; }
    const title = String(row.title || 'Shared Steep chat'); document.getElementById('share-title').textContent = title; document.title = title + ' · Steep';
    status.textContent = 'Read-only snapshot · ' + new Date(row.created_at).toLocaleDateString();
    for (const m of row.snapshot.messages) {
      if (!m || !['user','assistant'].includes(m.role)) continue;
      const line = document.createElement('div'); line.className = 'message ' + m.role;
      if (m.role === 'assistant') { const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = 's'; line.append(avatar); }
      const body = document.createElement('div'); body.className = 'bubble'; attachment(m.attachment, body); body.append(renderMarkdown(String(m.content || '')));
      for (const src of Array.isArray(m.images) ? m.images : []) if (imageURL(src)) { const img = document.createElement('img'); img.src = src; img.alt = 'Shared generated image'; img.className = 'attach-preview'; img.referrerPolicy = 'no-referrer'; body.append(img); }
      line.append(body); host.append(line);
    }
  } catch { status.textContent = 'Could not load this link. Please try again.'; }
}
load();
