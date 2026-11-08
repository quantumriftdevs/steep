const prefix = 'steep-projects-v1:';
export const copy = value => JSON.parse(JSON.stringify(value));
export const bytes = value => new TextEncoder().encode(value).length;
export function readProjects(user) {
  if (!user) return { rows: [], pending: {} };
  try { const data = JSON.parse(localStorage.getItem(prefix + user) || '{}');
    return { rows: Array.isArray(data.rows) ? data.rows.filter(p => p?.id && p.user_id === user) : [], pending: data.pending || {} };
  } catch { return { rows: [], pending: {} }; }
}
export function writeProjects(user, data) {
  if (!user) return false;
  try { localStorage.setItem(prefix + user, JSON.stringify(data)); return true; } catch { return false; }
}
export function validateProject(p) {
  if (!p.name?.trim() || p.name.trim().length > 80) throw Error('Use a project name of 1–80 characters.');
  if (typeof p.description !== 'string' || p.description.length > 500) throw Error('Description limit: 500 characters.');
  if (typeof p.instructions !== 'string' || p.instructions.length > 12000) throw Error('Instructions limit: 12,000 characters.');
  if (!Array.isArray(p.files) || p.files.length > 10) throw Error('Maximum 10 knowledge files.');
  let total = 0;
  for (const f of p.files) {
    if (!f?.id || f.id.length > 80 || !f.name?.trim() || f.name.length > 255 || typeof f.text !== 'string' || !f.text.trim() || f.text.length > 60000 || (f.note && (typeof f.note !== 'string' || f.note.length > 200))) throw Error('Invalid knowledge file.');
    total += f.text.length;
  }
  if (total > 120000 || bytes(JSON.stringify(p.files)) > 750000) throw Error('Project knowledge limit: 120,000 characters.');
  return p;
}
