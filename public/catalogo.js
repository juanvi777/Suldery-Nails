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

function renderCatalog(){
  const grid=document.getElementById('catalogGrid');
  const counter=document.getElementById('catalogCounter');
  const empty=document.getElementById('catalogEmpty');
  if(!grid)return;
  grid.innerHTML='';
  if(counter)counter.textContent=`${catalogPhotos.length} ${catalogPhotos.length===1?'diseño':'diseños'}`;
  if(!catalogPhotos.length){empty?.classList.remove('hidden');return;}
  empty?.classList.add('hidden');
  catalogPhotos.forEach(photo=>{
    const card=document.createElement('article');card.className='catalog-client-card';
    card.innerHTML=`<button type="button" class="catalog-client-image-button" aria-label="Ver ${escapeHtml(photo.title || 'diseño')}"><img src="${escapeAttr(apiAssetUrl(photo.image_url))}" alt="${escapeAttr(photo.title || 'Diseño de Suldery Nails')}" loading="lazy" decoding="async"></button><div class="catalog-client-card-caption"><strong>${escapeHtml(photo.title || 'Diseño Suldery Nails')}</strong></div>`;
    const image=card.querySelector('img');image.addEventListener('error',()=>{card.classList.add('image-error');});
    grid.appendChild(card);
  });
}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escapeAttr(value){return escapeHtml(value);}
document.addEventListener('DOMContentLoaded',initCatalogo);
