import { loadChats, saveChats, newChat } from './store.js';
import { bubble, animate } from './messages.js'; import { animateWelcome } from './anim.js'; import { checkConnection } from './status.js'; import { setupGreeting } from './greet.js';

const $ = id => document.getElementById(id);
const thread = $('thread'), messages = $('messages'), input = $('prompt');
const sidebar = $('sidebar'), scrim = $('scrim'), error = $('error');
let chats = loadChats(), current = chats[0] || newChat(), busy = false;
if (!chats.length) chats = [current];

function menu(open) {
  sidebar.classList.toggle('open', open);
  scrim.hidden = !open;
  $('open-menu').setAttribute('aria-expanded', String(open));
}
$('open-menu').onclick = () => menu(true);
$('close-menu').onclick = () => menu(false);
scrim.onclick = () => menu(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });

function save() {
  if (!saveChats(chats)) showError('This browser could not save your chats. They may disappear when you leave.');
}
function showError(text) { error.textContent = text; error.hidden = !text; }
function scrollDown() { thread.scrollTop = thread.scrollHeight; }
function renderList() {
  const list = $('conversations'); list.replaceChildren();
  chats.forEach(chat => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = chat.title || 'New chat';
    button.className = chat.id === current.id ? 'active' : '';
    button.disabled = busy;
    button.onclick = () => { current = chat; showError(''); menu(false); render(); };
    list.append(button);
  });
  $('new-chat').disabled = busy;
}
function render(welcome = false) {
  renderList(); messages.replaceChildren();
  if (!current.messages.length) {
    const empty = $('empty-template').content.firstElementChild.cloneNode(true); setupGreeting(empty);

    ['Help me find my niche', 'Why is my RPM low?', 'Help me draft an appeal'].forEach(text => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.onclick = () => { input.value = text; input.focus(); }; empty.querySelector('.examples').append(button);
    });
    messages.append(empty); if (welcome) animateWelcome(empty, input);
  } else current.messages.forEach(m => bubble(messages, m.role, m.content));
  scrollDown();
}
$('new-chat').onclick = () => {
  if (busy) return;
  if (current.messages.length) { current = newChat(); chats.unshift(current); save(); }
  showError(''); menu(false); render(true); input.focus();
};
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); }
});

$('composer').addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  busy = true; $('send').disabled = true; showError('');
  const first = !current.messages.length;
  current.messages.push({ role: 'user', content: text });
  if (first) current.title = text.slice(0, 42);
  input.value = ''; input.style.height = 'auto'; render();
  const typing = bubble(messages, 'assistant', ''); typing.classList.add('typing'); typing.textContent = 'Steep is thinking…'; scrollDown();
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: current.messages.slice(-99) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.code === 'NOT_CONNECTED' ? "Steep isn't connected yet - add the API key in Vercel" : (data.error || 'Something went wrong. Try again.'));
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Steep returned an empty reply. Try again.');
    typing.classList.remove('typing');
    await animate(typing, data.reply, scrollDown);
    current.messages.push({ role: 'assistant', content: data.reply }); save();
  } catch (err) {
    current.messages.pop(); if (first) current.title = 'New chat';
    input.value = text; showError(err.message || 'Could not connect. Try again.'); save();
  } finally {
    busy = false; $('send').disabled = false; render();
  }
});
checkConnection(); render(true);
