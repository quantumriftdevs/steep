const KEY = 'steep-conversations-v1';

export function loadChats() {
  try {
    const chats = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(chats)) return [];     const empty = c => c && Array.isArray(c.messages) && c.messages.length === 0;     if (chats.some(empty)) {       try { localStorage.setItem(KEY, JSON.stringify(chats.filter(c => !empty(c)))); } catch {}     }     return chats.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages) && c.messages.length > 0);
  } catch {
    return [];
  }
}

export function saveChats(chats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(chats.filter(c => c.messages.length > 0)));
    return true;
  } catch {
    return false;
  }
}

export function newChat() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: 'New chat', messages: [] };
}
