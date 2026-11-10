import { authHeaders, getConfig, getSession } from './auth.js';
import { requireAuth } from './guest.js';
const base = 'https://steep-app-three.vercel.app/s/';
async function request(query, method = 'GET', body) {
  const owner = getSession()?.user?.id;
  if (!owner) throw new Error('Please sign in to share a chat.');
  const config = await getConfig(), auth = await authHeaders();
  if (getSession()?.user?.id !== owner || !auth.Authorization) throw new Error('Please sign in again.');
  const response = await fetch(config.supabaseUrl + '/rest/v1/shares?' + query, { method, headers: { apikey: config.supabaseKey, ...auth, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (getSession()?.user?.id !== owner) throw new Error('Account changed. Please try again.');
  if (!response.ok) throw new Error('Could not update sharing. Please try again.');
  return response.json();
}
export async function activeShare(chat) {
  const rows = await request('select=id,token&revoked_at=is.null&snapshot->>chatId=eq.' + encodeURIComponent(chat.id) + '&order=created_at.desc&limit=1');
  return rows[0] || null;
}
function snapshotOf(chat) {
  const title = String(chat.customTitle || chat.title || 'Steep chat').slice(0,200);
  const messages = chat.messages.filter(m => m && !m.steep_meta && ['user','assistant'].includes(m.role)).map(m => {
    const item = { role: m.role, content: String(m.content || '') };
    if (m.attachment) { const a = {}; for (const k of ['name','kind','text','note','jpeg','dataUrl','original']) if (typeof m.attachment[k] === 'string') a[k] = m.attachment[k]; item.attachment = a; }
    return item;
  });
  const snapshot = { chatId: chat.id, title, messages };
  // Pretty JSON overestimates jsonb's spaces, keeping inserts below its byte cap.
  if (new TextEncoder().encode(JSON.stringify(snapshot, null, 1)).length > 1500000) throw new Error('This chat is too large to share');
  return snapshot;
}
function showLink(token, title, notice) {
  const dialog = document.createElement('dialog'); dialog.className = 'share-sheet';
  const heading = document.createElement('h2'); heading.textContent = 'Share chat';
  const note = document.createElement('p'); note.textContent = 'Anyone with this link can read this snapshot. Later messages are not included.';
  const input = document.createElement('input'); input.readOnly = true; input.value = base + token; input.setAttribute('aria-label', 'Share link');
  const copy = document.createElement('button'); copy.textContent = 'Copy link'; copy.onclick = async () => { try { await navigator.clipboard.writeText(input.value); copy.textContent = 'Copied'; } catch { input.select(); notice('Copy is unavailable. Select and copy the link.'); } };
  const close = document.createElement('button'); close.textContent = 'Done'; close.onclick = () => dialog.close();
  dialog.append(heading,note,input,copy);
  if (navigator.share) { const share = document.createElement('button'); share.textContent = 'Share'; share.onclick = async () => { try { await navigator.share({ title, url: input.value }); } catch(e) { if(e.name !== 'AbortError') notice('Could not open sharing. Copy the link instead.'); } }; dialog.append(share); }
  dialog.append(close); dialog.onclose = () => dialog.remove(); dialog.onclick = e => { if(e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close(); } }; document.body.append(dialog); dialog.showModal();
}
export async function shareChat(chat, notice) {
  if (!requireAuth(() => shareChat(chat,notice))) return;
  try { const snapshot = snapshotOf(chat); let row = await activeShare(chat);
    if (!row) { const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join(''); [row] = await request('', 'POST', { user_id: getSession().user.id, token, title: snapshot.title, snapshot }); }
    showLink(row.token, snapshot.title, notice);
  } catch(e) { notice(e.message); }
}
export async function stopSharing(chat, notice) {
  if (!requireAuth(() => stopSharing(chat,notice))) return;
  try { await request('revoked_at=is.null&snapshot->>chatId=eq.' + encodeURIComponent(chat.id), 'PATCH', { revoked_at: new Date().toISOString() }); notice('Sharing stopped. Existing links no longer open this chat.'); } catch(e) { notice(e.message); }
}
