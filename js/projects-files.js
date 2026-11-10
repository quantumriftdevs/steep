import { readAttachment } from './attach-text.js';
import { keepOriginal, previewOriginal } from './attach-view.js';
import { bytes } from './projects-cache.js';
import { projectIcon } from './projects-icons.js';
export function knowledgeFiles(host, get, change, notice) {
  const heading = document.createElement('h3'); heading.textContent = 'Knowledge';
  const list = document.createElement('div'), add = document.createElement('button'), input = document.createElement('input');
  add.type = 'button'; add.textContent = 'Add files'; input.type = 'file'; input.multiple = true; input.hidden = true;
  input.accept = '.txt,.md,.csv,.json,.log,.html,.xml,.pdf,.docx';
  const hint = document.createElement('p'); hint.className = 'project-hint'; hint.textContent = '10 files · 60,000 characters each · 120,000 total. Text, PDF or DOCX; 20 MB per upload. Tap a file to open its original. Originals up to 96 KB each / 128 KB encoded per project are saved; larger originals are available temporarily on this page only.';
  host.append(heading, list, add, input, hint);
  let busy = false;
  function render() {
    list.replaceChildren();
    for (const file of get()) {
      const row = document.createElement('div'); row.className = 'project-file';
      const info = document.createElement('div'), name = document.createElement('span'), size = document.createElement('small');
      name.textContent = file.name; size.textContent = (bytes(file.text) / 1024).toFixed(1) + ' KB extracted text'; info.append(name, size);
      info.tabIndex=0;info.setAttribute('role','button');info.setAttribute('aria-label','Preview original '+file.name);info.style.cursor='pointer';
      info.onclick=()=>previewOriginal(file);info.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();previewOriginal(file);}};
      if(file.originalNote){const note=document.createElement('small');note.textContent=file.originalNote;info.append(note);}
      const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', 'Remove ' + file.name); remove.append(projectIcon('remove')); remove.disabled = busy;
      remove.onclick = () => { try { change(get().filter(f => f.id !== file.id)); render(); add.focus(); } catch (e) { notice(e.message); } };
      row.append(info, remove); list.append(row);
    }
    add.disabled = busy || get().length >= 10;
  }
  add.onclick = () => input.click();
  input.onchange = async () => {
    const picked = [...input.files]; input.value = ''; busy = true; render(); notice('Extracting file text…');
    try {
      const next = [...get()], notes = [];
      let remaining=Math.max(0,128*1024-next.reduce((n,f)=>n+(f.original?.length||0),0));
      for (const file of picked) {
        if (next.length >= 10) throw Error('Maximum 10 knowledge files.');
        if (file.size > 20 * 1024 * 1024) throw Error('Each source file must be 20 MB or smaller.');
        const result = await readAttachment(file);
        if (!host.isConnected) return;
        if (!result.text?.trim()) throw Error(result.note || 'No text could be extracted from ' + file.name + '.');
        const original=await keepOriginal(file,remaining);remaining-=original.original?.length||0;
        next.push({ id: crypto.randomUUID(), name: file.name.slice(0, 255), text: result.text.slice(0, 60000), note: (result.note || '').slice(0, 200), ...original });
        if (result.note) notes.push(file.name + ': ' + result.note);
      }
      change(next); notice(notes.join(' ') || 'Files saved.');
    } catch (e) { if (host.isConnected) notice(e.message || 'File extraction failed.'); }
    finally { busy = false; if (host.isConnected) render(); }
  };
  render(); return { get busy() { return busy; } };
}
