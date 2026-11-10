export const attachments = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
export function attachmentNote(value) {
  return attachments(value).map(a => (a.kind === 'image' ? '[The user attached a photo: ' + a.name + ']' : 'File attached: ' + a.name) + (a.note ? '\n[' + a.note + ']' : '') + (typeof a.text === 'string' ? '\n' + a.text : '')).join('\n\n');
}
// Wire limits never delete original attachment data from saved messages.
export function modelPayload(messages) {
  const notices = new Set(), refs = [];
  const history = messages.slice(-99).map(message => {
    const files = attachments(message.attachment);
    files.forEach(a => { delete a.requestNote; });
    const m = { role: message.role, content: (files.length ? attachmentNote(files) + '\n\n' : '') + message.content };
    if (message === messages[messages.length - 1] && message.role === 'user') for (const a of files) {
      if (typeof a.data === 'string' && a.data.startsWith('data:image/jpeg;base64,')) refs.push({ m, a, data: a.data, keep: true });
    }
    return m;
  });
  const omit = (ref, reason) => {
    ref.keep = false; ref.a.requestNote = reason;
    ref.m.content += '\n[Photo ' + ref.a.name + ': ' + reason + ']';
    notices.add(reason);
  };
  refs.slice(0, Math.max(0, refs.length - 3)).forEach(ref => omit(ref, 'Image omitted from this request: only the newest 3 images fit the vision context.'));
  const serialize = () => {
    for (const m of history) {
      const images = refs.filter(r => r.keep && r.m === m).map(r => r.data);
      if (images.length) m.images = images; else delete m.images;
    }
    return JSON.stringify({ messages: history });
  };
  let body = serialize();
  const bytes = () => new TextEncoder().encode(body).length;
  const largest = refs.filter(r => r.keep).sort((a, b) => b.data.length - a.data.length);
  while (bytes() > 3500000 && largest.length) {
    omit(largest.shift(), 'Image omitted from this request to stay below the 3.5 MB payload limit.'); body = serialize();
  }
  while (bytes() > 3500000 && history.length > 1) {
    const removed = history.shift(); refs.filter(r => r.m === removed).forEach(r => { r.keep = false; });
    notices.add('Older messages omitted from this request to stay below the 3.5 MB payload limit.'); body = serialize();
  }
  if (bytes() > 3500000) throw new Error('This message is too large even without images. Send fewer files or less text. Your message is kept in this chat.');
  return { body, notice: [...notices].join(' ') };
}
