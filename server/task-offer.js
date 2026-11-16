// Only fresh model output is inspected; no server state.
const { taskIntent } = require('../api/task-intent');
const { documentIntent } = require('../api/doc-intent');
const { pageIntent } = require('../api/page-intent');
exports.parseOffer = reply => {
  const start = reply.indexOf('[[OFFER:');
  if (start < 0) return { reply, command: null };
  const visible = reply.slice(0, start).trim() || 'What would you like to do next?';
  const marker = reply.slice(start).match(/^\[\[OFFER:(\{[^\r\n]*\})\]\]\s*$/);
  if (!reply.slice(0, start).trim() || !marker || reply.indexOf('[[OFFER:', start + 1) >= 0) return { reply: visible, command: null };
  try {
    const data = JSON.parse(marker[1]), command = data?.command;
    if (Object.keys(data).length !== 1 || typeof command !== 'string' || command.length > 500 ||
        !/^remind me to [^\r\n]+$/.test(command) || /\[\[|\]\]/.test(command)) return { reply: visible, command: null };
    const messages = [{ role: 'user', content: command }];
    const intent = taskIntent(messages, !!(documentIntent(messages) || pageIntent(messages)));
    return { reply: visible, command: intent?.type === 'add' ? command : null };
  } catch { return { reply: visible, command: null }; }
};
