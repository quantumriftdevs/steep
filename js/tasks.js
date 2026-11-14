import { getSession } from './auth.js';
import { requireAuth } from './guest.js';
import { projectNav, leaveProjects } from './projects-context.js';
import { projectRow } from './projects-icons.js';
import { taskRows, refreshTasks, onTasksChange, addTask, editTask, deleteTask, matchTask, taskGroup, taskDueLabel, taskCandidates, dueTasks, digestTasks, shouldDigest, surfaceKey, lagosDay, tomorrowNine, isCheckin, longWaiting, completionCopy, queryTasks, wrapTasks, shouldWrap } from './tasks-data.js';
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
function button(text, action) { const b = node('button', text); b.type = 'button'; b.onclick = action; return b; }
function gated(action, notice) {
  const run = () => { if (!requireAuth(run)) return; Promise.resolve().then(action).catch(error => notice(error.message || 'Tasks could not sync.')); };
  run();
}
const localDue = due => due ? new Date(Date.parse(due) + 3600000).toISOString().slice(0,16) : '';
const isoDue = value => value ? new Date(value + ':00+01:00').toISOString() : null;
export function setupTasks(api) {
  // Additive only: reuse existing selector markup/styles; do not change drawer/header.
  const css = node('link'); css.rel = 'stylesheet'; css.href = '/css/tasks.css'; document.head.append(css);
  const nav = document.querySelector('.project-selectors');
  const tab = projectRow('Tasks', 'folder', () => gated(async () => {
    if (api.busy()) return; leaveProjects(); projectNav.tab = 'tasks'; api.closeMenu(); api.refresh();
    await refreshTasks();
  }, api.notice));
  tab.id = 'tasks-tab';
  const icon = tab.querySelector('svg'); icon.replaceChildren();
  const path = document.createElementNS(icon.namespaceURI, 'path');
  path.setAttribute('d', 'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6zM4.5 6l1.2 1.2L8 4.8'); icon.append(path);
  const badge = node('span', '', 'tasks-badge'); badge.hidden = true; badge.setAttribute('aria-label','Open tasks'); tab.append(badge); nav.prepend(tab);
  let section, list, status, draft = {}, account = getSession()?.user?.id, completedOpen = false;
  function update() {
    const selected = projectNav.tab === 'tasks'; tab.classList.toggle('active', selected); tab.setAttribute('aria-pressed', String(selected)); tab.disabled = api.busy();
    const count = taskRows().filter(t => t.status === 'open').length; badge.textContent = String(count); badge.hidden = !count;
    badge.setAttribute('aria-label', count + ' open tasks');
    document.querySelector('.composer-wrap').hidden = selected;
  }
  const notice = text => { if (status?.isConnected) { status.textContent = text; status.hidden = !text; } else api.notice(text); };
  function drawList() {
    if (!list?.isConnected) return;
    list.replaceChildren(); const rows = taskRows();
    for (const group of ['Overdue','Today','Upcoming','No date','Completed']) {
      const items = rows.filter(t => taskGroup(t) === group).sort((a,b) => (a.due_at || 'z').localeCompare(b.due_at || 'z') || a.created_at.localeCompare(b.created_at));
      if (!items.length) continue;
      const host = node(group === 'Completed' ? 'details' : 'section', '', 'tasks-group');
      if (group === 'Completed') { host.open = completedOpen; host.ontoggle = () => { completedOpen = host.open; }; host.append(node('summary', 'Completed (' + items.length + ')')); }
      else host.append(node('h2', group));
      for (const task of items) {
        const row = node('div', '', 'task-row'), text = node('span', task.title, 'task-title');
        const toggle = button('', () => gated(async () => { toggle.disabled = true; try { await editTask(task.id, { status: task.status === 'done' ? 'open' : 'done' }); notice(''); } finally { toggle.disabled = false; } }, notice));
        toggle.className = 'task-toggle'; toggle.setAttribute('aria-pressed', String(task.status === 'done'));
        toggle.setAttribute('aria-label', (task.status === 'done' ? 'Reopen ' : 'Complete ') + task.title);
        toggle.append(node('span', task.status === 'done' ? '☑' : '☐', 'task-check'), text);
        const details = node('div', '', 'task-details'); details.append(node('small', taskDueLabel(task.due_at)));
        if (task.notes) { const note = isCheckin(task) ? task.notes.replace(/^\[steep:check-in\]\n?/, '') : task.notes; if (note) details.append(node('p', note)); }
        if (isCheckin(task)) details.append(node('small', 'Check-in'));
        const controls = node('div', '', 'task-controls');
        controls.append(button('Edit', () => gated(() => { draft = { id: task.id, title: task.title, notes: isCheckin(task) ? task.notes.replace(/^\[steep:check-in\]\n?/, '') : task.notes || '', checkin: isCheckin(task), due: localDue(task.due_at) }; api.refresh(); }, notice)), button('Delete', () => gated(async () => { if (!confirm('Delete “' + task.title + '”?')) return; await deleteTask(task.id); notice(''); }, notice)));
        row.append(toggle, details, controls); host.append(row);
      }
      list.append(host);
    }
    if (!rows.length) list.append(node('p', 'No tasks yet. Add one above or ask in chat.', 'tasks-hint'));
  }
  function field(form, label, type, key, max) {
    const wrap = node('label', label), input = node(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    if (max) input.maxLength = max;
    input.value = draft[key] || ''; input.oninput = () => { draft[key] = input.value; }; wrap.append(input); form.append(wrap); return input;
  }
  onTasksChange(error => {
    const user = getSession()?.user?.id;
    if (user !== account) { account = user; draft = {}; completedOpen = false; section = list = status = null; }
    update(); drawList(); if (error) notice(error);
  });
  update();
  return {
    update,
    render(host) {
      update(); if (projectNav.tab !== 'tasks') return false;
      section = node('section', '', 'tasks-view'); section.append(node('h1','Tasks'), node('p','Your private list. All due dates and times use Africa/Lagos.', 'tasks-hint'));
      const refresh = button('Refresh', () => gated(async () => { notice('Refreshing…'); await refreshTasks(); notice(''); }, notice)); section.append(refresh);
      const form = node('form', '', 'tasks-form'); form.append(node('h2', draft.id ? 'Edit task' : 'Add a task'));
      const title = field(form, 'Title', 'text','title',200); title.required = true;
      const notes = field(form, 'Notes (optional)', 'textarea','notes',2000); notes.rows = 3;
      const due = field(form, 'Due date and time (optional, Lagos)', 'datetime-local','due');
      const submit = button(draft.id ? 'Save changes' : 'Add task'); submit.type = 'submit';
      form.onsubmit = event => {
        event.preventDefault(); const values = { title: title.value, notes: draft.checkin ? '[steep:check-in]' + (notes.value ? '\n' + notes.value : '') : notes.value, due_at: isoDue(due.value) }, id = draft.id;
        draft.createId ||= crypto.randomUUID(); const createId = draft.createId;
        gated(async () => { submit.disabled = true; try {
          if (id) await editTask(id, values); else await addTask(values, 'manual', createId);
          draft = {}; api.refresh();
        } finally { submit.disabled = false; } }, notice);
      };
      form.append(submit);
      if (draft.id) form.append(button('Cancel edit', () => { draft = {}; api.refresh(); }));
      status = node('p', '', 'tasks-status'); status.setAttribute('role','alert'); status.hidden = true;
      list = node('div', '', 'tasks-list'); section.append(form, status, list); host.append(section); drawList(); return true;
    }
  };
}
export async function taskReply(data, isCurrent = () => true) {
  if (!data.taskIntent) return null;
  if (!getSession()) throw Error('Please sign in to manage tasks.');
  if (!isCurrent()) return null;
  if (data.taskIntent === 'clarify') return {content:data.reply};
  if (data.taskIntent === 'add') {
    const task = await addTask({ title: data.taskTitle, notes: data.taskNotes, due_at: data.taskDue, recurrence: data.taskRecurrence }, 'chat', data.taskId || (data.taskId = crypto.randomUUID()));
    return { content: 'Added that to your tasks.', taskAdded: { id: task.id, title: task.title, due: task.due_at } };
  }
  const rows = await refreshTasks(); if (!isCurrent()) return null;
  const open = rows.filter(t => t.status === 'open');
  if (data.taskIntent === 'list') {
    const selected = queryTasks(rows,data.taskQuery), finished = data.taskQuery?.startsWith('finished:');
    const label = finished ? 'Completed ' + (data.taskQuery === 'finished:month' ? 'this month' : 'this week') : ({overdue:'Overdue',tomorrow:'Due tomorrow',week:'Due this week'}[data.taskQuery] || 'Your open tasks');
    return {content:label + (selected.length ? ':\n' + selected.map(t=>'- ' + t.title + (t.due_at ? ' - ' + taskDueLabel(t.due_at) : '')).join('\n') : ': nothing here.') + (finished ? '\nBased on saved completed_at timestamps. Reopened/deleted tasks and recurring occurrences are not a completion log.' : '')};
  }
  const candidates = taskCandidates(data.taskPhrase, open);
  if (candidates.length > 1) return {content:'Which task did you mean?\n' + candidates.slice(0,8).map(t => '- ' + t.title).join('\n')};
  const task = candidates[0];
  if (!task) return { content: "I couldn't find that task. Which task?\n" + open.slice(0,5).map(t => '- ' + t.title).join('\n') };
  if (data.taskIntent === 'reschedule') {
    if (!data.taskDue) return {content:'What date and time should I move "' + task.title + '" to? Please repeat the move command with a date.'};
    const moved = await editTask(task.id, {due_at:data.taskDue}); return {content:'Moved "' + moved.title + '" to ' + taskDueLabel(moved.due_at) + '.'};
  }
  if (data.taskIntent === 'complete') { const done = await editTask(task.id, { status: 'done' }); return { content: done.status === 'open' ? completionCopy(task) + ' Next: ' + taskDueLabel(done.due_at) : completionCopy(task) + ' ' + task.title }; }
  if (data.taskIntent === 'delete') { await deleteTask(task.id); return { content: 'Removed: ' + task.title + '.' }; }
  return null;
}
export function taskCard(message, save, notice) {
  if (!message.taskAdded && !message.taskSuggest && !message.taskDigest) return null;
  const card = node('div', '', 'task-chat-card'); let busy = false;
  const user = getSession()?.user?.id;
  const valid = () => !user || getSession()?.user?.id === user;
  const run = action => () => {
    if (busy || !valid()) return;
    gated(async () => { if (busy || !valid()) return; busy = true; draw(); try { await action(); save(); } finally { busy = false; draw(); } }, notice);
  };
  function draw() {
    card.replaceChildren();
    if (message.taskDigest) {
      card.append(node('strong', message.taskDigest.title));
      card.append(node('span', message.taskDigest.items.join(' · ')));
    } else if (message.taskAdded) {
      const task = message.taskAdded; card.append(node('strong','Task added: ' + task.title), node('small',taskDueLabel(task.due)));
      const undo = button('Undo', run(async () => { await deleteTask(task.id); message.taskAdded = null; message.taskSuggest = null; })); undo.disabled = busy; card.append(undo);
    } else if (message.taskSuggest) {
      const suggestion = message.taskSuggest;
      card.append(node('span', "Add '" + suggestion.title + "' as a task?"));
      if (suggestion.due) card.append(node('small',taskDueLabel(suggestion.due)));
      const add = button('Add', run(async () => {
        suggestion.id ||= crypto.randomUUID(); save();
        const task = await addTask({ title: suggestion.title, due_at: suggestion.due }, 'suggested', suggestion.id);
        message.taskSuggest = null; message.taskAdded = { id: task.id, title: task.title, due: task.due_at };
      }));
      const dismiss = button('Dismiss', run(async () => { message.taskSuggest = null; })); add.disabled = dismiss.disabled = busy; card.append(add,dismiss);
    } else card.hidden = true;
  }
  draw(); return card;
}

// Due-event state is deliberately separate from legacy one-shot due-card history.
export const REMINDER_MS = 5 * 60000;
export function reminderCopy(title, count = 0, task = null, now = Date.now()) {
  const waiting = task && longWaiting(task,now) ? " This one's been waiting a while - want to reschedule or let it go?" : '';
  if (task && isCheckin(task)) return title + waiting;
  const phrases = ["It's time: ", "Here's that reminder again: ", "A gentle nudge: ", "Whenever you're ready: "];
  return phrases[count % phrases.length] + title + waiting;
}
export function dueQueue(rows, state = {}, now = Date.now()) {
  return dueTasks(rows, {}, now).filter(task => {
    const event = state[surfaceKey(task)];
    return !event?.acknowledged && (!event || now >= (event.nextAt || event.lastShown + REMINDER_MS));
  });
}
// Injectable clock/storage/view make the lifecycle testable without a browser or network.
export function createDueBanners(io) {
  let account = null, state = {}, active = null, wake = null, disposed = false, cooling = false;
  const later = io.setTimeout || setTimeout, cancel = io.clearTimeout || clearTimeout;
  const now = io.now || Date.now;
  const persist = () => io.write('steep:due-banner:' + account, state);
  function reset(user) {
    cancel(wake); wake = null; active?.view.remove(); active = null; cooling = false;
    account = user; const saved = user ? io.read('steep:due-banner:' + user) : null;
    state = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  }
  function current(item) {
    return account && io.user() === account && io.rows().some(t => t.status === 'open' && surfaceKey(t) === item.key);
  }
  function finish(item, delay = 0, swiped = false) {
    if (active !== item) return;
    cooling = true;
    const leave = () => {
      if (active !== item) return;
      item.view.hide(swiped);
      wake = later(() => {
        if (active !== item) return;
        item.view.remove(); active = null;
        wake = later(() => { cooling = false; tick(); }, 350);
      }, 220);
    };
    wake = later(leave, delay);
  }
  async function okay(item) {
    if (active !== item || item.busy || cooling) return;
    if (!current(item)) { finish(item); return; }
    item.busy = true; item.view.pending(true);
    try {
      // editTask revalidates and conditionally patches this exact due event.
      const result = await io.complete(item.task);
      if (active !== item || io.user() !== account) return;
      state[item.key] = {...state[item.key], acknowledged:true}; persist();
      if (!result) { finish(item); return; }
      item.view.success(); finish(item, 5000);
    } catch (error) {
      if (active !== item || io.user() !== account) return;
      item.busy = false; item.view.pending(false); io.notice(error.message || 'That task could not sync. Please try again.');
    }
  }
  function swipe(item) {
    if (active !== item || item.busy || cooling) return;
    state[item.key] = {...state[item.key], nextAt:now() + REMINDER_MS, acknowledged:false}; persist();
    finish(item, 0, true);
  }
  function tick() {
    if (disposed) return;
    const user = io.user() || null;
    if (user !== account) reset(user);
    if (!user) return;
    if (active) { if (!active.busy && !cooling && !current(active)) finish(active); return; }
    if (cooling || !io.ready()) return;
    cancel(wake);
    const task = dueQueue(io.rows(), state, now())[0];
    if (!task) {
      const next = dueTasks(io.rows(), {}, now()).map(t => state[surfaceKey(t)]).filter(e => e && !e.acknowledged).map(e => e.nextAt || e.lastShown + REMINDER_MS).filter(n => n > now());
      if (next.length) wake = later(tick, Math.max(1, Math.min(...next)-now()));
      return;
    }
    const key = surfaceKey(task), count = state[key]?.reminderCount || 0;
    state[key] = {lastShown:now(), nextAt:now()+REMINDER_MS, reminderCount:count+1, acknowledged:false}; persist();
    const item = {task, key, busy:false}; active = item;
    item.view = io.show(task, reminderCopy(task.title, count, task, now()), {okay:() => okay(item), swipe:() => swipe(item)});
  }
  return {tick, dispose() { disposed = true; reset(null); }};
}
export function showDueBanner(host, task, copy, actions) {
  const el = node('div', '', 'task-due-banner'), text = node('span', copy), okay = button('Okay', actions.okay);
  el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
  text.className = 'task-due-copy'; okay.setAttribute('aria-label','Okay, complete ' + task.title);
  el.append(text, okay); host.prepend(el);
  let start = null, distance = 0;
  const restore = () => { start = null; distance = 0; el.classList.remove('is-dragging'); el.style.transform = ''; el.style.opacity = ''; };
  el.onpointerdown = event => {
    if (event.button !== 0 || event.target.closest('button') || okay.disabled) return;
    start = event.clientY; distance = 0; el.setPointerCapture(event.pointerId); el.classList.add('is-dragging');
  };
  el.onpointermove = event => {
    if (start === null) return;
    distance = Math.max(0,event.clientY-start);
    el.style.transform = 'translateY(' + distance + 'px)'; el.style.opacity = String(Math.max(.15,1-distance/160));
  };
  el.onpointerup = () => { const dismiss = start !== null && distance >= 48; restore(); if (dismiss) actions.swipe(); };
  el.onpointercancel = restore; el.onlostpointercapture = restore;
  return {
    remove:() => el.remove(), pending:value => { okay.disabled = value; },
    success:() => { okay.disabled = true; text.textContent = completionCopy(task); },
    hide:swiped => { restore(); el.classList.add(swiped ? 'is-swiped' : 'is-fading'); }
  };
}

export function setupTaskSecretary(api) {
  let account, checking = false, stopped = false;
  const fallback = new Map();
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback.get(key) ?? null; } catch { return fallback.get(key) || null; } };
  const write = (key,value) => { fallback.set(key,value); try { localStorage.setItem(key,JSON.stringify(value)); } catch {} };
  const banners = createDueBanners({
    user:() => getSession()?.user?.id, rows:taskRows, ready:() => !document.hidden && (api.bannerReady?.() ?? api.ready()), read, write,
    show:(task,copy,actions) => showDueBanner(api.bannerHost,task,copy,actions),
    complete:task => editTask(task.id,{status:'done'},task.due_at), notice:api.notice
  });
  async function tick(refresh = false) {
    banners.tick();
    if (stopped || checking || document.hidden || !getSession()?.user?.id) return;
    checking = true;
    try {
      const user = getSession().user.id;
      if (user !== account) { account = user; refresh = true; }
      if (refresh) await refreshTasks();
      if (getSession()?.user?.id !== user) return;
      banners.tick();
      if (!api.ready()) return;
      const rows = taskRows(), now = Date.now(), digestKey = 'steep:digest:' + user;
      if (shouldDigest(rows,read(digestKey),now)) {
        const today = digestTasks(rows,now);
        api.inject({role:'assistant',content:'Here is your day at a glance.',taskDigest:{title:'Today: ' + today.length + ' tasks',items:[...today.slice(0,5).map(t => t.title + ' — ' + taskDueLabel(t.due_at) + (longWaiting(t,now) ? " - this one's been waiting a while; want to reschedule or let it go?" : '')),...(today.length > 5 ? ['and ' + (today.length-5) + ' more in Tasks'] : [])]}},true);
        write(digestKey,lagosDay(now));
      }
      write(digestKey,lagosDay(now));
      const wrapKey = 'steep:wrap:' + user;
      if (shouldWrap(rows,read(wrapKey),now)) {
        const groups = wrapTasks(rows,now), items = [];
        for (const [key,label] of [['completed','Finished today'],['slipped','Rolled past due today'],['tomorrow','Tomorrow']]) {
          items.push(label + ': ' + groups[key].length);
          items.push(...groups[key].slice(0,5).map(t=>t.title + (key === 'tomorrow' ? ' - ' + taskDueLabel(t.due_at) : '')));
          if (groups[key].length>5) items.push('More in Tasks.');
        }
        api.inject({role:'assistant',content:'A quiet look back, and a little space for tomorrow. Recurring occurrences are not included in finished totals.',taskDigest:{title:'Your evening wrap',items}},true);
        write(wrapKey,lagosDay(now));
      }
    } catch (error) { api.notice(error.message); } finally { checking = false; }
  }
  const unsubscribe = onTasksChange(() => { banners.tick(); queueMicrotask(() => tick()); });
  const timer = setInterval(() => tick(true),60000);
  const visible = () => { if (!document.hidden) tick(true); };
  document.addEventListener('visibilitychange',visible);
  queueMicrotask(() => tick(true));
  return () => { stopped = true; clearInterval(timer); unsubscribe(); banners.dispose(); document.removeEventListener('visibilitychange',visible); };
}