/* Suldery Nails v6.2 — pantalla de carga con la muñeca oficial. */
(()=>{'use strict';
 const mascot='assets/suldery-mascota.png?v=20261015-v62';
 function addLoader(){
  if(document.getElementById('sn-loading-screen'))return;
  const overlay=document.createElement('div');overlay.id='sn-loading-screen';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
  const card=document.createElement('div');card.className='sn-loading-card';
  const crown=document.createElement('div');crown.className='sn-loading-crown';crown.textContent='♛';
  const mascotWrap=document.createElement('div');mascotWrap.className='sn-loading-mascot';
  const img=document.createElement('img');img.alt='Muñeca de Suldery Nails saludando';img.src=mascot;img.decoding='async';img.setAttribute('fetchpriority','high');
  img.onerror=()=>{img.onerror=null;img.src='assets/suldery-nails-logo.jpeg';};mascotWrap.appendChild(img);
  const title=document.createElement('h1');title.className='sn-loading-title';
  const titleMain=document.createElement('span');titleMain.textContent='Suldery';const titleScript=document.createElement('em');titleScript.textContent='Nails';title.append(titleMain,titleScript);
  const copy=document.createElement('p');copy.className='sn-loading-copy';copy.textContent='Princesa, muy pronto nos vemos ♡';
  const track=document.createElement('div');track.className='sn-loading-track';track.setAttribute('aria-hidden','true');const progress=document.createElement('div');progress.className='sn-loading-progress';track.appendChild(progress);
  const caption=document.createElement('div');caption.className='sn-loading-caption';caption.textContent='Cargando tu espacio… ♡';
  card.append(crown,mascotWrap,title,copy,track,caption);overlay.appendChild(card);document.body.appendChild(overlay);
  const start=performance.now(),minimum=1500;let hidden=false;
  const hide=()=>{if(hidden)return;const remaining=minimum-(performance.now()-start);if(remaining>0){window.setTimeout(hide,remaining);return;}hidden=true;overlay.classList.add('sn-loading-hidden');window.setTimeout(()=>overlay.remove(),620);};
  window.setTimeout(hide,minimum);
  document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||a.target==='_blank'||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const href=a.getAttribute('href');if(!href||href.startsWith('#')||href.startsWith('javascript:')||a.hasAttribute('download'))return;let u;try{u=new URL(href,location.href)}catch{return}if(u.origin!==location.origin||u.href===location.href)return;hidden=false;overlay.classList.remove('sn-loading-hidden');if(!overlay.isConnected)document.body.appendChild(overlay);},true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLoader,{once:true});else addLoader();
})();
