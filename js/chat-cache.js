// Account-scoped durable cache and wire format; no auth secrets here.
const PREFIX = 'steep-conversations-v2:';
const LEGACY = 'steep-conversations-v1', OWNER = PREFIX + 'legacy-owner';
export const validChats = chats => Array.isArray(chats) ? chats.filter(c => c && typeof c.id === 'string' && !c.temporary && Array.isArray(c.messages) && c.messages.length) : [];
export function readCache(user) {
  try {
    const data = JSON.parse(localStorage.getItem(PREFIX + (user || 'guest')) || '{}');
    return { chats: validChats(data.chats), pending: data.pending || {}, migrated: !!data.migrated };
  } catch { return { chats: [], pending: {}, migrated: false }; }
}
export function writeCache(user, data) {
  try { localStorage.setItem(PREFIX + (user || 'guest'), JSON.stringify(data)); return true; }
  catch { return false; }
}
export function claimLegacy(user) {
  try {
    const owner = localStorage.getItem(OWNER);
    if (owner && owner !== user) return [];
    if (!owner) localStorage.setItem(OWNER, user);
    return validChats(JSON.parse(localStorage.getItem(LEGACY) || '[]')).map(c => ({ ...c, id: crypto.randomUUID() }));
  } catch { return []; }
}
export function toRow(chat, user) {
  return { id: chat.id, user_id: user, title: chat.title || 'New chat',
    messages: [...chat.messages, { steep_meta: 1, customTitle: chat.customTitle || '', pinned: !!chat.pinned, ...(chat.projectId ? { projectId: chat.projectId } : {}) }],
    updated_at: chat.updated_at || new Date().toISOString() };
}
export function fromRow(row) {
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const meta = messages.find(m => m?.steep_meta === 1) || {};
  return { id: row.id, title: row.title, messages: messages.filter(m => m && m.steep_meta !== 1),
    customTitle: meta.customTitle || '', pinned: !!meta.pinned, ...(typeof meta.projectId === 'string' ? { projectId: meta.projectId } : {}), updated_at: row.updated_at };
}
export function fingerprint(chat) {
  return JSON.stringify([chat.title, chat.customTitle || '', !!chat.pinned, chat.messages, chat.projectId || '']);
}
// Seal even when an already-migrated account suppresses legacy import.
export function sealLegacy(user) {
  if (!user) return false;
  try {
    if (!localStorage.getItem(OWNER)) localStorage.setItem(OWNER, user);
    return !!localStorage.getItem(OWNER);
  } catch { return false; }
}
