import { flushProject } from './projects-store.js';
import { bytes } from './projects-cache.js';
import { authHeaders, getSession } from './auth.js';
import { modelPayload } from './messages.js';
export async function projectPayload(chat, payload) {
  if (!chat.projectId) return payload.body;
  const project = await flushProject(chat.projectId);
  const body = JSON.stringify({ ...JSON.parse(payload.body), projectId: project.id });
  const context = JSON.stringify({ instructions: project.instructions, files: project.files });
  if (bytes(body) + bytes(context) + 24000 > 3500000) throw Error('This message and project knowledge exceed the request budget. Shorten the message or remove an attachment.');
  return body;
}
export async function projectRetry(chat, messages) {
  const owner = getSession()?.user?.id;
  const payload = modelPayload(messages), body = await projectPayload(chat, payload);
  const headers = await authHeaders();
  if (!owner || getSession()?.user?.id !== owner) throw Error('Account changed.');
  return { body, headers: { 'Content-Type': 'application/json', ...headers }, owner, notice: payload.notice };
}
