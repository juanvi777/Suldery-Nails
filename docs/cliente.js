let currentUser = null;
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = '';
let selectedTime = '';
let selectedService = '';
let calendarData = new Map();
let clientReviews = [];
let clientReviewIndex = 0;
let selectedReviewStars = 0;
const $ = id => document.getElementById(id);
function formatTime12(timeValue) {
  const text = String(timeValue ?? '').slice(0, 5);
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return text || 'Hora pendiente';
  let hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}
function safeFormatTime12(timeValue) {
  try { return formatTime12(timeValue); } catch { return String(timeValue ?? 'Hora pendiente'); }
}
window.formatTime12 = window.formatTime12 || formatTime12;

function isoDate(year, month, day) { return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function serviceDuration(service) { return {'Manicure semipermanente':90,'Pedicure semipermanente':60,'Dipping':120,'Press on':120}[service] || 0; }
function durationLabel(minutes) {
  if (minutes === 60) return '1 hora';
  if (minutes === 120) return '2 horas';
  if (minutes === 90) return '1 h 30 min';
  return `${minutes} min`;
}
function updateServiceDurationHint(){
  const service = $('service').value;
  $('serviceDurationHint').textContent = service
    ? `Duración de la cita: ${durationLabel(serviceDuration(service))}`
    : 'Primero elige qué servicio deseas realizarte.';
}
function setStepVisibility(element,visible){ if(element) element.classList.toggle('hidden-step',!visible); }

async function initCliente(){
  currentUser=await requireRole('client'); if(!currentUser)return;
  void syncExistingSulderyPushSubscription();
  $('welcomeName').textContent=`Hola, ${currentUser.name}`;
  $('openBookingButton').addEventListener('click',openBooking);
  $('closeBookingButton').addEventListener('click',closeBooking);
  $('previousMonth').addEventListener('click',previousMonth); $('nextMonth').addEventListener('click',nextMonth);
  $('bookingButton').addEventListener('click',crearCita);
  $('enableNotificationsButton')?.addEventListener('click', async () => { try { await enableSulderyPush(); $('enableNotificationsButton').textContent='🔔 Avisos activos'; alert('Listo 💕. Este dispositivo quedó registrado para recibir tus avisos importantes.'); } catch (error) { alert(error.message); } });
  if ($('enableNotificationsButton')) {
    const checkButton = document.createElement('button');
    checkButton.type = 'button';
    checkButton.className = 'small-button ghost';
    checkButton.id = 'checkNotificationsButton';
    checkButton.textContent = 'Comprobar avisos';
    checkButton.addEventListener('click', async () => { try { const result = await checkSulderyPush(); alert(result.message); } catch (error) { alert(error.message); } });
    $('enableNotificationsButton').insertAdjacentElement('afterend', checkButton);
  }
  $('service').addEventListener('change',onServiceChange);
  $('reviewsToggleButton')?.addEventListener('click', toggleReviewsViewer);
  $('reviewPreviousButton')?.addEventListener('click', () => moveReview(-1));
  $('reviewNextButton')?.addEventListener('click', () => moveReview(1));
  $('reviewStarPicker')?.addEventListener('click', chooseReviewStars);
  $('submitReviewButton')?.addEventListener('click', submitClientReview);
  updateServiceDurationHint();
  renderCalendar();
  await refreshCalendar();
  await Promise.all([loadAppointments(),loadGallery(),loadReviews()]);
  populateReviewableAppointments();
  try {
    const push = await getSulderyPushStatus();
    if ($('enableNotificationsButton')) {
      if (push.needsAttention) $('enableNotificationsButton').textContent='🔔 Revisar avisos';
      else if (push.subscribed) $('enableNotificationsButton').textContent='🔔 Avisos activos';
    }
  } catch {}
}

function openBooking(){ $('agenda').classList.remove('hidden-booking'); setTimeout(()=>$('agenda').scrollIntoView({behavior:'smooth',block:'start'}),20); $('calendarFeedback').textContent='Selecciona un día disponible para continuar.'; }
function closeBooking(){ $('agenda').classList.add('hidden-booking'); resetBooking(); window.scrollTo({top:0,behavior:'smooth'}); }
function resetBooking(){
  selectedDate=''; selectedTime=''; selectedService=''; $('service').value=''; updateServiceDurationHint();
  setStepVisibility($('serviceStep'),true); setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false);
  $('calendarFeedback').textContent='Selecciona un día disponible para continuar.'; $('timeSlots').innerHTML='<span class="time-help">Primero selecciona una fecha.</span>'; $('timeHint').textContent='Selecciona primero un día'; setMessage($('bookingMessage'),''); renderCalendar();
}
async function onServiceChange(){
  selectedService = $('service').value;
  updateServiceDurationHint();
  selectedTime = '';
  selectedDate = '';
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  clearTimeSelection();
  if (!selectedService) {
    $('calendarFeedback').textContent = 'Primero elige un servicio. Así te mostraremos solo los días y horas que realmente pueden funcionar.';
    renderCalendar();
    return;
  }
  await refreshCalendar();
}
async function previousMonth(){const now=new Date();const minMonth=new Date(now.getFullYear(),now.getMonth(),1);const target=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);if(target<minMonth)return;currentMonth=target;selectedDate='';selectedTime='';setStepVisibility($('bookingSummary'),false);setStepVisibility($('bookingButton'),false);clearTimeSelection();await refreshCalendar();}
async function nextMonth(){currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);selectedDate='';selectedTime='';setStepVisibility($('bookingSummary'),false);setStepVisibility($('bookingButton'),false);clearTimeSelection();await refreshCalendar();}
async function refreshCalendar(){
  const key = monthKey(currentMonth);
  $('calendarMonthLabel').textContent = new Date(currentMonth).toLocaleDateString('es-CO', { month:'long', year:'numeric' });

  if (!selectedService) {
    calendarData = new Map();
    renderCalendar();
    return;
  }

  try {
    const data = await apiFetch(`/calendar?month=${encodeURIComponent(key)}&service=${encodeURIComponent(selectedService)}`);
    calendarData = new Map(data.days.map(day => [day.date, day]));
    renderCalendar();
  } catch (error) {
    $('calendarFeedback').textContent = error.message;
    shake(document.querySelector('.booking-card'));
  }
}
function renderCalendar(){
  const year=currentMonth.getFullYear(), month=currentMonth.getMonth(); const first=(new Date(year,month,1).getDay()+6)%7; const days=new Date(year,month+1,0).getDate(); const grid=$('calendarDays'); grid.innerHTML='';
  for(let i=0;i<first;i++){const empty=document.createElement('span');empty.className='calendar-empty';grid.appendChild(empty);} const today=new Date();today.setHours(0,0,0,0);
  for(let day=1;day<=days;day++){
    const date=isoDate(year,month,day);
    const meta = !selectedService
      ? {status:'past',slots:0,message:'Primero elige un servicio.'}
      : (calendarData.get(date)||{status:'closed',slots:0,message:'Fecha no disponible.'}); const localDate=new Date(year,month,day); const button=document.createElement('button');button.type='button';button.className=`calendar-day ${meta.status}`;if(date===selectedDate)button.classList.add('selected');if(localDate.getTime()===today.getTime())button.classList.add('today');
    const weekday=localDate.toLocaleDateString('es-CO',{weekday:'short'}).replace('.',''); const statusLabel=meta.status==='available'?'Disponible':meta.status==='blocked'?'Bloqueado':meta.status==='rest'?'Descanso':meta.status==='full'?'Agotado':meta.status==='past'?'Pasado':'No disponible';
    button.innerHTML=`<strong>${day}</strong><span class="calendar-weekday">${weekday}</span><small>${statusLabel}</small>`;
    if(meta.status==='past'){button.disabled=true;button.title='Esta fecha ya pasó.';} else if(meta.status==='available'){button.addEventListener('click',()=>selectDate(date));button.title=`${meta.slots} horario${meta.slots===1?'':'s'} disponible${meta.slots===1?'':'s'}`;} else {button.addEventListener('click',()=>showDayMessage(meta));button.title=meta.message;}
    grid.appendChild(button);
  }
  $('previousMonth').disabled = !selectedService || currentMonth <= new Date(today.getFullYear(),today.getMonth(),1);
  $('nextMonth').disabled = !selectedService;
  if (!selectedService) $('calendarFeedback').textContent = '💕 Primero elige un servicio. Después podrás elegir el día y te mostraremos exactamente qué horas quedan libres.';
}
function showDayMessage(meta){selectedDate='';selectedTime='';setStepVisibility($('bookingSummary'),false);setStepVisibility($('bookingButton'),false);renderCalendar();clearTimeSelection();$('calendarFeedback').textContent=meta.message;shake($('calendarFeedback'));}
async function selectDate(date){
  if (!selectedService) {
    $('calendarFeedback').textContent = 'Primero elige el servicio para saber qué horarios realmente te sirven.';
    return;
  }

  selectedDate = date;
  selectedTime = '';
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  renderCalendar();
  $('calendarFeedback').textContent = `Elegiste ${formatDate(date)}. Ahora revisemos el horario completo para ${durationLabel(serviceDuration(selectedService))}.`;
  $('timeHint').textContent = `Turnos de ${durationLabel(serviceDuration(selectedService))}`;
  $('timeSlots').innerHTML = '<span class="time-help">Cargando horarios…</span>';
  $('dayTimeline').innerHTML = '<p class="time-help">Cargando el estado de todo el día…</p>';

  try {
    const data = await apiFetch(`/appointments/slots?date=${encodeURIComponent(date)}&service=${encodeURIComponent(selectedService)}`);
    renderSlots(data.slots || []);
    renderDayTimeline(data.timeline || [], data.slots || []);
    if (!data.slots?.length) {
      $('calendarFeedback').textContent = data.message || 'Ese día no tiene un espacio que complete todo el servicio.';
    }
  } catch (error) {
    $('timeSlots').innerHTML = `<span class="time-help">${escapeHtml(error.message)}</span>`;
    $('dayTimeline').innerHTML = `<p class="time-help">${escapeHtml(error.message)}</p>`;
    shake(document.querySelector('.booking-card'));
  }
}

function renderSlots(slots){
  const wrap = $('timeSlots');
  wrap.innerHTML = '';
  if (!slots.length) {
    wrap.innerHTML = '<span class="time-help">No queda una hora que permita completar el servicio sin cruzar una cita, una pausa o el almuerzo.</span>';
    return;
  }
  slots.forEach(time => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'time-slot';
    button.dataset.time = time;
    button.textContent = safeFormatTime12(time);
    button.title = `Comienza a las ${safeFormatTime12(time)}`;
    if (time === selectedTime) button.classList.add('selected');
    button.addEventListener('click', () => selectTime(time));
    wrap.appendChild(button);
  });
}

function timelineStatusLabel(status, reason) {
  if (status === 'available') return 'Disponible';
  if (status === 'occupied') return 'Ocupado';
  if (status === 'lunch') return 'Almuerzo';
  if (status === 'blocked') return 'Bloqueado';
  if (status === 'past') return 'Hora pasada';
  return reason || 'No disponible';
}

function renderDayTimeline(timeline, availableSlots) {
  const box = $('dayTimeline');
  box.innerHTML = '';
  if (!timeline.length) {
    box.innerHTML = '<p class="time-help">No hay jornada configurada para este día.</p>';
    return;
  }

  const available = new Set(availableSlots);
  timeline.forEach(item => {
    const row = document.createElement('div');
    row.className = `day-timeline-row ${item.status}`;
    if (available.has(item.time)) row.classList.add('is-selectable');
    row.innerHTML = `
      <strong>${safeFormatTime12(item.time)}</strong>
      <span>${escapeHtml(timelineStatusLabel(item.status, item.reason))}</span>
    `;
    if (item.status === 'occupied' && item.client_name) {
      row.title = `${item.client_name} ya tiene una cita a esta hora.`;
    } else if (item.reason) {
      row.title = item.reason;
    }
    if (available.has(item.time)) {
      row.addEventListener('click', () => selectTime(item.time));
    }
    box.appendChild(row);
  });
}

function selectTime(time){selectedTime=time;document.querySelectorAll('.time-slot').forEach(button=>button.classList.toggle('selected',button.dataset.time===time));$('calendarFeedback').textContent=`${formatDate(selectedDate)} a las ${safeFormatTime12(time)}. Verifica los datos antes de confirmar.`;updateSummary();}
function updateSummary(){ $('summaryDate').textContent=formatDate(selectedDate); $('summaryTime').textContent=safeFormatTime12(selectedTime); $('summaryService').textContent=selectedService; $('summaryDuration').textContent=durationLabel(serviceDuration(selectedService)); setStepVisibility($('bookingSummary'),true);setStepVisibility($('bookingButton'),true);$('bookingSummary').scrollIntoView({behavior:'smooth',block:'nearest'}); }
function clearTimeSelection(){
  $('timeSlots').innerHTML='<span class="time-help">Primero elige un servicio y después un día.</span>';
  $('dayTimeline').innerHTML='<p class="time-help">Aquí aparecerá el estado del horario cuando elijas un día.</p>';
  $('timeHint').textContent='Selecciona primero un servicio y un día';
  setMessage($('bookingMessage'),'');
}
async function crearCita(){
  const message = $('bookingMessage');
  const button = $('bookingButton');
  if (!selectedService) { setMessage(message, 'Primero selecciona el servicio que deseas realizarte.'); return; }
  if (!selectedDate) { setMessage(message, 'Primero selecciona un día disponible.'); return; }
  if (!selectedTime) { setMessage(message, 'Ahora selecciona una hora disponible.'); return; }

  button.disabled = true;
  setMessage(message, 'Enviando tu solicitud a Suldery… 💕');

  try {
    const data = await apiFetch('/appointments', {
      method:'POST',
      body:JSON.stringify({ service:selectedService, date:selectedDate, time:selectedTime })
    });

    const bookedDate = selectedDate;
    const successMessage = data.message || `💕 Tu cita para ${formatDate(bookedDate)} a las ${safeFormatTime12(selectedTime)} quedó enviada y está pendiente de confirmación por parte de Suldery.`;

    // La creación de la cita ya fue confirmada por el servidor. Las actualizaciones
    // de la agenda se hacen aparte para que un fallo secundario de carga nunca
    // convierta una cita guardada en un falso mensaje de “espacio ocupado”.
    setMessage(message, successMessage, true);
    $('calendarFeedback').textContent = data.already_exists
      ? '💕 Esta solicitud ya estaba registrada. Suldery la está revisando.'
      : '💕 Tu solicitud quedó enviada y está pendiente de confirmación. Te avisaremos cuando haya una respuesta.';
    $('calendarFeedback').classList.add('success');
    selectedTime = '';
    setStepVisibility($('bookingSummary'), false);
    setStepVisibility($('bookingButton'), false);
    $('timeSlots').innerHTML = '<span class="time-help success-help">💕 Solicitud enviada. Esta cita queda pendiente de confirmación de Suldery.</span>';

    try {
      await loadAppointments();
      await refreshCalendar();
      selectedDate = bookedDate;
      renderCalendar();
    } catch (refreshError) {
      console.warn('La cita ya fue creada; no se pudo refrescar toda la agenda:', refreshError);
    }
  } catch (error) {
    setMessage(message, error.message);
    shake(document.querySelector('.booking-card'));
    try { await refreshCalendar(); } catch {}
  } finally {
    button.disabled = false;
  }
}

async function loadAppointments(){const data=await apiFetch('/appointments/my'); window.__sulderyAppointments = Array.isArray(data.appointments) ? data.appointments : [];const list=$('appointmentsList');list.innerHTML='';if(!data.appointments.length){list.innerHTML='<div class="empty-state">Todavía no tienes citas.</div>';return;}data.appointments.forEach(appt=>{const item=document.createElement('article');item.className='appointment-item';const statusText=appt.status==='accepted'?'Confirmada':appt.status==='pending'?'Pendiente de confirmación':appt.status==='cancelled'?'Cancelada':'Rechazada';item.innerHTML=`<div class="appointment-top"><strong>${escapeHtml(appt.service)}</strong><span class="status ${appt.status}">${statusText}</span></div><p>${formatDate(appt.appointment_date)} · ${safeFormatTime12(appt.appointment_time)} · ${durationLabel(Number(appt.duration_minutes))}</p>`;if(['pending','accepted'].includes(appt.status)){const cancel=document.createElement('button');cancel.type='button';cancel.className='link-button subtle-link';cancel.textContent='Cancelar cita';cancel.addEventListener('click',()=>cancelarCita(appt.id));item.appendChild(cancel);}list.appendChild(item);});}
async function cancelarCita(id){if(!confirm('¿Quieres cancelar esta cita?'))return;try{await apiFetch(`/appointments/${id}/cancel`,{method:'PATCH'});await Promise.all([loadAppointments(),refreshCalendar()]);if(selectedDate)await selectDate(selectedDate);}catch(error){setMessage($('bookingMessage'),error.message);shake(document.querySelector('.booking-card'));}}


function reviewStars(value) {
  const numeric = Math.max(0, Math.min(5, Number(value) || 0));
  const rounded = Math.round(numeric);
  return rounded ? '★'.repeat(rounded) + '☆'.repeat(5 - rounded) : '☆☆☆☆☆';
}

async function loadReviews() {
  try {
    const data = await apiFetch('/reviews');
    clientReviews = Array.isArray(data.reviews) ? data.reviews : [];
    clientReviewIndex = 0;
    const average = Number(data.average || 0);
    $('reviewScore').textContent = clientReviews.length ? average.toFixed(1) : '—';
    $('reviewStarsSummary').textContent = reviewStars(average);
    $('reviewTotal').textContent = Number(data.count || clientReviews.length || 0);
    renderCurrentReview();
    populateReviewableAppointments();
  } catch (error) {
    $('reviewScore').textContent = '—';
    $('reviewStarsSummary').textContent = '☆☆☆☆☆';
    $('reviewTotal').textContent = '0';
    const card = $('currentReviewCard');
    if (card) card.innerHTML = `<p class="empty-state">No pudimos cargar las reseñas ahora. ${escapeHtml(error.message)}</p>`;
  }
}

function renderCurrentReview() {
  const card = $('currentReviewCard');
  const dots = $('reviewDots');
  if (!card || !dots) return;
  dots.innerHTML = '';
  if (!clientReviews.length) {
    card.innerHTML = '<p class="empty-state">Todavía no hay reseñas. Sé la primera en contar tu experiencia. 💕</p>';
    return;
  }
  const review = clientReviews[clientReviewIndex];
  card.innerHTML = `<div class="review-card-stars">${reviewStars(review.stars)}</div><blockquote>“${escapeHtml(review.comment || '')}”</blockquote><strong>${escapeHtml(review.client_name || 'Clienta')}</strong><small>${review.created_at ? escapeHtml(formatDate(String(review.created_at).slice(0,10))) : ''}</small>`;
  clientReviews.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button'; dot.className = `carousel-dot${i === clientReviewIndex ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Ver reseña ${i + 1}`);
    dot.addEventListener('click', () => { clientReviewIndex = i; renderCurrentReview(); });
    dots.appendChild(dot);
  });
}

function toggleReviewsViewer() {
  const viewer = $('reviewsViewer');
  const button = $('reviewsToggleButton');
  if (!viewer || !button) return;
  const hidden = viewer.classList.toggle('hidden-review-viewer');
  button.setAttribute('aria-expanded', String(!hidden));
  if (!hidden) viewer.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function moveReview(direction) {
  if (!clientReviews.length) return;
  clientReviewIndex = (clientReviewIndex + direction + clientReviews.length) % clientReviews.length;
  renderCurrentReview();
}

function populateReviewableAppointments() {
  const select = $('reviewAppointmentSelect');
  if (!select) return;
  const now = Date.now();
  const reviewedAppointments = new Set(clientReviews.map(review => Number(review.appointment_id)).filter(Boolean));
  // The backend will enforce the final eligibility check; this merely keeps the UI helpful.
  const eligible = (window.__sulderyAppointments || []).filter(appt => {
    if (appt.status !== 'accepted') return false;
    if (reviewedAppointments.has(Number(appt.id))) return false;
    const date = String(appt.appointment_date || '').slice(0,10);
    const time = String(appt.appointment_time || '').slice(0,5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
    return new Date(`${date}T${time}:00-05:00`).getTime() < now;
  });
  select.innerHTML = '<option value="">Selecciona una cita terminada</option>';
  eligible.forEach(appt => {
    const option = document.createElement('option');
    option.value = appt.id;
    option.textContent = `${formatDate(appt.appointment_date)} · ${safeFormatTime12(appt.appointment_time)} · ${appt.service}`;
    select.appendChild(option);
  });
}

function chooseReviewStars(event) {
  const button = event.target.closest('[data-review-stars]');
  if (!button) return;
  selectedReviewStars = Number(button.dataset.reviewStars || 0);
  document.querySelectorAll('#reviewStarPicker button').forEach(item => item.classList.toggle('active', Number(item.dataset.reviewStars) <= selectedReviewStars));
}

async function submitClientReview() {
  const appointmentId = Number($('reviewAppointmentSelect')?.value || 0);
  const comment = String($('reviewComment')?.value || '').trim();
  const message = $('reviewSubmitMessage');
  const button = $('submitReviewButton');
  if (!appointmentId) return setMessage(message, 'Selecciona primero una cita terminada.');
  if (!selectedReviewStars) return setMessage(message, 'Elige de 1 a 5 estrellas.');
  if (comment.length < 3) return setMessage(message, 'Escribe un comentario para compartir tu experiencia.');
  button.disabled = true;
  setMessage(message, 'Guardando tu reseña…');
  try {
    const data = await apiFetch('/reviews', {method:'POST', body:JSON.stringify({appointment_id:appointmentId,stars:selectedReviewStars,comment})});
    setMessage(message, data.message, true);
    $('reviewComment').value = '';
    $('reviewAppointmentSelect').value = '';
    selectedReviewStars = 0;
    document.querySelectorAll('#reviewStarPicker button').forEach(item => item.classList.remove('active'));
    await loadReviews();
  } catch (error) { setMessage(message, error.message); }
  finally { button.disabled = false; }
}

async function buildCarousel(gallery, photos, large = false) {
  if (!gallery) return;
  if (gallery._carouselCleanup) gallery._carouselCleanup();
  gallery.innerHTML = '';
  if (!photos.length) {
    gallery.innerHTML = '<div class="empty-state">Pronto verás aquí los diseños de Suldery.</div>';
    return;
  }

  const state = { index: 0, timer: null, touchStartX: null };
  const stage = document.createElement('div');
  stage.className = large ? 'carousel-stage login-carousel-stage' : 'carousel-stage';
  const image = document.createElement('img');
  image.className = 'carousel-image';
  image.alt = 'Diseño de Suldery Nails';
  image.decoding = 'async';
  image.loading = 'eager';
  const loading = document.createElement('span');
  loading.className = 'carousel-loading';
  loading.textContent = 'Cargando diseño…';
  stage.append(image, loading);

  const previous = document.createElement('button');
  previous.className = 'carousel-arrow left';
  previous.type = 'button';
  previous.textContent = '‹';
  previous.setAttribute('aria-label', 'Foto anterior');
  const next = document.createElement('button');
  next.className = 'carousel-arrow right';
  next.type = 'button';
  next.textContent = '›';
  next.setAttribute('aria-label', 'Foto siguiente');

  const dots = document.createElement('div');
  dots.className = 'carousel-dots';
  const counter = document.createElement('span');
  counter.className = 'carousel-counter';

  function preload(index) {
    const url = photos[index]?.image_url;
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  function draw() {
    const photo = photos[state.index];
    if (!photo) return;
    loading.textContent = 'Cargando diseño…';
    loading.classList.remove('hidden');
    image.classList.add('is-loading');
    image.onload = () => { image.classList.remove('is-loading'); loading.classList.add('hidden'); };
    image.onerror = () => { image.classList.remove('is-loading'); loading.textContent = 'No se pudo cargar esta foto.'; loading.classList.remove('hidden'); };
    image.src = photo.image_url;
    image.alt = photo.title || 'Diseño de Suldery Nails';
    dots.querySelectorAll('.carousel-dot').forEach((dot, i) => dot.classList.toggle('active', i === state.index));
    counter.textContent = `${state.index + 1} / ${photos.length}`;
    preload((state.index + 1) % photos.length);
    preload((state.index - 1 + photos.length) % photos.length);
  }

  function go(delta) {
    state.index = (state.index + delta + photos.length) % photos.length;
    draw();
  }

  previous.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  stage.addEventListener('touchstart', e => { state.touchStartX = e.changedTouches[0]?.clientX ?? null; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (state.touchStartX == null) return;
    const endX = e.changedTouches[0]?.clientX ?? state.touchStartX;
    const dx = endX - state.touchStartX;
    state.touchStartX = null;
    if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  photos.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Ver foto ${i + 1}`);
    dot.addEventListener('click', () => { state.index = i; draw(); });
    dots.appendChild(dot);
  });

  stage.append(previous, next);
  gallery.append(stage, dots, counter);
  draw();

  if (photos.length > 1) state.timer = window.setInterval(() => go(1), 5000);
  gallery._carouselCleanup = () => { if (state.timer) clearInterval(state.timer); gallery._carouselCleanup = null; };
}

async function loadGallery() {
  const data = await apiFetch('/portfolio?visibility=client');
  const photos = Array.isArray(data.photos) ? data.photos : [];
  await buildCarousel($('clientGallery'), photos);
  if ($('clientHeroGallery')) await buildCarousel($('clientHeroGallery'), photos, true);
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

document.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('reviewStarPicker');
  if (picker && !picker.children.length) {
    picker.innerHTML = [1,2,3,4,5].map(n => `<button type="button" data-review-stars="${n}" aria-label="${n} estrellas">★</button>`).join('');
  }
  initCliente();
});
