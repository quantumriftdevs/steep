(()=>{
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 if(motion.matches||!('IntersectionObserver'in window))return;
 const targets=[...document.querySelectorAll('.strip,#features .center,#features .card,#how .center,#how .step,#love .center,#love .quote,#pricing .pricebox,#faq .faq-grid,.final,footer')];
 const root=document.documentElement,colors=['#f33d32','#e8dc5b','#8fd4ba','#a8a3ff'],touch=matchMedia('(pointer: coarse)').matches;
 let crew,ghosts,observer,queue=[],moving=[],running=false,next=0,seq=0,dir=0,prev=scrollY,failed=false;
 function reveal(e){e.classList.remove('scroll-pending');e.dataset.scrollState='built'}
 function rescue(){failed=true;root.classList.remove('scroll-ready');targets.forEach(reveal);observer?.disconnect();crew?.remove();ghosts?.remove()}
 window.addEventListener('error',rescue,{once:true});
 motion.addEventListener?.('change',e=>{if(e.matches)rescue()});
 try{
  ghosts=document.createElement('div');ghosts.className='scroll-ghost-layer section';ghosts.setAttribute('aria-hidden','true');ghosts.inert=true;
  crew=document.createElement('div');crew.className='scroll-layer';crew.setAttribute('aria-hidden','true');
  const cursors=colors.map((c,i)=>{const n=document.createElement('div');n.className='scroll-cursor';n.innerHTML=`<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><path fill="${c}" stroke="#101010" d="M1 1v16l4-4 3.5 7 3-1.5-3.5-7H15z"/></svg><span style="background:${c}">agent-0${i+1}</span>`;crew.append(n);return n});
  document.body.append(ghosts,crew);
  targets.forEach(e=>{if(e.getBoundingClientRect().top>=innerHeight){e.classList.add('scroll-pending');e.dataset.scrollState='pending'}else e.dataset.scrollState='built'});
  root.classList.add('scroll-ready');
  function schedule(){if(!running&&!failed){running=true;requestAnimationFrame(frame)}}
  function frame(now){try{
   running=false;if(failed)return;
   if(queue.length&&now>=next){const e=queue.shift();if(e.dataset.scrollState==='queued'){
    const r=e.getBoundingClientRect(),i=seq++%4,side=i%2?1:-1,g=e.cloneNode(true);
    g.removeAttribute('id');g.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));g.classList.remove('scroll-pending');g.classList.add('scroll-moving');
    Object.assign(g.style,{position:'absolute',left:'0',top:'0',margin:'0',width:r.width+'px',height:r.height+'px'});
    ghosts.append(g);e.dataset.scrollState='dragging';
    moving.push({el:e,ghost:g,i,side,x:r.left,y:r.top+scrollY,dx:side<0?-r.right-30:innerWidth-r.left+30,start:now,duration:touch?1000:1200});
    next=now+(touch?360:400);
   }}
   const occupied={};
   for(let k=moving.length-1;k>=0;k--){const m=moving[k],p=Math.min(1,(now-m.start)/m.duration),ease=1-Math.pow(1-p,3),x=m.dx*(1-ease),rot=m.side*3*(1-p);
    const lift=p<.76?-6*ease:-6*(1-(p-.76)/.24)+2*Math.sin((p-.76)/.24*Math.PI);
    m.ghost.style.transform=`translate3d(${m.x+x}px,${m.y-scrollY+lift}px,0) rotate(${rot}deg)`;
    occupied[m.i]=[Math.max(2,Math.min(innerWidth-70,m.x+x+10)),Math.max(3,Math.min(innerHeight-28,m.y-scrollY+lift+10))];
    if(p>=1){m.ghost.remove();reveal(m.el);moving.splice(k,1)}
   }
   cursors.forEach((c,i)=>{let [x,y]=occupied[i]||[i%2?innerWidth+110:-110,innerHeight*(.22+i*.14)];if(!occupied[i]&&Number.isFinite(c.px)){const a=1-Math.exp(-Math.min(64,now-(c.pt||now))/130);x=c.px+(x-c.px)*a;y=c.py+(y-c.py)*a}c.px=x;c.py=y;c.pt=now;c.style.transform=`translate3d(${x}px,${y}px,0)`});
   crew.dataset.active=(moving.length||queue.length)?'true':'false';if(queue.length||moving.length)schedule();
  }catch(e){rescue()}}
  observer=new IntersectionObserver(entries=>{for(const entry of entries){const e=entry.target;if(entry.isIntersecting&&e.dataset.scrollState==='pending'){
   if(dir<=0){reveal(e);observer.unobserve(e);continue}
   e.dataset.scrollState='queued';queue.push(e);observer.unobserve(e);
   setTimeout(()=>{if(['queued','dragging'].includes(e.dataset.scrollState)){reveal(e);queue=queue.filter(x=>x!==e);moving=moving.filter(m=>{if(m.el===e){m.ghost.remove();return false}return true})}},2500+targets.length*(touch?360:400));
  }}if(queue.length)schedule()});
  targets.filter(e=>e.dataset.scrollState==='pending').forEach(e=>observer.observe(e));
  addEventListener('scroll',()=>{const y=scrollY;dir=Math.sign(y-prev);prev=y;if(dir<0){queue.forEach(reveal);queue=[]}schedule()},{passive:true});
 }catch(e){rescue()}
})();
