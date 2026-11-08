import { authHeaders, getConfig, getSession, logout } from './auth.js';
async function request(user, active, query, row) {
  const headers = await authHeaders(), config = getConfig();
  if (!active() || getSession()?.user?.id !== user) throw Error('Account changed.');
  const response = await fetch(config.supabaseUrl + '/rest/v1/projects?' + query, {
    method: row ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
    headers: { apikey: config.supabaseKey, ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    ...(row ? { body: JSON.stringify(row) } : {})
  });
  if (!active() || getSession()?.user?.id !== user) throw Error('Account changed.');
  if (response.status === 401) { logout(); throw Error('Please sign in again.'); }
  if (!response.ok) throw Error('Project sync failed. Changes stay on this device until sync succeeds.');
  return response.json();
}
export async function fetchProjects(user, active) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await request(user, active, 'select=*&order=updated_at.desc,id.asc&limit=500&offset=' + offset);
    rows.push(...page); if (page.length < 500) return rows;
  }
}
export async function pushProject(user, active, row) {
  const rows = await request(user, active, 'on_conflict=id&select=*', row);
  if (!rows[0] || rows[0].user_id !== user) throw Error('Project sync did not confirm the saved project.');
  return rows[0];
}
