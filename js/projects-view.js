import { bindMenu } from './context-menu.js'; import { pinMarker } from './sidebar.js'; import { projectRow, projectIcon } from './projects-icons.js';
export function projectSelectors(choose) {
  const nav = document.createElement('nav'); nav.className = 'project-selectors'; nav.setAttribute('aria-label', 'Conversation views');
  const chats = projectRow('Chats', 'chat', () => choose('chats')), projects = projectRow('Projects', 'folder', () => choose('projects'));
  nav.append(chats, projects); document.querySelector('.side-nav').replaceWith(nav);
  return (tab, busy) => {
    for (const [key, button] of [['chats', chats], ['projects', projects]]) {
      button.classList.toggle('active', tab === key); button.setAttribute('aria-pressed', String(tab === key)); button.disabled = busy;
    }
    document.querySelector('.side-label').textContent = tab === 'projects' ? 'Projects' : 'Recents';
    document.querySelector('#new-chat span').textContent = tab === 'projects' ? 'New project' : 'New chat';
  };
}
export function drawProjects(list, rows, active, open, busy, menu) {
  for (const p of rows.filter(p => !p.deleted_at).sort((a, b) => Number(!!b.pinned)-Number(!!a.pinned)||b.updated_at.localeCompare(a.updated_at))) {
    const button = projectRow(p.name, 'folder', () => open(p.id)); button.disabled = busy;
    button.classList.toggle('active', p.id === active); pinMarker(button,p.pinned); if(menu)bindMenu(button,()=>menu(p.id)); list.append(button);
  }
  if (!list.children.length) { const p = document.createElement('p'); p.className = 'project-hint'; p.textContent = 'No projects yet.'; list.append(p); }
}
export function drawProjectChats(host, project, chats, select, start, settings, busy) {
  const view = document.createElement('section'); view.className = 'project-view';
  const header = document.createElement('header'), title = document.createElement('h1'), more = document.createElement('button');
  title.textContent = project.name; more.type = 'button'; more.setAttribute('aria-label', 'Project settings'); more.append(projectIcon('more')); more.onclick = settings; more.disabled = busy;
  header.append(title, more); view.append(header);
  for (const chat of chats.filter(c => c.projectId === project.id && c.messages.length)) {
    const label = chat.customTitle || chat.title || 'Conversation';
    const button = projectRow(label.length > 60 ? label.slice(0, 60) + '…' : label, 'chat', () => select(chat)); button.disabled = busy; view.append(button);
  }
  const add = projectRow('New chat', 'plus', start); add.className = 'project-new-chat'; add.disabled = busy; view.append(add); host.append(view);
}
export function projectChip(project, open, busy) {
  let chip = document.getElementById('project-chip');
  if (!chip) { chip = document.createElement('button'); chip.type = 'button'; chip.id = 'project-chip'; document.getElementById('composer').before(chip); }
  chip.hidden = !project; chip.replaceChildren();
  if (project) { const text = document.createElement('span'); text.textContent = project.name; chip.append(projectIcon('folder'), text); chip.onclick = open; chip.disabled = busy; }
}
