import { setupTasks, taskReply, taskCard } from './tasks.js';
import { pageReply, pageCard } from './page-view.js';
import { documentReply } from './doc-gen.js'; import { markFreshImages } from './image-gen.js';
import { getSession, logout } from './auth.js'; import { modelRequest, beginRequest, finishRequest, stopRequest } from './model-request.js'; import { requireAuth, pendingGuest } from './guest.js';
import { setupProfile, recentLabel, pinMarker, openSidebarRename, closeSidebarRename } from './sidebar.js'; import { setupProjects } from './projects.js'; import { projectNav, enterProjectChat, leaveProjects, liveChats, projectDeleted, tagProjectChat } from './projects-context.js'; import { projectPayload } from './projects-request.js';
import { loadChats, saveChats, newChat, onChatsChange } from './store.js';
import { setupChatActions } from './chat-actions.js'; import { bindMenu } from './context-menu.js'; import { shareChat, activeShare, stopSharing } from './shares.js';
import { responseActions, stopSpeech } from './actions.js';
import { bubble, animate } from './messages.js'; import { modelPayload } from './attach-payload.js';
import { temporaryChat, ghostEmpty, setupGhost, updateGhost } from './ghost.js';
import { setupGreeting } from './greet.js'; import { hasAttachment, clearAttachment, restoreAttachment, lockAttachment, prepareAttachment, attachmentNote } from './attach.js';

const $ = id => document.getElementById(id);
const thread = $('thread'), messages = $('messages'), input = $('prompt');
const sidebar = $('sidebar'), scrim = $('scrim'), error = $('error');
let chats = liveChats(loadChats()), current = chats[0] || newChat(), busy = false;
if (!chats.length) chats = [current];
const ghost = setupGhost();
const ghostTitle = document.createElement('span'); ghostTitle.className = 'ghost-title';
ghostTitle.textContent = 'Ghost mode'; ghostTitle.hidden = true;
document.querySelector('.topbar').append(ghostTitle);
const actions = setupChatActions(ghost, {
  current: () => current, newChat: () => { if (busy) return; const id = current.projectId; discardTemporary(); current = tagProjectChat(newChat(), id); chats.unshift(current); enterProjectChat(current); input.value = ''; showError(''); menu(false); save(); render(); input.focus(); }, notice: showError,
  adopt: chat => { current = chat; chats = chats.filter(c => c.id !== chat.id); if (!chat.temporary) chats.unshift(chat); enterProjectChat(chat); render(); }, change: () => { save(); renderList(); },
  remove: () => {
    const id = current.id; discardTemporary(); chats = chats.filter(c => c.id !== id);
    current = newChat(); chats.unshift(current); enterProjectChat(current); input.value = ''; showError('');
    save(); render(); input.focus();
  }
});
const projects = setupProjects({ current: () => current, chats: () => liveChats(chats), busy: () => busy, notice: showError, closeMenu: () => menu(false), refresh: () => busy ? renderList() : render(), normal: () => { if (current.projectId) { discardTemporary(); current = newChat(); chats.unshift(current); input.value = ''; } showError(''); render(); }, select: chat => { if (busy || projectDeleted(chat)) return; discardTemporary(); current = chat; enterProjectChat(chat); showError(''); menu(false); render(); }, start: (id, preserve = false) => { if (busy) return; if (!preserve) { discardTemporary(); input.value = ''; } current = tagProjectChat(newChat(), id); chats.unshift(current); enterProjectChat(current); showError(''); menu(false); save(); render(); if (!preserve) input.focus(); }, prune: () => { const next = liveChats(chats), changed = next.length !== chats.length; chats = next; if (projectDeleted(current)) { discardTemporary(); current = newChat(); chats.unshift(current); leaveProjects(); input.value = ''; } if (changed) save(); } }); const tasks = setupTasks({ busy: () => busy, notice: showError, closeMenu: () => menu(false), refresh: () => render() }); function discardTemporary() { clearAttachment();
  if (current.temporary) { current.messages.length = 0; input.value = ''; }
}
ghost.onclick = () => {
  if (busy && !current.temporary) return;
  const closing = current.temporary; leaveProjects(); discardTemporary();
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
  if (current.temporary) return; chats = liveChats(chats); if (projectDeleted(current)) return;
  if (!saveChats(chats)) showError('This browser could not save your chats. They may disappear when you leave.');
}
function showError(text, timeout = 0) {
    clearTimeout(showError.timer);
    error.classList.remove('error--warning'); error.textContent = text; error.hidden = !text;
    if (timeout) showError.timer = setTimeout(() => showError(''), timeout);
}
let follow = true; thread.addEventListener('scroll', () => { follow = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80; }, { passive: true }); function scrollDown() { if (follow) thread.scrollTop = thread.scrollHeight; } function requestState(value) { busy = value; $('composer').classList.toggle('request-active', value); $('send').disabled = false; window.dispatchEvent(new CustomEvent('steep:request-state', { detail: value })); } $('send').addEventListener('click', e => { if (!busy) return; e.preventDefault(); e.stopImmediatePropagation(); stopRequest(); }, true);
async function chatMenu(chat) { const run = fn => () => { if (busy || !chats.includes(chat)) return; if (!requireAuth(() => { current = chat; chats = chats.filter(c => c.id !== chat.id); chats.unshift(chat); enterProjectChat(chat); render(); run(fn)(); })) return; fn(); }; const items = [{ label: chat.pinned ? 'Unpin' : 'Pin', icon: 'pin', run: run(() => { chat.pinned = !chat.pinned; if (!saveChats(chats)) showError('Could not save this pin.'); renderList(); }) }, { label: 'Share', icon: 'share', run: run(() => shareChat(chat, showError)) }, { label: 'Rename', icon: 'rename', run: run(() => openSidebarRename(chat, () => { if (!saveChats(chats)) showError('This browser could not save your chats. They may disappear when you leave.'); renderList(); })) }, { label: 'Delete', icon: 'delete', danger: true, run: run(() => { if (!confirm('Delete this chat? This cannot be undone.')) return; chats = chats.filter(c => c.id !== chat.id); if (current.id === chat.id) { current = newChat(); chats.unshift(current); enterProjectChat(current); } if (!saveChats(chats)) showError('Could not save this deletion.'); render(); }) }]; if (getSession()) { try { if (await activeShare(chat)) items.splice(2, 0, { label: 'Stop sharing', icon: 'stop', run: run(() => stopSharing(chat, showError)) }); } catch { showError('Sharing status is unavailable. Try Share again.'); } } return items; } function renderList() {
  closeSidebarRename(); const list = $('conversations'); list.replaceChildren();
  if (!projects.list(list)) liveChats(chats).filter(chat => !chat.projectId && chat.messages.length > 0).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).forEach(chat => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.chatId = chat.id;
    const firstUser = chat.messages.find(m => m.role === 'user' && typeof m.content === 'string');
    const title = chat.customTitle || (firstUser?.content || '').replace(/\s+/g, ' ').trim() || 'Conversation';
    recentLabel(button, title.length > 42 ? title.slice(0, 42) + '…' : title);
    button.className = chat.id === current.id ? 'active' : ''; button.disabled = busy;
    button.onclick = () => { discardTemporary(); current = chat; enterProjectChat(chat); showError(''); menu(false); render(); };
    pinMarker(button, chat.pinned); bindMenu(button, () => chatMenu(chat)); list.append(button);
  });
  $('new-chat').disabled = busy && !current.temporary; updateGhost(ghost, current, busy);
  ghost.disabled = busy && !current.temporary;
  const temporary = !!current.temporary;
  document.querySelector('.topbar').classList.toggle('ghost-mode', temporary); ghostTitle.hidden = !temporary;
  tasks.update(); actions.update(temporary || projectNav.overview || projectNav.tab === 'tasks' ? { ...current, messages: [] } : current, busy);
}
function render(welcome = false) {
  const top = thread.scrollTop, following = follow; stopSpeech(); renderList(); messages.replaceChildren(); if (tasks.render(messages) || projects.render(messages)) { messages.append(error); follow = following; if (following) scrollDown(); else thread.scrollTop = top; return; }
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
    const chat = current, imageOwner = getSession()?.user?.id; const body = bubble(messages, m.role, m.content, m.attachment, { message: m, onImage: (i, src) => { if (current !== chat || projectDeleted(chat) || getSession()?.user?.id !== imageOwner || !chat.messages.includes(m)) return false; const images = [...(m.images || [])]; images[i] = src; const candidate = chat.messages.map(item => item === m ? { ...m, images } : item); if (new TextEncoder().encode(JSON.stringify(candidate)).length > 1350000) { showError('This chat is too large to save another image. Try a new chat.'); return false; } m.images = images; save(); return true; } });
    if (m.role === 'assistant' && m.pageIntent) body.append(pageCard(m, () => { if (current === chat && getSession()?.user?.id === imageOwner && chat.messages.includes(m)) save(); }, showError));
    if (m.role === 'assistant') { const card = taskCard(m, () => { if (current === chat && getSession()?.user?.id === imageOwner && chat.messages.includes(m)) save(); }, showError); if (card) body.append(card); }     if (m.role === 'assistant') responseActions(body, m, {
      current: () => current, busy: () => busy, save, notice: showError,
      adopt: chat => { current = chat; chats = chats.filter(c => c.id !== chat.id); chats.unshift(chat); enterProjectChat(chat); save(); }, lock: value => { requestState(value); lockAttachment(value); render(); }
    });
  });
  messages.append(error); follow = following; if (following) scrollDown(); else thread.scrollTop = top;
}
$('new-chat').onclick = () => {
  if (busy && !current.temporary) return;
  if (projects.newAction()) return; if (current.temporary || current.projectId || current.messages.length) { discardTemporary(); current = newChat(); chats.unshift(current); save(); } enterProjectChat(current);
  clearAttachment(); showError(''); menu(false); render(true); input.focus();
};
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });

$('composer').addEventListener('submit', async e => {
  e.preventDefault(); const text = input.value.trim(); if ((!text && !hasAttachment()) || busy) return; if (!requireAuth(() => { leaveProjects(); current = newChat(); chats.unshift(current); enterProjectChat(current); input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); $('composer').requestSubmit(); })) return;
  projects.beforeSend(); if (projectDeleted(current)) return; const owner = getSession()?.user?.id; const active = current; busy = true; lockAttachment(true); $('send').disabled = true; input.disabled = true; showError(''); renderList(); let prepared; try { prepared = await prepareAttachment(text, active.messages); } catch (err) { if (current === active) showError(err.message || 'Could not prepare attachment.'); busy = false; lockAttachment(false); $('send').disabled = false; input.disabled = false; render(); return; } input.disabled = false; if (current !== active || projectDeleted(active) || getSession()?.user?.id !== owner) { busy = false; lockAttachment(false); $('send').disabled = false; render(); return; }
  const first = !current.messages.length;
  const userText = text || 'Please help with this file.'; current.messages.push({ role: 'user', content: userText, ...(prepared.attachment ? { attachment: prepared.attachment } : {}) }); clearAttachment();
  if (first) current.title = userText.slice(0, 42); save();
  input.value = ''; input.style.height = 'auto'; render();
  const controller = beginRequest(); requestState(true); const typing = bubble(messages, 'assistant', ''); typing.classList.add('typing'); typing.innerHTML = '<span class="model-dots" role="status" aria-label="Generating reply"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i></span>';  scrollDown();
  try {
    const payload = modelPayload(current.messages); save(); if (payload.notice || prepared.notice) showError([prepared.notice, payload.notice].filter(Boolean).join(' '));
    const body = await projectPayload(active, payload);  if (current !== active || projectDeleted(active) || getSession()?.user?.id !== owner) return;     const response = await modelRequest(body, error, () => current === active && !projectDeleted(active) && getSession()?.user?.id === owner, waiting => { typing.hidden = waiting; }, controller.signal);
    if (current !== active || projectDeleted(active) || getSession()?.user?.id !== owner) return; if (response.status === 401) { logout(); throw new Error('Please sign in again to keep chatting.'); }
    const data = await response.json(); if (controller.signal.aborted) return; if (current !== active || projectDeleted(active) || getSession()?.user?.id !== owner) return;
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Steep returned an empty reply. Try again.');
    const reply = (await taskReply(data, () => !controller.signal.aborted && current === active && !projectDeleted(active) && getSession()?.user?.id === owner)) || (await pageReply(data, controller.signal, text => showError(text, 5000))) || await documentReply(data, active, controller.signal, text => showError(text, 5000)); if (controller.signal.aborted || current !== active || projectDeleted(active) || getSession()?.user?.id !== owner) return; typing.classList.remove('typing'); await animate(typing, reply.content, scrollDown, controller.signal); if (controller.signal.aborted) return;
    if (current !== active || projectDeleted(active) || getSession()?.user?.id !== owner) return;
    const message = { role: 'assistant', ...reply, ...(data.taskSuggest ? { taskSuggest: data.taskSuggest } : {}) }; current.messages.push(message); markFreshImages(message); save();
  } catch (err) {
    if (current !== active || projectDeleted(active) || getSession()?.user?.id !== owner) return;
    // Keep the sent message locally even when the model/network is unavailable.
    if (err.name !== 'AbortError' && !controller.signal.aborted) showError(err.message || 'Could not connect. Try again.'); else showError(''); input.value = ''; save();
  } finally { finishRequest(controller); requestState(false); lockAttachment(false); render(); }
});
onChatsChange(reset => { const active = current; chats = liveChats(loadChats()); if (reset) { projects.reset(); if (!pendingGuest()) discardTemporary(); current = chats[0] || newChat(); enterProjectChat(current); input.value = ''; showError(''); menu(false); } else if (busy && !projectDeleted(active)) { if (!active.temporary) { chats = chats.filter(c => c.id !== active.id); chats.unshift(active); } return; } else { current = !projectDeleted(active) && active.temporary ? active : chats.find(c => c.id === active.id) || chats[0] || newChat(); if (projectDeleted(active)) { leaveProjects(); clearAttachment(); input.value = ''; } } if (!chats.length && !current.temporary) chats = [current]; render(); }); enterProjectChat(current); setupProfile(); render(true);
window.addEventListener('steep:guest-image', event => {
  if (!getSession() || busy || typeof event.detail !== 'string') return;
  leaveProjects(); current = newChat(); chats.unshift(current); enterProjectChat(current);
  const message = { role: 'assistant', content: '[img: ' + event.detail + ']' }; current.messages.push(message); markFreshImages(message);
  save(); showError(''); render();
});
window.addEventListener('steep:guest-page', event => {
  if (!getSession() || busy || !event.detail?.pageIntent || !event.detail?.page?.saved) return;
  leaveProjects(); current = newChat(); chats.unshift(current); enterProjectChat(current);
  current.messages.push({ role: 'assistant', ...event.detail });
  save(); showError(''); render();
});
