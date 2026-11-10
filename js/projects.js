import { getProject, projectRows, putProject, deleteProject, onProjectsChange } from './projects-store.js';
import { projectNav as nav, enterProject, leaveProjects } from './projects-context.js';
import { projectSelectors, drawProjects, drawProjectChats, projectChip } from './projects-view.js';
import { projectSheet, closeProjectSheet } from './projects-sheet.js';
import { knowledgeFiles } from './projects-files.js'; import { requireAuth } from './guest.js';
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
  function open(id) { if (!requireAuth(() => open(id))) return; if (!api.busy() && enterProject(id)) { api.closeMenu(); api.refresh(); } }
  function create() { if (!requireAuth(create)) return;
    projectSheet('New project', (host, close) => {
      const name = field(host, 'Name', '', 80), description = field(host, 'Description (optional)', '', 500, true);
      name.required = true;
      const status = document.createElement('p'); status.setAttribute('role', 'alert');
      const add = document.createElement('button'); add.type = 'button'; add.className = 'project-primary'; add.textContent = 'Create project';
      add.onclick = () => { try { const p = putProject({ name: name.value, description: description.value }); close(true); open(p.id); } catch (e) { status.hidden=false; status.textContent = e.message; name.focus(); } };
      host.append(status, add);
    });
  }
  function rename(id) { if(!requireAuth(()=>rename(id)))return; const p=getProject(id);if(!p)return; projectSheet('Rename project',(host,close)=>{const name=field(host,'Name',p.name,80);name.style.fontSize='16px'; const status=document.createElement('p'),save=document.createElement('button');status.setAttribute('role','alert');save.type='button';save.className='project-primary';save.textContent='Save';save.onclick=()=>{try{const latest=getProject(id);if(!latest)throw Error('Project is unavailable.');putProject({...latest,name:name.value});close(true);}catch(e){status.hidden=false;status.textContent=e.message;}};host.append(status,save);name.focus();}); } function rowMenu(id) { const p=getProject(id);if(!p)return []; const run=fn=>()=>{if(api.busy())return;if(!requireAuth(()=>run(fn)()))return;try{fn();}catch(e){api.notice(e.message);}};return [{label:p.pinned?'Unpin':'Pin',icon:'pin',run:run(()=>{const latest=getProject(id);if(latest)putProject({...latest,pinned:!latest.pinned});})},{label:'Rename',icon:'rename',run:run(()=>rename(id))},{label:'Delete',icon:'delete',danger:true,run:run(()=>settings(id,true))}]; } function settings(id, deleting = false) { if(!requireAuth(()=>settings(id,deleting)))return;
    let draft = getProject(id), instructions, files, status, confirming = false;
    if (!draft) return;
    const tell = text => { status.setAttribute('role', /^(Extracting file text|Please wait for file extraction)/.test(text) ? 'status' : 'alert'); status.hidden=false; status.textContent = text; };
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
        status = document.createElement('p'); status.setAttribute('role', 'alert'); status.className = 'project-hint';
        files = knowledgeFiles(host, () => draft.files, next => {
          draft = putProject({ ...draft, instructions: instructions.value, files: next });
        }, tell);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'project-danger'; remove.textContent = 'Delete project';
        remove.onclick = () => {
          if (!save()) return; confirming = true; host.replaceChildren();
          const warning = document.createElement('p'); warning.textContent = 'Delete “' + draft.name + '” and all its chats? Instructions and knowledge will also be removed. This cannot be undone.';
          const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.onclick = build;
          const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'project-danger'; confirm.textContent = 'Delete project and chats';
          confirm.onclick = () => { try { deleteProject(id); close(true); } catch (e) { warning.setAttribute('role','alert'); warning.hidden=false; warning.textContent = e.message; } };
          host.append(warning, cancel, confirm); cancel.focus();
        };
        host.append(status, remove); if(deleting){deleting=false;remove.click();}
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
    list(list) { update(nav.tab, api.busy()); if (nav.tab !== 'projects') return false; drawProjects(list, projectRows(), nav.id, open, api.busy(), rowMenu); return true; },
    render(host) {
      const p = getProject(nav.overview ? nav.id : api.current().projectId);
      projectChip(p, () => open(p.id), api.busy());
      if (!nav.overview || !p) return false;
      drawProjectChats(host, p, api.chats(), api.select, () => api.start(p.id), () => settings(p.id), api.busy()); return true;
    },
    beforeSend() { if (nav.overview && getProject(nav.id)) api.start(nav.id, true); }
  };
}
