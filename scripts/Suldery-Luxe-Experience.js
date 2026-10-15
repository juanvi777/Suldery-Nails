/* Animación discreta y progresiva; no toca los manejadores de la aplicación. */
(() => {
  const init = () => {
    const targets = [
      '.hero-dashboard', '.stats-grid', '.booking-layout', '.portfolio-section',
      '.reviews-section', '.appointments-card', '.booking-card', '.admin-card',
      '.owner-tool-panel', '.owner-tool-grid', '.login-gallery-wrap',
      '.brand-features', '.form-card', '.experience-cloud', '.catalog-upload-box',
      '.owner-grid', '.care-guide-grid'
    ];
    const elements = [...new Set(targets.flatMap(sel => [...document.querySelectorAll(sel)]))];
    elements.forEach((el, i) => {
      if (el.closest('[hidden]') || el.classList.contains('hidden-tool-panel') ||
          el.classList.contains('hidden-booking') || el.classList.contains('hidden')) return;
      el.classList.add('sn-reveal');
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 65}ms`;
    });
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.sn-reveal').forEach(el => el.classList.add('sn-visible'));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('sn-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    document.querySelectorAll('.sn-reveal').forEach(el => observer.observe(el));
    document.querySelectorAll('.brand-features .feature-chip').forEach((el, i) => {
      el.style.animationDelay = `${i * 180}ms`;
    });
    // Los paneles que se abren después también reciben una entrada suave.
    const mo = new MutationObserver(records => records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        const candidates = [node, ...node.querySelectorAll?.('.owner-tool-panel,.admin-card,.portfolio-section') || []];
        candidates.forEach(el => {
          if (!el.matches?.('.owner-tool-panel,.admin-card,.portfolio-section') || el.classList.contains('sn-reveal')) return;
          el.classList.add('sn-reveal');
          requestAnimationFrame(() => {
            el.classList.add('sn-visible');
          });
        });
      });
    }));
    mo.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();