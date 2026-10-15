(() => {
  function initSulderyReviewToggle() {
    const section = document.getElementById('reviewsSection');
    const form = section?.querySelector('.client-review-submit');
    if (!section || !form || section.querySelector('.sn-review-toggle')) return;
    form.classList.add('sn-review-form-collapsed');
    form.id = 'sulderyReviewForm';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sn-review-toggle';
    button.textContent = '♡ Dejar una reseña';
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','sulderyReviewForm');
    form.parentNode.insertBefore(button,form);
    button.addEventListener('click',()=>{
      const open=form.classList.contains('sn-review-form-collapsed');
      form.classList.toggle('sn-review-form-collapsed',!open);
      button.setAttribute('aria-expanded',String(open));
      button.textContent=open?'× Cerrar formulario':'♡ Dejar una reseña';
      if(open) form.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initSulderyReviewToggle,{once:true});
  else initSulderyReviewToggle();
})();
