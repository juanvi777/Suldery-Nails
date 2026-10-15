/* Suldery Nails WOW — transiciones discretas y Lahia IA */
(() => {
  'use strict';
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal progresivo: si JS/observer falla, el contenido sigue visible.
  if (!reducedMotion && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('sn-wow-ready');
    const selectors = [
      '.hero-dashboard', '.hero-section', '.brand-panel', '.form-panel',
      '.stats-grid > *', '.owner-tool-grid > *', '.owner-grid > *',
      '.admin-card', '.portfolio-heading', '.portfolio-photo',
      '.catalog-client-card', '.catalog-owner-card', '.booking-card',
      '.calendar-card', '.review-card', '.client-daily-welcome',
      '.owner-detail-panel', '.owner-tool-panel', '.photo-owner-group'
    ];
    const elements = [...new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]))];
    elements.forEach((el, i) => {
      if (el.closest('[hidden],.hidden,.hidden-tool-panel,.hidden-ai-panel')) return;
      el.classList.add('sn-wow-reveal');
      el.style.setProperty('--sn-wow-delay', `${Math.min(i % 5, 4) * 55}ms`);
    });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('sn-wow-visible');
        } else {
          entry.target.classList.remove('sn-wow-visible');
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -7% 0px' });
    elements.forEach(el => {
      if (el.classList.contains('sn-wow-reveal')) observer.observe(el);
    });
  }

  // Identidad Lahia: cambia solo textos visibles; no sustituye funciones de la IA existente.
  const replacements = [
    [/SulNail IA/g, 'Lahia IA'],
    [/SULNAIL IA/g, 'LAHIA IA'],
    [/Nail Lab/g, 'Lahia IA'],
    [/Herramientas Nail Lab/g, 'Herramientas de Lahia IA']
  ];
  const ownerPanel = document.getElementById('ownerToolNailLab');
  if (ownerPanel) {
    replacements.forEach(([pattern, value]) => {
      ownerPanel.querySelectorAll('h2,h3,p,button,strong,span,[aria-label]').forEach(el => {
        if (el.children.length === 0 && el.textContent) el.textContent = el.textContent.replace(pattern, value);
        const aria = el.getAttribute('aria-label');
        if (aria) el.setAttribute('aria-label', aria.replace(pattern, value));
      });
    });
    const ask = document.getElementById('aiAssistantAsk');
    if (ask) ask.innerHTML = 'Consultar a Lahia IA <span>✦</span>';
    const oldNote = ownerPanel.querySelector('.lahia-engine-note');
    if (!oldNote) {
      const answer = document.getElementById('aiAssistantAnswer');
      if (answer) {
        const note = document.createElement('div');
        note.className = 'lahia-engine-note';
        note.setAttribute('role','note');
        note.innerHTML = '<span class="lahia-engine-mark" aria-hidden="true">✦</span><span class="lahia-engine-copy"><small>ASISTENTE</small><strong>Lahia IA</strong></span><span class="lahia-engine-divider" aria-hidden="true"></span><span class="lahia-engine-copy"><small>MOTOR PREVISTO</small><strong>EMPRE.IA</strong></span><span class="lahia-engine-status"><i aria-hidden="true"></i> Conexión pendiente</span>';
        answer.insertAdjacentElement('afterend', note);
      }
    }
  }
})();