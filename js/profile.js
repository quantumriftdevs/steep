import { getSession } from './auth.js';
// A shared unowned name cannot safely be attributed to the current account.
const key = user => 'steep-name-v2:' + user.id;
export function emailName(email) {
  const word = String(email || '').split('@')[0].split(/[._\d]+/).find(Boolean) || '';
  return word ? word[0].toLocaleUpperCase() + word.slice(1).toLocaleLowerCase() : '';
}
export function profileInitial() {
  return Array.from(getSession()?.user?.email || '')[0]?.toLocaleUpperCase() || '';
}
export function profileName() {
  const user = getSession()?.user;
  if (!user) return '';
  try { const custom = localStorage.getItem(key(user)); if (custom?.trim()) return custom; } catch {}
  return emailName(user.email);
}
export function saveProfileName(name) {
  const user = getSession()?.user;
  if (!user) throw new Error('Sign in to save your name.');
  localStorage.setItem(key(user), name.trim().slice(0, 60));
  window.dispatchEvent(new Event('steep:profile-change'));
}
