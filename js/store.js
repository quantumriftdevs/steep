import { onAuthChange } from './auth.js';
import { readCache, writeCache, claimLegacy, validChats, toRow, fromRow, fingerprint } from './chat-cache.js';
import { chatRequest, fetchChats } from './chat-sync.js';
const listeners = new Set(), copy = value => JSON.parse(JSON.stringify(value));
let state;
const emit = reset => listeners.forEach(fn => fn(reset));
export function onChatsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function loadChats() { return copy(state.data.chats); }
export function newChat() { return { id: crypto.randomUUID(), title: 'New chat', messages: [] }; }
function persist(c) { return writeCache(c.user, c.data); }
function schedule(c, reload = false) {
  if (!c.user || c !== state) return;
  c.reload ||= reload; c.wake = true; clearTimeout(c.timer);
  c.timer = setTimeout(() => sync(c), 1500);
}
export function saveChats(chats) {
  const c = state, next = copy(validChats(chats));
  const before = new Map(c.data.chats.map(chat => [chat.id, fingerprint(chat)]));
  for (const chat of next) {
    if (before.get(chat.id) !== fingerprint(chat)) {
      chat.updated_at = new Date().toISOString();
      c.data.pending[chat.id] = { row: toRow(chat, c.user) };
    }
    before.delete(chat.id);
  }
  for (const id of before.keys()) c.data.pending[id] = { row: null };
  c.data.chats = next;
  const saved = persist(c); schedule(c); return saved;
}
async function sync(c) {
  if (c !== state || !c.user) return;
  if (c.running) { c.wake = true; return; }
  c.running = true; c.wake = false;
  const active = () => c === state;
  try {
    if (!c.loaded || c.reload) {
      c.reload = false;
      const rows = await fetchChats(c.user, active);
      if (!active()) return;
      if (!c.data.migrated) {
        const legacy = claimLegacy(c.user);
        if (!rows.length) {
          const local = c.data.chats.length ? c.data.chats : legacy;
          for (const chat of local) {
            if (c.data.pending[chat.id]?.row === null) continue;
            chat.updated_at = new Date().toISOString();
            c.data.pending[chat.id] ||= { row: toRow(chat, c.user) };
          }
        }
        c.data.migrated = true;
      }
      const merged = new Map(rows.map(row => [row.id, fromRow(row)]));
      for (const [id, item] of Object.entries(c.data.pending)) {
        if (item.row) merged.set(id, fromRow(item.row)); else merged.delete(id);
      }
      c.data.chats = validChats([...merged.values()]).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      if (!persist(c)) throw new Error('Storage unavailable');
      c.loaded = true; emit(false);
    }
    // Snapshot queue entries; a newer change must never be acknowledged by an older response.
    for (const [id, item] of Object.entries(c.data.pending)) {
      if (!active()) return;
      if (c.data.pending[id] !== item) continue;
      await chatRequest(c.user, active, item.row ? 'on_conflict=id' : 'id=eq.' + encodeURIComponent(id), item.row ? 'POST' : 'DELETE', item.row);
      if (!active()) return;
      if (c.data.pending[id] === item) { delete c.data.pending[id]; persist(c); }
    }
  } catch { /* Local cache and outbox survive; next change/load/online retries. */ }
  finally {
    c.running = false;
    if (active() && c.wake) schedule(c);
  }
}
onAuthChange(session => {
  const user = session?.user?.id || null;
  if (state?.user === user) return;
  if (state) clearTimeout(state.timer);
  state = { user, data: readCache(user), loaded: false, reload: true };
  emit(true); const c = state; queueMicrotask(() => sync(c));
});
window.addEventListener('online', () => schedule(state, true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(state, true); });
