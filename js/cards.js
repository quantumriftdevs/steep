// Serializable presentation model; agent actions remain supplied by their caller.
export const CARD_STATES = Object.freeze({queued:'Queued',starting:'Starting',working:'Working',waiting:'Waiting on you',done:'Done',blocked:'Blocked',partial:'Partially done',cancelled:'Cancelled'});
const el = (tag,text,cls) => { const n=document.createElement(tag); if(text != null) n.textContent=text; if(cls) n.className=cls; return n; };
export function statusChip(label,tone='') { return el('span',label,'steep-chip '+tone); }
export function renderCard(model={}) {
  const state = Object.hasOwn(CARD_STATES,model.state) ? model.state : 'queued';
  const card=el('section',null,'steep-card steep-card--'+state); card.dataset.state=state;
  card.setAttribute('aria-label',(model.title || 'Task')+' — '+CARD_STATES[state]);
  const top=el('div',null,'steep-card-top'); top.append(el('span',model.kind || 'Task','steep-card-kind'),statusChip(CARD_STATES[state],state));
  card.append(top,el('h3',model.title || 'Task'));
  if(model.summary) card.append(el('p',model.summary));
  if(model.steps?.length) {
    const steps=el('ol',null,'steep-card-steps'); steps.setAttribute('aria-live','polite');
    for(const step of model.steps) steps.append(el('li',step)); card.append(steps);
  }
  if(model.rows?.length) {
    const rows=el('ul',null,'steep-card-rows');
    for(const row of model.rows) { const li=el('li'); li.append(el('span',row.title)); if(row.label) li.append(statusChip(row.label,row.tone)); if(row.detail) li.append(el('small',row.detail)); rows.append(li); } card.append(rows);
  }
  const result=el('div',null,'steep-card-result'); card.append(result);
  if(model.details) { const details=el('details'); details.append(el('summary','Details'),el('p',model.details)); card.append(details); }
  return {card,result};
}
export function messageCard(body,message) {
  if(!message.cardOutcome && !message.taskAdded && !message.taskSuggest && !message.taskDigest && !message.taskCompleted && !message.taskQuery && !message.taskQuestion && !message.document && !message.pageIntent && !message.sources?.length) return;
  const model=message.cardOutcome || {state:message.taskSuggest || message.taskQuestion ? 'waiting':'done',kind:'Secretary',title:message.taskDigest?.title || (message.taskAdded ? 'Task added' : message.taskCompleted ? 'Task completed' : message.taskQuery?.title || 'A little help')};
  model.rows=message.taskQuery?.rows || message.taskDigest?.rows || model.rows;
  const {card,result}=renderCard(model);
  for(const old of body.querySelectorAll('.task-chat-card')) old.className='steep-task-actions';
  result.append(...body.childNodes); body.replaceChildren(card); body.classList.add('has-task-card');
}
export function progressCard(host,title,first) {
  const model={state:'working',kind:'In progress',title,steps:[]};
  const paint=() => { host.classList.remove('typing'); host.classList.add('has-task-card'); host.replaceChildren(renderCard(model).card); };
  const step=text=>{ model.steps.push(text); paint(); };
  step(first); return {step,finish(state,details){model.state=state;model.details=details;paint();return {...model,steps:[...model.steps]};}};
}
