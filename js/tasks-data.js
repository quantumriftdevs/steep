import { getSession, getConfig, authHeaders, onAuthChange, logout } from './auth.js';
// No guest/local task store: every operation uses the account bearer plus RLS.
let owner = null, version = 0, rows = [], queue = Promise.resolve(), readVersion = 0;
const listeners = new Set();
export const taskRows = () => rows.map(t => ({ ...t }));
export function onTasksChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = error => listeners.forEach(fn => fn(error));
function active(user, generation) { return owner === user && version === generation && getSession()?.user?.id === user; }
async function request(user, generation, query, method = 'GET', body) {
  const config = await getConfig(), headers = await authHeaders();
  if (!active(user, generation) || !headers.Authorization) throw Error('Please sign in to manage tasks.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(config.supabaseUrl + '/rest/v1/tasks?' + query, {
      method, signal: controller.signal,
      headers: { apikey: config.supabaseKey, ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!active(user, generation)) throw Error('Account changed.');
    if (response.status === 401) { logout(); throw Error('Please sign in again to manage tasks.'); }
    if (!response.ok) throw Error('Tasks could not sync. Refresh the Tasks tab before trying again.');
    const data = await response.json();
    if (!active(user, generation)) throw Error('Account changed.');
    if (!Array.isArray(data)) throw Error('Invalid tasks response.');
    return data;
  } finally { clearTimeout(timer); }
}
export async function refreshTasks() {
  const user = owner, generation = version, read = ++readVersion;
  if (!user) { rows = []; emit(); return []; }
  const next = [];
  for (let offset = 0; ; offset += 500) {
    const page = await request(user, generation, 'select=*&user_id=eq.' + encodeURIComponent(user) + '&order=created_at.desc,id.asc&limit=500&offset=' + offset);
    next.push(...page); if (page.length < 500) break;
  }
  if (active(user, generation) && read === readVersion) { rows = next; emit(); }
  return next;
}
function mutate(fn) {
  const user = owner, generation = version;
  const result = queue.catch(() => {}).then(async () => {
    if (!user || !active(user, generation)) throw Error('Please sign in to manage tasks.');
    return fn(user, generation);
  });
  queue = result; return result;
}
export function taskFields(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (!title || [...title].length > 200) throw Error('Use a task title of 1–200 characters.');
  if ([...notes].length > 2000) throw Error('Notes must be at most 2000 characters.');
  const due = input.due_at || null;
  if (due && (typeof due !== 'string' || !Number.isFinite(Date.parse(due)))) throw Error('Choose a valid due date.');
  return { title, notes: notes || null, due_at: due ? new Date(due).toISOString() : null };
}
export function addTask(input, source = 'manual', id = crypto.randomUUID()) {
  return mutate(async (user, generation) => {
    if (!['manual','chat','suggested'].includes(source)) throw Error('Invalid task source.');
    const fields = taskFields(input), current = await refreshTasks();
    if (!active(user,generation)) throw Error('Account changed.');
    // Stable client IDs make uncertain chat/card retries idempotent.
    const existing = current.find(t => t.id === id); if (existing) return existing;
    if (current.filter(t => t.status === 'open').length >= 500) throw Error('You have 500 open tasks. Complete or delete one before adding another.');
    if (input.recurrence != null) { if (!validRecurrence(input.recurrence)) throw Error('Invalid recurrence.'); fields.recurrence = input.recurrence; }
    const created = await request(user, generation, '', 'POST', { id, user_id: user, ...fields, status: 'open', source });
    if (!created[0]) throw Error('The task was not returned. Refresh Tasks to check it.');
    rows = [created[0], ...rows.filter(t => t.id !== id)]; ++readVersion; emit(); return created[0];
  });
}
export function editTask(id, input, expectedDue) {
  return mutate(async (user, generation) => {
    const updates = {};
    if (expectedDue !== undefined) {
      const current = await refreshTasks(), task = current.find(t => t.id === id);
      if (!task || task.status !== 'open' || Date.parse(task.due_at) !== Date.parse(expectedDue)) return null;
    }
    if ('title' in input) Object.assign(updates, taskFields(input));
    if ('due_at' in input) { const due = input.due_at; if (due !== null && (typeof due !== 'string' || !Number.isFinite(Date.parse(due)))) throw Error('Choose a valid due date.'); updates.due_at = due === null ? null : new Date(due).toISOString(); }
    if ('status' in input) {
      if (!['open','done'].includes(input.status)) throw Error('Invalid task status.');
      if (input.status === 'open') {
        const current = await refreshTasks();
        if (current.filter(t => t.status === 'open' && t.id !== id).length >= 500) throw Error('Complete another task before reopening this one (500 open maximum).');
      }
      updates.status = input.status; updates.completed_at = input.status === 'done' ? new Date().toISOString() : null;
    }
    if (input.status === 'done') {
      const current = await refreshTasks(), task = current.find(t => t.id === id);
      if (expectedDue !== undefined && (!task || task.status !== 'open' || Date.parse(task.due_at) !== Date.parse(expectedDue))) return null;
      if (task?.status === 'open' && task.recurrence) {
        updates.due_at = nextOccurrence(task.due_at, task.recurrence);
        updates.status = 'open'; updates.completed_at = null;
      }
    }
    const changed = await request(user, generation, 'id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + encodeURIComponent(user) + (expectedDue === undefined ? '' : '&status=eq.open&due_at=eq.' + encodeURIComponent(new Date(expectedDue).toISOString())), 'PATCH', updates);
    if (!changed[0] && expectedDue !== undefined) { await refreshTasks(); return null; }
    if (!changed[0]) throw Error('That task is no longer available.');
    rows = rows.map(t => t.id === id ? changed[0] : t); ++readVersion; emit(); return changed[0];
  });
}
export function deleteTask(id) {
  return mutate(async (user, generation) => {
    const deleted = await request(user, generation, 'id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + encodeURIComponent(user), 'DELETE');
    if (!deleted[0]) throw Error('That task is no longer available. Refresh Tasks to check it.');
    rows = rows.filter(t => t.id !== id); ++readVersion; emit();
  });
}
const normalize = text => String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g,' ').trim().slice(0,200);
export function matchTask(phrase, tasks) {
  const wanted = normalize(phrase); if (!wanted) return null;
  const words = new Set(wanted.split(' '));
  const scores = tasks.filter(t => t.status === 'open').map(task => {
    const name = normalize(task.title), tokens = new Set(name.split(' '));
    const overlap = [...words].filter(w => tokens.has(w)).length;
    let score = name === wanted ? 2 : (name.includes(wanted) || wanted.includes(name)) ? 1.2 : 2 * overlap / (words.size + tokens.size);
    if (!overlap && score < 1) score = 0;
    return { task, score };
  }).sort((a,b) => b.score-a.score || String(a.task.created_at || '').localeCompare(String(b.task.created_at || '')) || a.task.id.localeCompare(b.task.id));
  return scores[0]?.score >= 0.6 ? scores[0].task : null;
}
export const lagosDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(date));
export function taskGroup(task, now = Date.now()) {
  if (task.status === 'done') return 'Completed';
  if (!task.due_at) return 'No date';
  if (Date.parse(task.due_at) < now) return 'Overdue';
  return lagosDay(task.due_at) === lagosDay(now) ? 'Today' : 'Upcoming';
}
export const taskDueLabel = due => due ? new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Lagos', weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(due)) + ' (Lagos)' : 'No due date';
onAuthChange(session => {
  const user = session?.user?.id || null; if (user === owner) return;
  owner = user; ++version; ++readVersion; rows = []; queue = Promise.resolve(); emit();
  if (user) queueMicrotask(() => refreshTasks().catch(error => emit(error.message)));
});
window.addEventListener('online', () => { if (owner) refreshTasks().catch(error => emit(error.message)); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && owner) refreshTasks().catch(error => emit(error.message)); });

// Pure Lagos scheduling helpers shared by chat cards, Tasks view and tests.
export const validRecurrence = value => /^(?:daily|weekdays|weekly:[1-7])$/.test(value);
export function nextOccurrence(due, recurrence, now = Date.now()) {
  if (!validRecurrence(recurrence) || !Number.isFinite(Date.parse(due))) throw Error('This recurring task needs a valid due date.');
  let wall = new Date(Date.parse(due) + 3600000), target = now + 3600000;
  do { wall.setUTCDate(wall.getUTCDate() + 1); }
  while (wall.getTime() <= target || (recurrence === 'weekdays' && [0,6].includes(wall.getUTCDay())) || (recurrence.startsWith('weekly:') && (wall.getUTCDay() || 7) !== Number(recurrence.slice(7))));
  return new Date(wall.getTime() - 3600000).toISOString();
}
export const surfaceKey = task => task.id + ':' + new Date(task.due_at).toISOString();
export function dueTasks(tasks, seen = {}, now = Date.now()) {
  return tasks.filter(t => t.status === 'open' && Number.isFinite(Date.parse(t.due_at)) && !seen[surfaceKey(t)] && Date.parse(t.due_at) <= now).sort((a,b) => Date.parse(a.due_at)-Date.parse(b.due_at) || a.id.localeCompare(b.id));
}
export function digestTasks(tasks, now = Date.now()) {
  return tasks.filter(t => t.status === 'open' && Number.isFinite(Date.parse(t.due_at)) && (Date.parse(t.due_at) < now || lagosDay(t.due_at) === lagosDay(now)))
    .sort((a,b) => Date.parse(a.due_at)-Date.parse(b.due_at));
}
export const shouldDigest = (tasks, lastDay, now = Date.now()) => lastDay !== lagosDay(now) && digestTasks(tasks,now).length > 0;
export const tomorrowNine = (now = Date.now()) => { const d = new Date(now+3600000); return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1,8)).toISOString(); };
export function taskCandidates(phrase, tasks) { return tasks.filter(t => matchTask(phrase,[t])); }
