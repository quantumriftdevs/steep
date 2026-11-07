// Passwordless Supabase Auth; no SDK or build step.
const KEY = 'steep-auth-v1';
let session = read(), config, refreshing, timer, generation = 0;
const listeners = new Set();
function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    return value?.access_token && value?.refresh_token && value?.user?.email ? value : null;
  } catch { return null; }
}
export function getSession() { return session; }
export function onAuthChange(listener) { listeners.add(listener); listener(session); return () => listeners.delete(listener); }
function schedule() {
  clearTimeout(timer);
  if (session) timer = setTimeout(() => refreshSession(), Math.min(2147483647, Math.max(1000, ((session.expires_at || 0) * 1000 - Date.now() - 60000))));
}
function save(value) {
  if (!value?.access_token || !value?.refresh_token || !value?.user?.email) throw new Error('Please try signing in again.');
  const next = { access_token: value.access_token, refresh_token: value.refresh_token,
    user: { email: value.user.email }, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600) };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { throw new Error('Please allow browser storage to stay signed in.'); }
  session = next; schedule(); listeners.forEach(fn => fn(session));
}
export async function getConfig() {
  if (!config) config = fetch('/api/config', { cache: 'no-store' }).then(async response => {
    const data = await response.json();
    if (!response.ok || !data.supabaseUrl || !data.supabaseKey) throw new Error('Sign-in is unavailable right now. Please try again shortly.');
    return data;
  }).catch(error => { config = null; throw error; });
  return config;
}
async function request(path, body) {
  const { supabaseUrl, supabaseKey } = await getConfig();
  const response = await fetch(supabaseUrl + '/auth/v1/' + path, { method: 'POST',
    headers: { apikey: supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
export async function sendCode(email) {
  const { response } = await request('otp', { email, create_user: true });
  if (!response.ok) throw new Error(response.status === 429 ? 'Email codes are capped at 2 per hour right now. Please try again a little later.' : 'We could not send your code. Please check your email and try again.');
}
export async function verifyCode(email, token) {
  const version = generation;
  let result = await request('verify', { email, token, type: 'email' });
  const hint = String(result.data.msg || result.data.message || result.data.error_description || '');
  if (!result.response.ok && /signup|sign.up|confirmation/i.test(hint)) result = await request('verify', { email, token, type: 'signup' });
  if (!result.response.ok) throw new Error('That code did not work or has expired. Check the six digits and try again.');
  if (version === generation) save(result.data);
}
export function logout() {
  generation++; session = null; refreshing = null; clearTimeout(timer);
  try { localStorage.removeItem(KEY); } catch {}
  listeners.forEach(fn => fn(null));
}
export async function refreshSession() {
  if (!session) return null;
  if (refreshing) return refreshing;
  const version = generation, token = session.refresh_token;
  refreshing = (async () => {
    try {
      const { response, data } = await request('token?grant_type=refresh_token', { refresh_token: token });
      if (!response.ok) throw new Error('refresh');
      if (version === generation) save(data);
    } catch { if (version === generation) logout(); }
    finally { if (version === generation) refreshing = null; }
    return session;
  })();
  return refreshing;
}
export async function authHeaders() {
  if (session && (!session.expires_at || session.expires_at * 1000 <= Date.now() + 60000)) await refreshSession();
  return session ? { Authorization: 'Bearer ' + session.access_token } : {};
}
window.addEventListener('storage', event => {
  if (event.key !== KEY) return;
  generation++; refreshing = null; session = read(); schedule(); listeners.forEach(fn => fn(session));
});
if (session) schedule();
// Display only: network requests and stored sessions keep the full email.
export function maskEmail(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 1) return '';
  const local = email.slice(0, at), domain = email.slice(at);
  return local[0] + (local.length <= 4 ? '****' : '*****' + local.slice(-1)) + domain;
}
