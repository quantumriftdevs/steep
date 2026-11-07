import { renderMarkdown } from './markdown.js';
import { attachmentView } from './attach-view.js';

export function bubble(messages, role, content, attachment) {
  const row = document.createElement('div'); row.className = `message ${role}`;
  if (role === 'assistant') {
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = 's'; row.append(avatar);
  }
  const body = document.createElement('div'); body.className = 'bubble';
  if (role === 'assistant') body.append(renderMarkdown(content)); else {
    if (attachment) body.append(attachmentView(attachment));
    body.append(document.createTextNode(content));
  }
  row.append(body); messages.append(row); return body;
}

export async function animate(body, reply, scrollDown) {
  const words = reply.match(/\S+\s*|\s+/g) || [reply];
  let text = ''; body.classList.add('streaming');
  for (const word of words) {
    text += word; body.replaceChildren(renderMarkdown(text)); scrollDown();
    await new Promise(resolve => setTimeout(resolve, 24));
  } body.classList.remove('streaming');
}
