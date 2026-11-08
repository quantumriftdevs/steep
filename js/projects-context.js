import { getProject, projectRows } from './projects-store.js';
export const projectNav = { tab: 'chats', id: null, overview: false };
export function enterProject(id) {
  if (!getProject(id)) return false;
  Object.assign(projectNav, { tab: 'projects', id, overview: true }); return true;
}
export function enterProjectChat(chat) {
  Object.assign(projectNav, { tab: chat.projectId ? 'projects' : 'chats', id: chat.projectId || null, overview: false });
}
export function leaveProjects() { Object.assign(projectNav, { tab: 'chats', id: null, overview: false }); }
export function projectDeleted(chat) { return !!chat?.projectId && projectRows().some(p => p.id === chat.projectId && p.deleted_at); }
export const liveChats = chats => chats.filter(chat => !projectDeleted(chat));
export function tagProjectChat(chat, id) {
  if (id) { if (!getProject(id)) throw Error('Project is unavailable or deleted.'); chat.projectId = id; }
  return chat;
}
