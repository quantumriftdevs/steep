import { authHeaders, getConfig, getSession, logout } from './auth.js';
// Each request belongs to one store generation, including token-refresh awaits.
export async function chatRequest(user, active, query, method = 'GET', body) {
  const config = await getConfig(), auth = await authHeaders();
  if (!active() || getSession()?.user?.id !== user || !auth.Authorization) throw new Error('Session changed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(config.supabaseUrl + '/rest/v1/chats?' + query, {
      method, signal: controller.signal,
      headers: { apikey: config.supabaseKey, ...auth, 'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!active()) throw new Error('Session changed');
    if (response.status === 401) { logout(); throw new Error('Please sign in again'); }
    if (!response.ok) throw new Error('Chat sync unavailable');
    return method === 'GET' ? await response.json() : null;
  } finally { clearTimeout(timer); }
}
export async function fetchChats(user, active) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await chatRequest(user, active, 'select=*&order=updated_at.desc,id.asc&limit=500&offset=' + offset);
    if (!Array.isArray(page)) throw new Error('Invalid chat list');
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
