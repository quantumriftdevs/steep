// Markdown-lite: create DOM nodes rather than interpreting model text as HTML.
function inline(parent, text) {
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    const tag = token.startsWith('**') ? 'strong' : token.startsWith('`') ? 'code' : 'em';
    const node = document.createElement(tag);
    node.textContent = token.slice(tag === 'strong' ? 2 : 1, tag === 'strong' ? -2 : -1);
    parent.append(node);
    last = match.index + token.length;
  }
  parent.append(document.createTextNode(text.slice(last)));
}

export function renderMarkdown(text) {
  const root = document.createDocumentFragment();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let paragraph = null, list = null, code = null;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      paragraph = null; list = null;
      if (code) { code = null; } else {
        const pre = document.createElement('pre');
        code = document.createElement('code'); pre.append(code); root.append(pre);
      }
      continue;
    }
    if (code) { code.textContent += (code.textContent ? '\n' : '') + line; continue; }
    if (!line.trim()) { paragraph = null; list = null; continue; }
    const item = line.match(/^\s*(?:([-*])\s+|(\d+)\.\s+)(.*)$/);
    if (item) {
      paragraph = null;
      const tag = item[2] ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) { list = document.createElement(tag); root.append(list); }
      const li = document.createElement('li'); inline(li, item[3]); list.append(li);
    } else {
      list = null;
      if (!paragraph) { paragraph = document.createElement('p'); root.append(paragraph); }
      else paragraph.append(document.createElement('br'));
      inline(paragraph, line);
    }
  }
  return root;
}
