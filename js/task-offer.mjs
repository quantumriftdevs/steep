// One-use, tab-memory offers; never restored from saved messages.
export function createTaskOffer() {
  let pending = null;
  const clear = () => { pending = null; };
  const sync = (scope, now = Date.now()) => {
    if (pending && (!scope.user || pending.user !== scope.user || pending.chat !== scope.chat || scope.away || now < pending.at || now - pending.at >= 600000)) clear();
  };
  return {
    clear, sync,
    arm(command, scope, now = Date.now()) {
      clear();
      if (scope.user && !scope.away && typeof command === 'string' && /^remind me to [^\r\n]+$/.test(command) && command.length <= 500) pending = { command, ...scope, at: now };
    },
    consume(text, scope, now = Date.now()) {
      sync(scope, now);
      const offer = pending;
      clear();
      if (!offer) return { type: 'input' };
      const answer = String(text).trim().replace(/[.!?]+$/, '').toLowerCase().replace(/’/g, "'");
      if (/^(?:yes|yeah|yup|yep|yh|correct|exactly|affirmative|sure|sure thing|ok|okay|okey|do it|go ahead|please do)$/.test(answer)) return { type: 'accept', command: offer.command };
      if (/^(?:no|nope|don't)$/.test(answer)) return { type: 'decline' };
      if (answer.length <= 40 && answer.split(/\s+/u).length <= 6) return { type: 'classify', command: offer.command, at: offer.at };
      return { type: 'input' };
    }
  };
}
export function offerRequest(body, answer) {
  if (answer.type === 'classify') { const data = JSON.parse(body); delete data.taskPending; return JSON.stringify({...data,taskOfferReply:{command:answer.command,at:answer.at}}); }
  if (answer.type !== 'accept') return body;
  const data = JSON.parse(body), messages = data.messages.map(m => ({ ...m }));
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { messages[i].content = answer.command; break; }
  delete data.taskPending;
  return JSON.stringify({ ...data, messages });
}
