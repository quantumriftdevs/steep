// Pure shared wire-format builder. No auth, storage, mutations or network access.
export const TASK_CONTEXT_LIMIT = 2000;
const short = (value, n) => typeof value === 'string' ? [...value.replace(/[\u0000-\u001f]/g, ' ').trim()].slice(0, n).join('') : '';
const due = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function buildTaskSnapshot(rows, now = Date.now(), state = 'ready') {
  const open = state === 'ready' && Array.isArray(rows) ? rows.filter(t => t && t.status === 'open' && typeof t.title === 'string' && t.title.trim()) : [];
  const ordered = open.map((t, index) => ({ title: short(t.title, 72), due: due(t.due_at), recurrence: short(t.recurrence, 20) || null, pinned: t.pinned === true, index }))
    .sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity) || a.index - b.index);
  // Reserve slots for pins, then fill with nearest deadlines; present all by due time.
  const pins = ordered.filter(t => t.pinned).slice(0, 10);
  const chosen = new Set([...pins, ...ordered.filter(t => !t.pinned).slice(0, 10 - pins.length)]);
  const tasks = ordered.filter(t => chosen.has(t)).map(({ index, ...t }) => t);
  const snapshot = { version: 1, state: state === 'ready' ? 'ready' : 'unavailable', at: new Date(now).toISOString(), timezone: 'Africa/Lagos', open: open.length, omitted: open.length - tasks.length, tasks };
  if (!open.length) snapshot.note = state === 'ready' ? 'No open tasks.' : 'Tasks could not sync; not an empty list.';
  // JSON escaping and supplementary Unicode are included in the hard serialized cap.
  while (JSON.stringify(snapshot).length > TASK_CONTEXT_LIMIT && tasks.length) {
    let i = tasks.map(t => t.pinned).lastIndexOf(false); if (i < 0) i = tasks.length - 1;
    tasks.splice(i, 1); snapshot.omitted++;
  }
  return JSON.stringify(snapshot);
}
