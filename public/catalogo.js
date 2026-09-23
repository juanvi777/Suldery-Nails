let catalogPhotos = [];
let catalogIndex = 0;

async function initCatalogo() {
  const user = await requireRole('client');
  if (!user) return;
  document.getElementById('catalogPrevious')?.addEventListener('click', () => moveCatalog(-1));
  document.getElementById('catalogNext')?.addEventListener('click', () => moveCatalog(1));
  try {
    const data = await apiFetch('/catalog');
    catalogPhotos = Array.isArray(data.photos) ? data.photos : [];
    renderCatalog();
  } catch (error) {
    document.getElementById('catalogCounter').textContent = 'No se pudo cargar el catálogo';
    document.getElementById('catalogEmpty').textContent = error.message;
    document.getElementById('catalogEmpty').classList.remove('hidden');
    document.getElementById('catalogStage')?.classList.add('hidden');
  }
}

function moveCatalog(direction) {
  if (!catalogPhotos.length) return;
  catalogIndex = (catalogIndex + direction + catalogPhotos.length) % catalogPhotos.length;
  renderCatalog();
}

function preloadNearbyPhotos() {
  if (!catalogPhotos.length) return;
  const offsets = [1, 2, 3, -1, -2, -3];
  offsets.forEach(offset => {
    const index = (catalogIndex + offset + catalogPhotos.length) % catalogPhotos.length;
    const photo = catalogPhotos[index];
    if (!photo?.image_url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = photo.image_url;
  });
}

function renderCatalog() {
  const counter = document.getElementById('catalogCounter');
  const title = document.getElementById('catalogTitle');
  const image = document.getElementById('catalogImage');
  const stage = document.getElementById('catalogStage');
  const empty = document.getElementById('catalogEmpty');
  const dots = document.getElementById('catalogDots');
  if (!catalogPhotos.length) {
    counter.textContent = 'Catálogo vacío';
    title.textContent = '';
    empty.classList.remove('hidden');
    stage.classList.add('hidden');
    dots.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  stage.classList.remove('hidden');
  const photo = catalogPhotos[catalogIndex];
  counter.textContent = `${catalogIndex + 1} de ${catalogPhotos.length}`;
  title.textContent = photo.title || 'Diseño Suldery Nails';
  image.src = photo.image_url;
  image.alt = photo.title || 'Diseño de Suldery Nails';
  image.loading = 'eager';
  image.decoding = 'async';
  image.classList.add('is-loading');
  image.onload = () => image.classList.remove('is-loading');
  preloadNearbyPhotos();
  dots.innerHTML = '';
  catalogPhotos.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `carousel-dot${index === catalogIndex ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Ver diseño ${index + 1}`);
    dot.addEventListener('click', () => { catalogIndex = index; renderCatalog(); });
    dots.appendChild(dot);
  });
}

document.addEventListener('DOMContentLoaded', initCatalogo);
