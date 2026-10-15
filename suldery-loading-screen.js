/* Suldery Nails loading screen. Keeps business/auth scripts untouched. */
(()=>{'use strict';
 const mascotCandidates=['assets/suldery-mascota.svg','assets/suldery-nails-icon-512.png','assets/suldery-nails-logo.jpeg'];
 function addLoader(){if(document.getElementById('sn-loading-screen'))return;const overlay=document.createElement('div');overlay.id='sn-loading-screen';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 const card=document.createElement('div');card.className='sn-loading-card';
 const crown=document.createElement('div');crown.className='sn-loading-crown';crown.textContent='♛';
 const mascot=document.createElement('div');mascot.className='sn-loading-mascot';const img=document.createElement('img');img.alt='Mascota de Suldery Nails saludando';img.src=mascotCandidates[0];img.onerror=()=>{const i=mascotCandidates.indexOf(img.getAttribute('src').replace(/^\.\//,''));const next=mascotCandidates[i+1];if(next)img.src=next;else{img.onerror=null;img.src='assets/suldery-nails-logo.jpeg'}};mascot.appendChild(img);
 const title=document.createElement('h1');title.className='sn-loading-title';title.textContent='SULDERY NAILS';const copy=document.createElement('p');copy.className='sn-loading-copy';copy.textContent='Princesa, muy pronto nos vemos ♡';const track=document.createElement('div');track.className='sn-loading-track';const progress=document.createElement('div');progress.className='sn-loading-progress';track.appendChild(progress);const caption=document.createElement('div');caption.className='sn-loading-caption';caption.textContent='Preparando tu espacio bonito…';card.append(crown,mascot,title,copy,track,caption);overlay.appendChild(card);document.body.appendChild(overlay);
 const hide=()=>{overlay.classList.add('sn-loading-hidden');setTimeout(()=>overlay.remove(),520)};window.setTimeout(hide,1300);window.addEventListener('pageshow',()=>window.setTimeout(hide,250),{once:true});
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||a.target==='_blank'||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const href=a.getAttribute('href');if(!href||href.startsWith('#')||href.startsWith('javascript:')||a.hasAttribute('download'))return;let u;try{u=new URL(href,location.href)}catch{return}if(u.origin!==location.origin||u.href===location.href)return;overlay.classList.remove('sn-loading-hidden');document.body.appendChild(overlay);},true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLoader,{once:true});else addLoader();
})();
