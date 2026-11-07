import { authHeaders, getSession, logout } from './auth.js';
import { setupProfile, recentLabel } from './sidebar.js';
import { loadChats, saveChats, newChat } from './store.js';
import { setupChatActions } from './chat-actions.js';
import { responseActions, stopSpeech } from './actions.js';
import { bubble, animate } from './messages.js';
import { temporaryChat, ghostEmpty, setupGhost, updateGhost } from './ghost.js';
import { setupGreeting } from './greet.js';

const $ = id => document.getElementById(id);
const thread = $('thread'), messages = $('messages'), input = $('prompt');
const sidebar = $('sidebar'), scrim = $('scrim'), error = $('error');
let chats = loadChats(), current = chats[0] || newChat(), busy = false;
if (!chats.length) chats = [current];
const ghost = setupGhost();
const ghostTitle = document.createElement('span'); ghostTitle.className = 'ghost-title';
ghostTitle.textContent = 'Ghost mode'; ghostTitle.hidden = true;
document.querySelector('.topbar').append(ghostTitle);
const actions = setupChatActions(ghost, {
  current: () => current, newChat: () => $('new-chat').click(), notice: showError,
  change: () => { save(); renderList(); },
  remove: () => {
    const id = current.id; discardTemporary(); chats = chats.filter(c => c.id !== id);
    current = newChat(); chats.unshift(current); input.value = ''; showError('');
    save(); render(); input.focus();
  }
});
function discardTemporary() {
  if (current.temporary) { current.messages.length = 0; input.value = ''; }
}
ghost.onclick = () => {
  if (busy && !current.temporary) return;
  const closing = current.temporary; discardTemporary();
  current = closing ? newChat() : temporaryChat();
  if (closing) chats.unshift(current);
  input.value = ''; showError(''); menu(false); render(); input.focus();
};
window.addEventListener('pagehide', () => {
  if (current.temporary) { discardTemporary(); current = newChat(); chats.unshift(current); showError(''); render(); }
});
function menu(open) {
  sidebar.classList.toggle('open', open);
  scrim.hidden = !open;
  $('open-menu').setAttribute('aria-expanded', String(open));
}
$('open-menu').onclick = () => menu(true);
scrim.onclick = () => menu(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });
function save() {
  if (current.temporary) return;
  if (!saveChats(chats)) showError('This browser could not save your chats. They may disappear when you leave.');
}
function showError(text) { error.textContent = text; error.hidden = !text; }
function scrollDown() { thread.scrollTop = thread.scrollHeight; }
function renderList() {
  const list = $('conversations'); list.replaceChildren();
  chats.filter(chat => chat.messages.length > 0).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).forEach(chat => {
    const button = document.createElement('button'); button.type = 'button';
    const firstUser = chat.messages.find(m => m.role === 'user' && typeof m.content === 'string');
    const title = chat.customTitle || (firstUser?.content || '').replace(/\s+/g, ' ').trim() || 'Conversation';
    recentLabel(button, title.length > 42 ? title.slice(0, 42) + '…' : title);
    button.className = chat.id === current.id ? 'active' : ''; button.disabled = busy;
    button.onclick = () => { discardTemporary(); current = chat; showError(''); menu(false); render(); };
    list.append(button);
  });
  $('new-chat').disabled = busy && !current.temporary; updateGhost(ghost, current, busy);
  ghost.disabled = busy && !current.temporary;
  const temporary = !!current.temporary;
  document.querySelector('.topbar').classList.toggle('ghost-mode', temporary); ghostTitle.hidden = !temporary;
  actions.update(temporary ? { ...current, messages: [] } : current, busy);
}
function render(welcome = false) {
  stopSpeech(); renderList(); messages.replaceChildren();
  if (current.temporary && !current.messages.length) {
    messages.append(ghostEmpty());
  } else if (!current.messages.length) {
    const empty = $('empty-template').content.firstElementChild.cloneNode(true); setupGreeting(empty);
    ['Plan my day', 'Help me prioritize', 'Break down a big goal'].forEach(text => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.onclick = () => { input.value = text; input.focus(); }; empty.querySelector('.examples').append(button);
    });
    messages.append(empty);
  } else current.messages.forEach((m, index) => {
    m.id ||= current.id + '-message-' + index;
    const body = bubble(messages, m.role, m.content);
    if (m.role === 'assistant') responseActions(body, m, {
      current: () => current, busy: () => busy, save, notice: showError,
      lock: value => { busy = value; $('send').disabled = value; render(); }
    });
  });
  messages.append(error); scrollDown();
}
$('new-chat').onclick = () => {
  if (busy && !current.temporary) return;
  if (current.temporary || current.messages.length) { discardTemporary(); current = newChat(); chats.unshift(current); save(); }
  showError(''); menu(false); render(true); input.focus();
};
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); }
});
$('composer').addEventListener('submit', async e => {
  e.preventDefault(); const text = input.value.trim(); if (!text || busy || !getSession()) return;
  const active = current; busy = true; $('send').disabled = true; showError('');
  const first = !current.messages.length;
  current.messages.push({ role: 'user', content: text });
  if (first) current.title = text.slice(0, 42); save();
  input.value = ''; input.style.height = 'auto'; render();
  const typing = bubble(messages, 'assistant', ''); typing.classList.add('typing'); typing.textContent = 'Steep is thinking…'; scrollDown();
  try {
    const history = current.messages.slice(-99).map(({ role, content }) => ({ role, content }));
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() }, body: JSON.stringify({ messages: history }) });
    if (response.status === 401) { logout(); throw new Error('Please sign in again to keep chatting.'); }
    const data = await response.json(); if (current !== active) return;
    if (!response.ok) throw new Error(data.code === 'NOT_CONNECTED' ? "Steep isn't connected yet - add the API key in Vercel" : (data.error || 'Something went wrong. Try again.'));
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Steep returned an empty reply. Try again.');
    typing.classList.remove('typing'); await animate(typing, data.reply, scrollDown);
    if (current !== active) return;
    current.messages.push({ role: 'assistant', content: data.reply }); save();
  } catch (err) {
    if (current !== active) return;
    current.messages.pop(); if (first) current.title = 'New chat';
    input.value = text; showError(err.message || 'Could not connect. Try again.'); save();
  } finally { busy = false; $('send').disabled = false; render(); }
});
setupProfile(); render(true);
