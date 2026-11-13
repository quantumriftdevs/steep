// Render only bounded, public HTTP(S) source links; never interpolate source HTML.
export function sourceList(value) {
  return (Array.isArray(value) ? value : []).slice(0,3).flatMap((s,i) => {
    try { const u = new URL(s.url); if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.href.length > 1500) return []; return [{url:u.href,title:String(s.title || u.hostname).slice(0,160),number:i+1}]; } catch (_) { return []; }
  });
}
export function sourcesCard(value) {
  const sources=sourceList(value); if (!sources.length) return null;
  const card=document.createElement('nav'); card.className='research-sources'; card.setAttribute('aria-label','Reply sources');
  const label=document.createElement('span'); label.textContent='Sources'; card.append(label);
  for (const s of sources) { const link=document.createElement('a'); link.href=s.url; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent='['+s.number+'] '+s.title; card.append(link); }
  return card;
}
