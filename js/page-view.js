import { authHeaders, getConfig, getSession } from './auth.js';
import { requireAuth } from './guest.js';
const pending = new WeakMap(), CAP = 500000;
const validToken = token => typeof token === 'string' && /^[0-9a-f]{32}$/.test(token);
const urlOf = page => location.origin + '/p/' + page.token;
export async function savePage(message, changed = () => {}, notice = () => {}) {
  if (!requireAuth(() => { savePage(message, () => { window.dispatchEvent(new CustomEvent('steep:guest-page', { detail: message })); }, notice).catch(e => notice(e.message)); })) return false;
  if (message.page?.saved) return true;
  if (pending.has(message)) return pending.get(message);
  if (typeof message.pageHtml !== 'string' || !message.pageHtml.trim() || message.pageHtml.length > CAP) throw Error('This page is empty or exceeds the 500,000-character limit. Ask for a smaller page.');
  const owner = getSession().user.id;
  const job = (async () => {
    const config = await getConfig(), auth = await authHeaders();
    const active = () => getSession()?.user?.id === owner;
    if (!active() || !auth.Authorization) throw Error('Please sign in again to save this page.');
    // Keep a token on uncertain delivery: retries are idempotent, never new links.
    message.page ||= { token: Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join(''), title: String(message.pageTitle || 'Web page').slice(0,200), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
    const p = message.page;
    if (!validToken(p.token)) throw Error('Invalid preview link. Ask for a fresh page.');
    const base = config.supabaseUrl + '/rest/v1/pages';
    const headers = { apikey: config.supabaseKey, ...auth, 'Content-Type': 'application/json' };
    const response = await fetch(base + '?on_conflict=token', { method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: owner, token: p.token, title: p.title, html: message.pageHtml, expires_at: p.expiresAt }), signal: AbortSignal.timeout(15000) });
    if (!active()) throw Error('Account changed. Please try again.');
    if (!response.ok) throw Error('Could not save the preview. Use Save preview to retry.');
    // Verify the stored row; do not show an Open button for an unconfirmed save.
    const check = await fetch(base + '?select=token,title,expires_at&token=eq.' + p.token + '&limit=1', { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const rows = check.ok ? await check.json() : [];
    if (!active()) throw Error('Account changed. Please try again.');
    if (!Array.isArray(rows) || rows[0]?.token !== p.token) throw Error('Preview save is unconfirmed. Use Save preview to check again.');
    p.title = rows[0].title; p.expiresAt = rows[0].expires_at; p.saved = true;
    delete message.pageHtml; changed(); return true;
  })();
  pending.set(message, job);
  try { return await job; } finally { pending.delete(message); }
}
export async function pageReply(data, signal, notice = () => {}) {
  if (!data.pageIntent || typeof data.pageHtml !== 'string') return null;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const title = String(data.pageTitle || 'Web page').slice(0,200);
  const message = { content: String(data.reply || 'Your page is ready.') + '\n\nWeb page preview: ' + title, pageIntent: true, pageTitle: title, pageHtml: data.pageHtml, ...(data.research ? { research: data.research } : {}) };
  try { await savePage(message, () => {}, notice); }
  catch (e) { notice(e.message || 'Could not save the preview. Use Save preview to retry.'); }
  return message;
}
export function pageCard(message, changed = () => {}, notice = () => {}) {
  const card = document.createElement('section'); card.className = 'page-card'; card.setAttribute('aria-label', 'Web page preview');
  const paint = () => {
    card.replaceChildren();
    if (!getSession()) return; // Guest pending actions reveal the card after auth.
    const label = document.createElement('span'); label.className = 'page-label'; label.textContent = 'Web page';
    const title = document.createElement('h3'); title.textContent = String(message.page?.title || message.pageTitle || 'Web page').slice(0,200);
    const note = document.createElement('p'); note.className = 'page-note';
    card.append(label, title);
    const p = message.page;
    if (p?.saved && validToken(p.token)) {
      const expired = !(Date.parse(p.expiresAt) > Date.now());
      const link = document.createElement('a'); link.href = urlOf(p); link.textContent = urlOf(p); link.className = 'page-link'; link.target = '_blank'; link.rel = 'noopener noreferrer';
      note.textContent = expired ? 'This 7-day preview has expired. Ask for a fresh page.' : 'Expires in 7 days from creation · Anyone with the link can open it.';
      const open = document.createElement('a'); open.href = link.href; open.textContent = 'Open'; open.className = 'page-open'; open.target = '_blank'; open.rel = 'noopener noreferrer';
      card.append(link, note, open);
    } else {
      note.textContent = 'Save a private-origin preview link. Links expire after 7 days.';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'page-open'; button.textContent = 'Save preview';
      button.onclick = async () => { button.disabled = true; button.textContent = 'Saving…'; try { await savePage(message, () => { changed(); paint(); }, notice); } catch (e) { notice(e.message); } finally { paint(); } };
      card.append(note, button);
    }
  };
  paint(); return card;
}
