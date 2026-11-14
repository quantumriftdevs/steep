// Phases describe client-observed boundaries, never server-streamed progress.
export async function clientReply(data,io) {
  const kind=data.pageIntent ? 'page' : data.documentIntent || data.document ? 'document' : data.research ? 'web' : null;
  let failure='';
  const notice=text=>{failure=text;io.notice(text);};
  const step=text=>io.step(text);
  if(kind==='page') { step('Page content received.'); step('Saving your page preview...'); }
  else if(kind==='document') { step('Document content received.'); step('Creating your document file...'); }
  else if(kind==='web') step('Reading response received.');
  const reply=await io.task(data) || await io.page(data,notice) || await io.document(data,notice);
  if(data.research) step('Adding sources from the response...');
  if(kind) {
    const missing=kind==='page' ? !reply.page?.saved : kind==='document' ? !reply.document : false;
    reply.cardOutcome={state:missing ? 'blocked':'done',kind:kind==='web'?'Web reading':kind==='page'?'Page':'Document',title:kind==='web'?'Page reading':kind==='page'?(reply.pageTitle || 'Your page'):'Your document',details:failure || (kind==='web' ? 'Sources returned by the reading request. No server-streamed progress is available.' : 'Steps reflect client-observed phases, not server-streamed progress.')};
    if(missing && !failure) reply.cardOutcome.details='The '+kind+' result was not created. The response is kept below; try again.';
  }
  return reply;
}
