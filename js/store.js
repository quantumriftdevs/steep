const KEY = 'steep-conversations-v1';

export function loadChats() {
  try {
    const chats = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(chats) ? chats.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages)) : [];
  } catch {
    return [];
  }
}

export function saveChats(chats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(chats));
    return true;
  } catch {
    return false;
  }
}

export function newChat() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: 'New chat', messages: [] };
}
