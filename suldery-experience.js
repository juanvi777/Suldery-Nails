(() => {
  const byId = id => document.getElementById(id);
  const readMascotSvg = async () => {
    const response = await fetch(new URL('assets/suldery-mascota.svg', document.baseURI));
    if (!response.ok) throw new Error('No se pudo cargar la mascota');
    return response.text();
  };

  async function mountMascot(node) {
    if (!node || node.dataset.mounted === '1') return;
    node.dataset.mounted = '1';
    try {
      const svg = await readMascotSvg();
      // El SVG local es un recurso de marca del propio sitio; al insertarlo en línea
      // sus animaciones de saludo y guiño funcionan también en navegadores móviles.
      node.innerHTML = svg;
      const root = node.querySelector('svg');
      if (root) { root.setAttribute('role','img'); root.setAttribute('aria-label','Muñequita de Suldery Nails saludando y guiñando un ojo'); }
    } catch {
      const fallback = document.createElement('img');
      fallback.src = new URL('assets/suldery-nails-logo.jpeg', document.baseURI).href;
      fallback.alt = 'Logo de Suldery Nails';
      fallback.className = 'sn-mascot-fallback';
      node.appendChild(fallback);
    }
  }

  function initLoginHero() {
    const panel = document.querySelector('body.auth-page .brand-panel-inner');
    if (!panel || panel.querySelector('.sn-login-hero-lockup')) return;
    const title = panel.querySelector(':scope > h1');
    const copy = panel.querySelector(':scope > .brand-copy');
    if (!title || !copy) return;
    const lockup = document.createElement('div');
    lockup.className = 'sn-login-hero-lockup';
    const textBlock = document.createElement('div');
    textBlock.className = 'sn-login-copy-block';
    const mascot = document.createElement('div');
    mascot.className = 'sn-mascot-stage';
    title.parentNode.insertBefore(lockup, title);
    textBlock.append(title, copy);
    lockup.append(textBlock, mascot);
    void mountMascot(mascot);
  }

  function initSplash() {
    if (document.querySelector('.sn-loading-screen')) return;
    const splash = document.createElement('div');
    splash.className = 'sn-loading-screen';
    splash.setAttribute('role','status');
    splash.setAttribute('aria-label','Cargando Suldery Nails');
    splash.innerHTML = `
      <div class="sn-loading-card">
        <div class="sn-loading-mascot"></div>
        <div class="sn-loading-logo-frame"><img class="sn-loading-logo" src="assets/suldery-nails-logo.jpeg" alt="Logo de Suldery Nails"></div>
        <h1 class="sn-loading-brand">SULDERY NAILS</h1>
        <p class="sn-loading-princess">Princesa,</p>
        <p class="sn-loading-message">muy pronto nos vemos ♡</p>
        <div class="sn-loading-sparkles" aria-hidden="true">✧　✦　✧</div>
        <div class="sn-loading-track" aria-hidden="true"><span></span></div>
        <small class="sn-loading-caption">Cargando tu espacio… ♡</small>
      </div>`;
    document.body.appendChild(splash);
    void mountMascot(splash.querySelector('.sn-loading-mascot'));
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      splash.classList.add('is-leaving');
      window.setTimeout(() => splash.remove(), 700);
    };
    window.addEventListener('load', () => window.setTimeout(dismiss, 950), { once:true });
    window.setTimeout(dismiss, 4800);
    if (document.readyState === 'complete') window.setTimeout(dismiss, 1700);
  }

  function addStoryPhoto(container, photo, index) {
    if (!photo) return;
    const figure = document.createElement('figure');
    figure.className = 'sn-story-photo';
    figure.style.setProperty('--sn-photo-rotation', index % 2 ? '2deg' : '-2deg');
    const image = document.createElement('img');
    image.src = typeof window.apiAssetUrl === 'function'
      ? window.apiAssetUrl(photo.image_url)
      : photo.image_url;
    image.alt = photo.title || 'Diseño de uñas de Suldery Nails';
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.appendChild(image);
    container.appendChild(figure);
  }

  function makeStoryPanel(config, photos) {
    const article = document.createElement('article');
    article.className = 'sn-story-panel';
    article.setAttribute('data-sn-reveal','');
    const left = document.createElement('div');
    left.className = 'sn-story-photos sn-story-photos-left';
    const copy = document.createElement('div');
    copy.className = 'sn-story-copy';
    const right = document.createElement('div');
    right.className = 'sn-story-photos sn-story-photos-right';
    addStoryPhoto(left, photos[0], 0);
    addStoryPhoto(right, photos[1], 1);
    copy.innerHTML = `
      <span class="sn-story-icon" aria-hidden="true">${config.icon}</span>
      <p class="sn-story-kicker">${config.kicker}</p>
      <h3>${config.title}</h3>
      <div class="sn-story-rule" aria-hidden="true">♡</div>
      ${config.paragraphs.map(p => `<p>${p}</p>`).join('')}
      <p class="sn-story-signoff">${config.signoff}</p>`;
    article.append(left, copy, right);
    return article;
  }

  async function initLongStory() {
    const oldStory = byId('clientThanksShowcase');
    const reviews = byId('reviewsSection');
    if (!reviews || byId('snSulderyStory')) return;
    if (oldStory) oldStory.classList.add('sn-story-legacy-hidden');

    const section = document.createElement('section');
    section.id = 'snSulderyStory';
    section.className = 'sn-suldery-story';
    section.setAttribute('aria-label','La historia de Suldery Nails');
    section.innerHTML = `
      <header class="sn-story-intro">
        <p class="eyebrow">UNA HISTORIA HECHA CON AMOR</p>
        <h2>Detrás de cada cita, hay un sueño</h2>
        <p>Esta historia no se ha construido sola. Está hecha de esfuerzo, fe, manos llenas de ilusión y clientas que han creído en mí desde el principio. ♡</p>
      </header>`;
    const chapters = [
      {
        icon:'♡', kicker:'GRACIAS POR CAMINAR CONMIGO',
        title:'Gracias, mis clientas hermosas',
        paragraphs:[
          'Quiero darles las gracias de todo corazón por el apoyo que me han brindado hasta hoy. Cada cita que reservan, cada vez que vuelven, cada mensaje bonito y cada recomendación ha sido una caricia para este sueño que llevo en el alma.',
          'Ustedes no solo han venido a arreglarse las uñas: me han regalado su confianza, me han permitido conocer sus historias, compartir sonrisas y seguir aprendiendo. Detrás de cada servicio hay horas de trabajo, ilusión y ganas de entregarles algo hecho con mucho cariño.',
          'Todo lo que he conseguido hasta ahora también lleva un pedacito de ustedes. Gracias por elegirme, por hablar de mi trabajo, por regresar y por ayudarme a que Suldery Nails crezca paso a paso. Nunca voy a dar por sentado ese apoyo tan bonito.'
        ],
        signoff:'Con todo mi cariño y gratitud, Suldery ♡'
      },
      {
        icon:'✦', kicker:'UN CAMINO LLENO DE ESFUERZO',
        title:'Un comienzo sobre dos ruedas',
        paragraphs:[
          'Al principio, cuando este sueño apenas empezaba a tomar forma, hacía domicilios en bicicleta. Preparaba mis herramientas, organizaba mis materiales y salía de un lugar a otro con la ilusión de trabajar en lo que amo, aunque el camino no siempre fuera sencillo.',
          'Hubo días de cansancio, de correr contra el tiempo y de preguntarme cuándo llegaría el momento de avanzar un poquito más. Pero cada clienta que me abría la puerta, cada palabra de ánimo y cada persona que confiaba en mis manos me daba fuerzas para continuar.',
          'Ese esfuerzo me enseñó a valorar cada oportunidad y a no olvidar de dónde vengo. No fue magia ni ocurrió de un día para otro: fueron constancia, fe, trabajo honesto y muchas personas lindas que me acompañaron sin saber cuánto significaba para mí.'
        ],
        signoff:'Cada paso, incluso los más difíciles, tuvo un propósito. ♡'
      },
      {
        icon:'✧', kicker:'HOY, UN SUEÑO HECHO REALIDAD',
        title:'Gracias a Dios y a ustedes, sigo creciendo',
        paragraphs:[
          'Hoy puedo mirar hacia atrás y sentir una gratitud inmensa con Dios y con cada una de ustedes. Gracias a ese apoyo, al trabajo de tantos días y a las oportunidades que fueron llegando, pude dejar atrás los domicilios en bicicleta y dedicarme de una manera más completa a mi pasión.',
          'Tener este espacio y seguir construyendo Suldery Nails significa muchísimo para mí. Quiero que cada visita sea especial, que se sientan escuchadas, que puedan elegir un diseño que las haga sonreír y que reciban una atención cálida, cuidadosa y hecha con amor.',
          'Todavía hay sueños por cumplir, cosas por aprender y metas que me emocionan. Quiero seguir mejorando, crear nuevas experiencias y hacer crecer este proyecto sin perder lo más importante: el cariño por mi trabajo y el agradecimiento a las clientas que han sido parte de esta historia desde sus primeros pasos.'
        ],
        signoff:'Este sueño también es de ustedes. Gracias por hacerlo posible. ♡'
      }
    ];
    let portfolioPhotos = [];
    try {
      if (typeof window.apiFetch === 'function') {
        const data = await window.apiFetch('/portfolio?visibility=client');
        portfolioPhotos = Array.isArray(data.photos) ? data.photos : [];
      }
    } catch {}
    chapters.forEach((chapter, i) => {
      const first = portfolioPhotos[i * 2] || portfolioPhotos[0];
      const second = portfolioPhotos[i * 2 + 1] || portfolioPhotos[(i + 1) % Math.max(portfolioPhotos.length, 1)];
      const pair = [first, second].filter(Boolean);
      section.appendChild(makeStoryPanel(chapter, pair.length ? pair : []));
    });
    reviews.parentNode.insertBefore(section, reviews);
    initScrollReveal(section);
  }

  function initScrollReveal(root = document) {
    const items = root.querySelectorAll('[data-sn-reveal]:not(.is-visible)');
    if (!items.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach(item => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin:'0px 0px -35px 0px' });
    items.forEach(item => observer.observe(item));
  }

  function initReviews() {
    const section = byId('reviewsSection');
    if (!section || section.dataset.snReviewReady === '1') return;
    section.dataset.snReviewReady = '1';
    const heading = section.querySelector('.reviews-heading h2');
    if (heading) heading.textContent = 'Reseñas publicadas';
    const viewer = byId('reviewsViewer');
    viewer?.classList.remove('hidden-review-viewer');
    const summary = byId('reviewsToggleButton');
    summary?.setAttribute('aria-expanded','true');

    const form = section.querySelector('.client-review-submit');
    if (!form) return;
    form.classList.add('sn-review-form-collapsed');
    form.id = 'sulderyReviewForm';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sn-review-toggle';
    button.textContent = '♡ Dejar reseña';
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','sulderyReviewForm');
    const actions = document.createElement('div');
    actions.className = 'sn-review-actions';
    actions.appendChild(button);
    const headingRow = section.querySelector('.reviews-heading');
    if (headingRow) headingRow.insertAdjacentElement('afterend', actions);
    else section.insertBefore(actions, form);

    button.addEventListener('click', () => {
      const open = form.classList.contains('sn-review-form-collapsed');
      form.classList.toggle('sn-review-form-collapsed', !open);
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? '× Cerrar formulario' : '♡ Dejar reseña';
      if (open) form.scrollIntoView({behavior:'smooth', block:'nearest'});
    });
  }

  function start() {
    if (document.body.classList.contains('auth-page') && document.querySelector('.brand-panel-inner')) {
      initLoginHero();
      initSplash();
    }
    if (byId('reviewsSection')) {
      // El formulario se oculta antes de que la clienta empiece a recorrer la página.
      initReviews();
      void initLongStory();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
