import { getSession } from './auth.js';
const key = user => 'steep-name-v2:' + user.id;
export function emailName(email) {
  const word = String(email || '').split('@')[0].split(/[._\d]+/).find(Boolean) || '';
  return word ? word[0].toLocaleUpperCase() + word.slice(1).toLocaleLowerCase() : '';
}
function customName(user) { try { return user && localStorage.getItem(key(user))?.trim() || ''; } catch { return ''; } }
export function profileInitial() {
  const user = getSession()?.user;
  return Array.from(customName(user) || user?.email || '')[0]?.toLocaleUpperCase() || '';
}
export function profileName() {
  const user = getSession()?.user;
  return user ? customName(user) || emailName(user.email) : '';
}
export function saveProfileName(name) {
  const user = getSession()?.user;
  if (!user) throw new Error('Sign in to save your name.');
  localStorage.setItem(key(user), name.trim().slice(0, 60));
  window.dispatchEvent(new Event('steep:profile-change'));
}
