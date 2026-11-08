import { onAuthChange } from './auth.js';
import { copy, readProjects, writeProjects, validateProject } from './projects-cache.js';
import { fetchProjects, pushProject } from './projects-sync.js';
let user = null, generation = 0, data = { rows: [], pending: {} }, running = null, error = '';
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(error));
const persist = () => writeProjects(user, data);
export const projectRows = () => copy(data.rows);
export const getProject = id => copy(data.rows.find(p => p.id === id && !p.deleted_at) || null);
export function onProjectsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function merge(remote) {
  const rows = new Map(data.rows.map(p => [p.id, p]));
  for (const row of remote) {
    const local = rows.get(row.id);
    if (row.deleted_at) { rows.set(row.id, row); delete data.pending[row.id]; }
    else if (!local?.deleted_at && !data.pending[row.id]) rows.set(row.id, row);
  }
  data.rows = [...rows.values()];
}
export async function syncProjects() {
  if (!user) return;
  if (running) return running;
  const owner = user, epoch = generation, active = () => owner === user && epoch === generation;
  const task = (async () => {
    try {
      const remote = await fetchProjects(owner, active); if (!active()) return;
      merge(remote); persist(); emit();
      for (const id of Object.keys(data.pending)) {
        const row = data.pending[id]; if (!row) continue;
        const saved = await pushProject(owner, active, row); if (!active()) return;
        if (saved.deleted_at || data.pending[id] === row) {
          data.rows = data.rows.filter(p => p.id !== id).concat(saved); delete data.pending[id];
        }
        persist(); emit();
      }
      error = ''; emit();
    } catch (e) { if (active()) { error = e.message || 'Project sync is unavailable.'; emit(); } throw e; }
  })();
  running = task;
  try { return await task; } finally { if (running === task) running = null; }
}
const schedule = () => queueMicrotask(() => syncProjects().catch(() => {}));
export function putProject(values) {
  if (!user) throw Error('Sign in to save a project.');
  const old = values.id && data.rows.find(p => p.id === values.id);
  if (old?.deleted_at) throw Error('This project was deleted.');
  const now = new Date().toISOString();
  const row = validateProject({ id: values.id || crypto.randomUUID(), user_id: user, name: values.name?.trim(), description: values.description || '', instructions: values.instructions || '', files: values.files || [], created_at: old?.created_at || now, updated_at: now, deleted_at: null });
  const before = copy(data);
  data.rows = data.rows.filter(p => p.id !== row.id).concat(row); data.pending[row.id] = row;
  if (!persist()) { data = before; throw Error('Device storage is full. Project changes were not saved.'); }
  emit(); schedule(); return copy(row);
}
export function deleteProject(id) {
  const old = getProject(id); if (!old || !user) return;
  const before = copy(data), now = new Date().toISOString();
  const row = { ...old, name: 'Deleted project', description: '', instructions: '', files: [], deleted_at: now, updated_at: now };
  data.rows = data.rows.filter(p => p.id !== id).concat(row); data.pending[id] = row;
  if (!persist()) { data = before; throw Error('Device storage is full. Project was not deleted.'); }
  emit(); schedule();
}
export async function flushProject(id) {
  const epoch = generation;
  for (let attempt = 0; attempt < 3; attempt++) {
    await syncProjects();
    if (generation !== epoch) throw Error('Account changed.');
    const p = getProject(id); if (!p) throw Error('Project is unavailable or deleted.');
    if (!data.pending[id]) return p;
  }
  throw Error('Project changes are still syncing. Try again shortly.');
}
onAuthChange(session => {
  const next = session?.user?.id || null; if (next === user) return;
  user = next; generation++; running = null; error = ''; data = readProjects(user); emit(); if (user) schedule();
});
window.addEventListener('online', schedule);
document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
