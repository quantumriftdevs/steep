import { getSession } from './auth.js';
import { requireAuth } from './guest.js';
import { projectNav, leaveProjects } from './projects-context.js';
import { projectRow } from './projects-icons.js';
import { taskRows, refreshTasks, onTasksChange, addTask, editTask, deleteTask, matchTask, taskGroup, taskDueLabel } from './tasks-data.js';
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
        if (task.notes) details.append(node('p', task.notes));
        const controls = node('div', '', 'task-controls');
        controls.append(button('Edit', () => gated(() => { draft = { id: task.id, title: task.title, notes: task.notes || '', due: localDue(task.due_at) }; api.refresh(); }, notice)), button('Delete', () => gated(async () => { if (!confirm('Delete “' + task.title + '”?')) return; await deleteTask(task.id); notice(''); }, notice)));
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
        event.preventDefault(); const values = { title: title.value, notes: notes.value, due_at: isoDue(due.value) }, id = draft.id;
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
  if (data.taskIntent === 'add') {
    const task = await addTask({ title: data.taskTitle, notes: data.taskNotes, due_at: data.taskDue }, 'chat', data.taskId || (data.taskId = crypto.randomUUID()));
    return { content: 'Added that to your tasks.', taskAdded: { id: task.id, title: task.title, due: task.due_at } };
  }
  const rows = await refreshTasks(); if (!isCurrent()) return null;
  const open = rows.filter(t => t.status === 'open');
  if (data.taskIntent === 'list') return { content: open.length ? 'Your open tasks:\n' + open.map(t => '- ' + t.title + (t.due_at ? ' — ' + taskDueLabel(t.due_at) : '')).join('\n') : 'Your list is clear — no open tasks.' };
  const task = matchTask(data.taskPhrase, open);
  if (!task) return { content: "I couldn't find that task. Try a few more words from its title." };
  if (data.taskIntent === 'complete') { await editTask(task.id, { status: 'done' }); return { content: 'Marked done: ' + task.title + '.' }; }
  if (data.taskIntent === 'delete') { await deleteTask(task.id); return { content: 'Removed: ' + task.title + '.' }; }
  return null;
}
export function taskCard(message, save, notice) {
  if (!message.taskAdded && !message.taskSuggest) return null;
  const card = node('div', '', 'task-chat-card'); let busy = false;
  const user = getSession()?.user?.id;
  const valid = () => !user || getSession()?.user?.id === user;
  const run = action => () => {
    if (busy || !valid()) return;
    gated(async () => { if (busy || !valid()) return; busy = true; draw(); try { await action(); save(); } finally { busy = false; draw(); } }, notice);
  };
  function draw() {
    card.replaceChildren();
    if (message.taskAdded) {
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
