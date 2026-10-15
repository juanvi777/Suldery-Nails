let catalogPhotos = [];

async function initCatalogo() {
  const user = await requireRole('client');
  if (!user) return;
  try {
    const data = await apiFetch('/catalog');
    catalogPhotos = Array.isArray(data.photos) ? data.photos : [];
    renderCatalog();
  } catch (error) {
    document.getElementById('catalogCounter').textContent = 'No se pudo cargar el catálogo';
    document.getElementById('catalogEmpty').textContent = error.message;
    document.getElementById('catalogEmpty').classList.remove('hidden');
  }
}

function renderCatalog(){const grid=document.getElementById('catalogGrid'),counter=document.getElementById('catalogCounter'),empty=document.getElementById('catalogEmpty');if(!grid)return;grid.innerHTML='';if(counter)counter.textContent=`${catalogPhotos.length} ${catalogPhotos.length===1?'diseño':'diseños'}`;if(!catalogPhotos.length){empty?.classList.remove('hidden');return;}empty?.classList.add('hidden');catalogPhotos.forEach((photo,index)=>{const card=document.createElement('article');card.className='catalog-client-card';card.innerHTML=`<button type="button" class="catalog-client-image-button" aria-label="Ver ${escapeHtml(photo.title||'diseño')}"><img src="${escapeAttr(apiAssetUrl(photo.image_url))}" alt="${escapeAttr(photo.title||'Diseño de Suldery Nails')}" loading="lazy" decoding="async"></button><div class="catalog-client-card-caption"><span>Diseño ${index+1} de ${catalogPhotos.length}</span><strong>${escapeHtml(photo.title||'Diseño Suldery Nails')}</strong></div>`;grid.appendChild(card);card.querySelector('img').addEventListener('error',()=>card.classList.add('image-error'));card.querySelector('button').addEventListener('click',()=>openCatalogViewer(index));});}
function openCatalogViewer(index){let modal=document.getElementById('catalogLightbox');if(!modal){modal=document.createElement('div');modal.id='catalogLightbox';modal.className='catalog-lightbox';modal.innerHTML='<div class="catalog-lightbox-card"><button class="catalog-lightbox-close" type="button" aria-label="Cerrar">×</button><button class="catalog-lightbox-arrow prev" type="button" aria-label="Anterior">‹</button><img class="catalog-lightbox-image" alt=""><button class="catalog-lightbox-arrow next" type="button" aria-label="Siguiente">›</button><div class="catalog-lightbox-caption"></div></div>';document.body.appendChild(modal);modal.querySelector('.catalog-lightbox-close').addEventListener('click',()=>modal.classList.remove('open'));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');});modal.querySelector('.prev').addEventListener('click',()=>openCatalogViewer((Number(modal.dataset.index)-1+catalogPhotos.length)%catalogPhotos.length));modal.querySelector('.next').addEventListener('click',()=>openCatalogViewer((Number(modal.dataset.index)+1)%catalogPhotos.length));}modal.dataset.index=String(index);const photo=catalogPhotos[index];modal.querySelector('.catalog-lightbox-image').src=apiAssetUrl(photo.image_url);modal.querySelector('.catalog-lightbox-image').alt=photo.title||'Diseño Suldery Nails';modal.querySelector('.catalog-lightbox-caption').textContent=`${index+1} / ${catalogPhotos.length} · ${photo.title||'Diseño Suldery Nails'}`;modal.classList.add('open');}

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escapeAttr(value){return escapeHtml(value);}
document.addEventListener('DOMContentLoaded',initCatalogo);
