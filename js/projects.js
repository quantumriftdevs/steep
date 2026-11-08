import { getProject, projectRows, putProject, deleteProject, onProjectsChange } from './projects-store.js';
import { projectNav as nav, enterProject, leaveProjects } from './projects-context.js';
import { projectSelectors, drawProjects, drawProjectChats, projectChip } from './projects-view.js';
import { projectSheet, closeProjectSheet } from './projects-sheet.js';
import { knowledgeFiles } from './projects-files.js';
function field(host, title, value, max, multiline = false) {
  const label = document.createElement('label'), input = document.createElement(multiline ? 'textarea' : 'input');
  label.textContent = title; input.value = value; input.maxLength = max; if (multiline) input.rows = 5;
  label.append(input); host.append(label); return input;
}
export function setupProjects(api) {
  const update = projectSelectors(tab => {
    if (api.busy()) return;
    if (tab === 'chats') { leaveProjects(); api.normal(); }
    else { nav.tab = 'projects'; api.refresh(); }
  });
  function open(id) { if (!api.busy() && enterProject(id)) { api.closeMenu(); api.refresh(); } }
  function create() {
    projectSheet('New project', (host, close) => {
      const name = field(host, 'Name', '', 80), description = field(host, 'Description (optional)', '', 500, true);
      name.required = true;
      const status = document.createElement('p'); status.setAttribute('role', 'status');
      const add = document.createElement('button'); add.type = 'button'; add.className = 'project-primary'; add.textContent = 'Create project';
      add.onclick = () => { try { const p = putProject({ name: name.value, description: description.value }); close(true); open(p.id); } catch (e) { status.textContent = e.message; name.focus(); } };
      host.append(status, add);
    });
  }
  function settings(id) {
    let draft = getProject(id), instructions, files, status, confirming = false;
    if (!draft) return;
    const tell = text => { status.textContent = text; };
    function save() {
      if (!getProject(id)) return true;
      if (files?.busy) { tell('Please wait for file extraction to finish.'); return false; }
      if (confirming) return true;
      try { if (instructions.value !== draft.instructions) draft = putProject({ ...draft, instructions: instructions.value }); return true; }
      catch (e) { tell(e.message); return false; }
    }
    projectSheet('Project settings', (host, close) => {
      function build() {
        confirming = false; host.replaceChildren();
        instructions = field(host, 'Instructions', draft.instructions, 12000, true);
        status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'project-hint';
        files = knowledgeFiles(host, () => draft.files, next => {
          draft = putProject({ ...draft, instructions: instructions.value, files: next });
        }, tell);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'project-danger'; remove.textContent = 'Delete project';
        remove.onclick = () => {
          if (!save()) return; confirming = true; host.replaceChildren();
          const warning = document.createElement('p'); warning.textContent = 'Delete “' + draft.name + '” and all its chats? Instructions and knowledge will also be removed. This cannot be undone.';
          const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.onclick = build;
          const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'project-danger'; confirm.textContent = 'Delete project and chats';
          confirm.onclick = () => { try { deleteProject(id); close(true); } catch (e) { warning.textContent = e.message; } };
          host.append(warning, cancel, confirm); cancel.focus();
        };
        host.append(status, remove);
      }
      build();
    }, save);
  }
  onProjectsChange(error => {
    api.prune();
    if (nav.id && !getProject(nav.id)) { leaveProjects(); closeProjectSheet(); }
    if (error) api.notice(error); api.refresh();
  });
  return {
    reset() { leaveProjects(); closeProjectSheet(); },
    newAction() { if (nav.tab !== 'projects') return false; create(); return true; },
    list(list) { update(nav.tab, api.busy()); if (nav.tab !== 'projects') return false; drawProjects(list, projectRows(), nav.id, open, api.busy()); return true; },
    render(host) {
      const p = getProject(nav.overview ? nav.id : api.current().projectId);
      projectChip(p, () => open(p.id), api.busy());
      if (!nav.overview || !p) return false;
      drawProjectChats(host, p, api.chats(), api.select, () => api.start(p.id), () => settings(p.id), api.busy()); return true;
    },
    beforeSend() { if (nav.overview && getProject(nav.id)) api.start(nav.id, true); }
  };
}
