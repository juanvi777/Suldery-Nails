let currentUser = null;
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = '';
let selectedTime = '';
let selectedService = '';
let calendarData = new Map();
let clientReviews = [];
let clientReviewIndex = 0;
let selectedReviewStars = 0;
let reviewPhotoFile = null;
let clientMessagePhotoFile = null;
let bookingStep = 1;
let myClientReview = null;
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

function initClientMenu(){
  const button=$('clientMenuButton'),drawer=$('clientMenuDrawer'),close=$('clientMenuClose');
  if(!button||!drawer)return;
  const closeMenu=()=>{drawer.hidden=true;button.setAttribute('aria-expanded','false');};
  const openMenu=()=>{drawer.hidden=false;button.setAttribute('aria-expanded','true');};
  button.addEventListener('click',()=>drawer.hidden?openMenu():closeMenu());
  close?.addEventListener('click',closeMenu);
  drawer.addEventListener('click',async event=>{
    const item=event.target.closest('[data-client-tool]'); if(!item)return;
    const tool=item.dataset.clientTool;
    closeMenu();
    if(tool==='booking'){openBooking();return;}
    if(tool==='catalog'){location.href=pageUrl('catalogo.html');return;}
    if(tool==='tutorial'){$('openInstallTutorialButton')?.click();return;}
    if(tool==='photo'){$('openClientPhotoButton')?.click();return;}
    if(tool==='exclusive'){$('exclusivePhotosSection')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(tool==='reviews'){$('reviewsSection')?.scrollIntoView({behavior:'smooth',block:'start'});$('reviewsViewer')?.classList.remove('hidden-review-viewer');$('reviewsToggleButton')?.setAttribute('aria-expanded','true');return;}
    if(tool==='notifications'){
      try{await enableSulderyPush();alert('Listo 💕. Este dispositivo quedó registrado para recibir tus avisos importantes.');}
      catch(error){alert(error.message);}
    }
  });
}

async function initCliente(){
  currentUser=await requireRole('client'); if(!currentUser)return;
  void syncExistingSulderyPushSubscription();
  $('welcomeName').textContent=`Hola, ${currentUser.name}`;
  initClientMenu();
  $('openBookingButton').addEventListener('click',openBooking);
  $('closeBookingButton').addEventListener('click',closeBooking);
  $('previousMonth').addEventListener('click',previousMonth); $('nextMonth').addEventListener('click',nextMonth);
  $('bookingButton').addEventListener('click',crearCita);
  $('service').addEventListener('change',onServiceChange);
  $('reviewsToggleButton')?.addEventListener('click', toggleReviewsViewer);
  $('reviewPreviousButton')?.addEventListener('click', () => moveReview(-1));
  $('reviewNextButton')?.addEventListener('click', () => moveReview(1));
  $('reviewStarPicker')?.addEventListener('click', chooseReviewStars);
  $('submitReviewButton')?.addEventListener('click', submitClientReview);
  initBookingStepFlow();
  renderClientDailyWelcome();
  initInstallTutorial();
  initClientPhotoMessaging();
  $('reviewCameraPicker')?.addEventListener('change', e => handleReviewPhoto(e));
  $('reviewGalleryPicker')?.addEventListener('change', e => handleReviewPhoto(e));
  $('removeReviewPhotoButton')?.addEventListener('click', removeReviewPhoto);

  updateServiceDurationHint();
  renderCalendar();
  await refreshCalendar();
  await Promise.all([loadAppointments(),loadGallery(),loadReviews()]);
  updateOwnReviewAvailability();
  populateReviewableAppointments();
  try {
    const push = await getSulderyPushStatus();
    if ($('enableNotificationsButton')) {
      if (push.needsAttention) $('enableNotificationsButton').textContent='🔔 Revisar avisos';
      else if (push.subscribed) $('enableNotificationsButton').textContent='🔔 Avisos activos';
    }
  } catch {}
}

function initBookingStepFlow(){
  const card=document.querySelector('.booking-card');
  if(!card || $('bookingStepBack')) return;
  const progress=document.createElement('div');
  progress.id='bookingProgress'; progress.className='booking-progress';
  progress.innerHTML='<span id="bookingProgressLabel">Paso 1 de 4</span><div class="booking-progress-track"><i id="bookingProgressFill"></i></div>';
  card.querySelector('.card-heading')?.after(progress);
  const back=document.createElement('button');
  back.type='button'; back.id='bookingStepBack'; back.className='small-button ghost booking-back-button'; back.textContent='← Paso anterior'; back.hidden=true;
  card.querySelector('.card-heading')?.appendChild(back);
  back.addEventListener('click',()=>{ if(bookingStep>1){bookingStep-=1;showBookingStep(bookingStep);} });
  showBookingStep(1);
}
function showBookingStep(step){
  bookingStep=Math.max(1,Math.min(4,step));
  const map={1:document.querySelector('.calendar-card'),2:$('timeStep'),3:$('serviceStep'),4:$('bookingSummary')};
  Object.entries(map).forEach(([n,el])=>{ if(el) el.classList.toggle('hidden-step',Number(n)!==bookingStep); });
  setStepVisibility($('bookingButton'), bookingStep===4);
  const progress=$('bookingProgressLabel'), fill=$('bookingProgressFill'), back=$('bookingStepBack');
  if(progress) progress.textContent=`Paso ${bookingStep} de 4`;
  if(fill) fill.style.width=`${bookingStep*25}%`;
  if(back) back.hidden=bookingStep<=1;
  const card=document.querySelector('.booking-card');
  if(card && bookingStep>1) card.scrollIntoView({behavior:'smooth',block:'start'});
}
function openBooking(){
  $('agenda').classList.remove('hidden-booking');
  bookingStep=1;
  selectedDate=''; selectedTime=''; selectedService='';
  $('service').value=''; updateServiceDurationHint();
  showBookingStep(1);
  setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false);
  setTimeout(()=>{$('agenda').scrollIntoView({behavior:'smooth',block:'start'});},20);
  $('calendarFeedback').textContent='Selecciona un día disponible.';
  void refreshCalendar();
}
function closeBooking(){ $('agenda').classList.add('hidden-booking'); resetBooking(); window.scrollTo({top:0,behavior:'smooth'}); }
function resetBooking(){
  selectedDate=''; selectedTime=''; selectedService=''; $('service').value=''; updateServiceDurationHint();
  bookingStep=1; showBookingStep(1); setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false);
  $('calendarFeedback').textContent='Selecciona un día disponible para continuar.'; $('timeSlots').innerHTML='<span class="time-help">Primero selecciona un día.</span>'; $('timeHint').textContent='Selecciona primero un día'; setMessage($('bookingMessage'),''); renderCalendar();
}
async function onServiceChange(){
  selectedService = $('service').value;
  updateServiceDurationHint();
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  if (!selectedService) return;
  if (!selectedDate || !selectedTime) return setMessage($('bookingMessage'),'Vuelve al paso anterior y elige primero el día y la hora.');
  try {
    const data = await apiFetch(`/appointments/slots?date=${encodeURIComponent(selectedDate)}&service=${encodeURIComponent(selectedService)}`);
    const slots=Array.isArray(data.slots)?data.slots:[];
    if (!slots.includes(selectedTime)) {
      setMessage($('bookingMessage'),`La hora ${safeFormatTime12(selectedTime)} ya no sirve para ${selectedService}. Elige otra hora.`);
      $('calendarFeedback').textContent='La duración de este servicio no cabe en la hora seleccionada.';
      selectedTime='';
      showBookingStep(2);
      return;
    }
    setMessage($('bookingMessage'),'');
    updateSummary();
  } catch(error){ setMessage($('bookingMessage'),error.message); showBookingStep(2); }
}
async function previousMonth(){
  const now=new Date(); const minMonth=new Date(now.getFullYear(),now.getMonth(),1); const target=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1); if(target<minMonth)return;
  currentMonth=target; selectedDate=''; selectedTime=''; setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false); clearTimeSelection(); await refreshCalendar(); showBookingStep(1);
}
async function nextMonth(){
  currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1); selectedDate=''; selectedTime=''; setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false); clearTimeSelection(); await refreshCalendar(); showBookingStep(1);
}
async function refreshCalendar(){
  const key = monthKey(currentMonth);
  $('calendarMonthLabel').textContent = new Date(currentMonth).toLocaleDateString('es-CO', { month:'long', year:'numeric' });
  try {
    // Antes de elegir servicio usamos el de menor duración para detectar días con al menos un inicio posible.
    const previewService = selectedService || 'Pedicure semipermanente';
    const data = await apiFetch(`/calendar?month=${encodeURIComponent(key)}&service=${encodeURIComponent(previewService)}`);
    calendarData = new Map(data.days.map(day => [day.date, day]));
    renderCalendar();
  } catch (error) {
    $('calendarFeedback').textContent = error.message;
    shake(document.querySelector('.booking-card'));
  }
}
function renderCalendar(){
  const year=currentMonth.getFullYear(), month=currentMonth.getMonth(); const first=(new Date(year,month,1).getDay()+6)%7; const days=new Date(year,month+1,0).getDate(); const grid=$('calendarDays'); grid.innerHTML='';
  for(let i=0;i<first;i++){const empty=document.createElement('span');empty.className='calendar-empty';grid.appendChild(empty);}
  const today=new Date();today.setHours(0,0,0,0);
  for(let day=1;day<=days;day++){
    const date=isoDate(year,month,day); const meta=calendarData.get(date)||{status:'closed',slots:0,message:'Fecha no disponible.'}; const localDate=new Date(year,month,day); const button=document.createElement('button');button.type='button';button.className=`calendar-day ${meta.status}`;if(date===selectedDate)button.classList.add('selected');if(localDate.getTime()===today.getTime())button.classList.add('today');
    const weekday=localDate.toLocaleDateString('es-CO',{weekday:'short'}).replace('.',''); const statusLabel=meta.status==='available'?'Disponible':meta.status==='blocked'?'Bloqueado':meta.status==='rest'?'Descanso':meta.status==='full'?'Agotado':meta.status==='past'?'Pasado':'No disponible';
    button.innerHTML=`<strong>${day}</strong><span class="calendar-weekday">${weekday}</span><small>${statusLabel}</small>`;
    if(meta.status==='past'){button.disabled=true;button.title='Esta fecha ya pasó.';} else if(meta.status==='available'){button.addEventListener('click',()=>selectDate(date));button.title=`${meta.slots} inicio${meta.slots===1?'':'s'} disponible${meta.slots===1?'':'s'}.`;} else {button.addEventListener('click',()=>showDayMessage(meta));button.title=meta.message||'Fecha no disponible.';}
    grid.appendChild(button);
  }
  $('previousMonth').disabled = currentMonth <= new Date(today.getFullYear(),today.getMonth(),1);
  $('nextMonth').disabled = false;
}
function showDayMessage(meta){selectedDate='';selectedTime='';setStepVisibility($('bookingSummary'),false);setStepVisibility($('bookingButton'),false);renderCalendar();clearTimeSelection();$('calendarFeedback').textContent=meta.message;shake($('calendarFeedback'));}
async function selectDate(date){
  selectedDate = date;
  selectedTime = '';
  setStepVisibility($('bookingSummary'), false); setStepVisibility($('bookingButton'), false);
  renderCalendar();
  $('calendarFeedback').textContent = `Elegiste ${formatDate(date)}. Ahora elige una hora de inicio.`;
  $('timeHint').textContent = 'Horarios de inicio posibles para el día elegido';
  $('timeSlots').innerHTML = '<span class="time-help">Cargando horarios…</span>';
  $('dayTimeline').innerHTML = '<p class="time-help">Cargando el estado de todo el día…</p>';
  try {
    const previewService='Pedicure semipermanente';
    const data = await apiFetch(`/appointments/slots?date=${encodeURIComponent(date)}&service=${encodeURIComponent(previewService)}`);
    renderSlots(data.slots || []);
    renderDayTimeline(data.timeline || [], data.slots || []);
    if (!data.slots?.length) { $('calendarFeedback').textContent = data.message || 'Ese día no tiene inicios disponibles.'; return; }
    bookingStep=2; showBookingStep(2);
  } catch (error) {
    $('timeSlots').innerHTML = `<span class="time-help">${escapeHtml(error.message)}</span>`;
    $('dayTimeline').innerHTML = `<p class="time-help">${escapeHtml(error.message)}</p>`;
    shake(document.querySelector('.booking-card'));
  }
}
function renderSlots(slots){
  const wrap=$('timeSlots'); wrap.innerHTML='';
  if(!slots.length){wrap.innerHTML='<span class="time-help">No quedan inicios disponibles para ese día.</span>';return;}
  slots.forEach(time=>{const button=document.createElement('button');button.type='button';button.className='time-slot';button.dataset.time=time;button.textContent=safeFormatTime12(time);button.title=`Comienza a las ${safeFormatTime12(time)}. La hora se comprobará de nuevo al elegir el servicio.`;if(time===selectedTime)button.classList.add('selected');button.addEventListener('click',()=>selectTime(time));wrap.appendChild(button);});
}
function timelineStatusLabel(status, reason){if(status==='available')return'Disponible';if(status==='occupied')return'Ocupado';if(status==='lunch')return'Almuerzo';if(status==='blocked')return'Bloqueado';if(status==='past')return'Hora pasada';return reason||'No disponible';}
function renderDayTimeline(timeline, availableSlots){const box=$('dayTimeline');box.innerHTML='';if(!timeline.length){box.innerHTML='<p class="time-help">No hay jornada configurada para este día.</p>';return;}const available=new Set(availableSlots);timeline.forEach(item=>{const row=document.createElement('div');row.className=`day-timeline-row ${item.status}`;if(available.has(item.time))row.classList.add('is-selectable');row.innerHTML=`<strong>${safeFormatTime12(item.time)}</strong><span>${escapeHtml(timelineStatusLabel(item.status,item.reason))}</span>`;if(item.reason)row.title=item.reason;if(available.has(item.time))row.addEventListener('click',()=>selectTime(item.time));box.appendChild(row);});}
function selectTime(time){selectedTime=time;document.querySelectorAll('.time-slot').forEach(button=>button.classList.toggle('selected',button.dataset.time===selectedTime));$('calendarFeedback').textContent=`${formatDate(selectedDate)} a las ${safeFormatTime12(time)}. Ahora elige el servicio.`;setMessage($('bookingMessage'),'');showBookingStep(3);}
function updateSummary(){bookingStep=4;showBookingStep(4);$('summaryDate').textContent=formatDate(selectedDate);$('summaryTime').textContent=safeFormatTime12(selectedTime);$('summaryService').textContent=selectedService;$('summaryDuration').textContent=durationLabel(serviceDuration(selectedService));setStepVisibility($('bookingSummary'),true);setStepVisibility($('bookingButton'),true);$('bookingSummary').scrollIntoView({behavior:'smooth',block:'nearest'});}
function clearTimeSelection(){$('timeSlots').innerHTML='<span class="time-help">Primero selecciona un día.</span>';$('dayTimeline').innerHTML='<p class="time-help">Aquí aparecerá el estado del horario cuando elijas un día.</p>';$('timeHint').textContent='Selecciona primero un día';setMessage($('bookingMessage'),'');}

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
    const [data, mine] = await Promise.all([apiFetch('/reviews'), apiFetch('/reviews/mine')]);
    clientReviews = Array.isArray(data.reviews) ? data.reviews : [];
    myClientReview = mine?.review || null;
    clientReviewIndex = 0;
    const average = Number(data.average || 0);
    $('reviewScore').textContent = clientReviews.length ? average.toFixed(1) : '—';
    $('reviewStarsSummary').textContent = reviewStars(average);
    $('reviewTotal').textContent = Number(data.count || clientReviews.length || 0);
    renderCurrentReview();
    populateReviewableAppointments();
    updateOwnReviewAvailability();
  } catch (error) {
    // A public review feed should still work even if the private /mine check fails.
    try {
      const data = await apiFetch('/reviews');
      clientReviews = Array.isArray(data.reviews) ? data.reviews : [];
      myClientReview = clientReviews.find(review => Number(review.user_id) === Number(currentUser?.id)) || null;
    } catch {}
    $('reviewScore').textContent = '—';
    $('reviewStarsSummary').textContent = '☆☆☆☆☆';
    $('reviewTotal').textContent = '0';
    const card = $('currentReviewCard');
    if (card) card.innerHTML = `<p class="empty-state">No pudimos cargar las reseñas ahora. ${escapeHtml(error.message)}</p>`;
    updateOwnReviewAvailability();
  }
}


function updateOwnReviewAvailability(){
  const submit=$('submitReviewButton'), select=$('reviewAppointmentSelect'), stars=$('reviewStarPicker'), comment=$('reviewComment');
  const box=document.querySelector('.client-review-submit');
  if(!box)return;
  let notice=box.querySelector('.review-one-time-notice');
  if(myClientReview){
    if(!notice){notice=document.createElement('div');notice.className='review-one-time-notice';box.insertBefore(notice,box.querySelector('.review-submit-grid')||submit);}
    notice.innerHTML='<strong>✓ Ya publicaste tu reseña.</strong><p>Tu cuenta puede publicar una sola reseña. Gracias por compartir tu experiencia con Suldery. 💕</p>';
    const submitGrid=box.querySelector('.review-submit-grid'); const photoField=box.querySelector('.review-photo-field');
    if(submitGrid)submitGrid.classList.add('hidden-step'); if(photoField)photoField.classList.add('hidden-step');
    if(select)select.disabled=true;if(stars)stars.classList.add('disabled');if(comment)comment.disabled=true;if(submit){submit.disabled=true;submit.textContent='Reseña ya publicada ✓';}
  }else{
    notice?.remove(); const submitGrid=box.querySelector('.review-submit-grid'); const photoField=box.querySelector('.review-photo-field');
    if(submitGrid)submitGrid.classList.remove('hidden-step'); if(photoField)photoField.classList.remove('hidden-step');
    if(select)select.disabled=false;if(stars)stars.classList.remove('disabled');if(comment)comment.disabled=false;if(submit){submit.disabled=false;submit.textContent='Publicar reseña ✦';}
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
  card.innerHTML = `<div class="review-card-stars">${reviewStars(review.stars)}</div><blockquote>“${escapeHtml(review.comment || '')}”</blockquote>${review.image_url ? `<img class="review-card-photo" src="${escapeAttribute(apiAssetUrl(review.image_url))}" loading="lazy" alt="Uñas de ${escapeAttribute(review.client_name || 'clienta')}">` : ''}<strong>${escapeHtml(review.client_name || 'Clienta')}</strong><small>${review.created_at ? escapeHtml(formatDate(String(review.created_at).slice(0,10))) : ''}</small>`;
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
  select.innerHTML = '<option value="">Reseña general (sin cita)</option>';
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
  const appointmentId=String($('reviewAppointmentSelect')?.value||'').trim();
  const comment=String($('reviewComment')?.value||'').trim();
  const message=$('reviewSubmitMessage');
  const button=$('submitReviewButton');
  if(myClientReview)return setMessage(message,'Tu cuenta ya publicó una reseña. Solo se permite una reseña por cuenta. 💕');
  if(!selectedReviewStars)return setMessage(message,'Elige de 1 a 5 estrellas.');
  if(comment.length<3)return setMessage(message,'Escribe un comentario para compartir tu experiencia.');
  button.disabled=true; setMessage(message,'Guardando tu reseña…');
  try{
    const form=new FormData();
    if(appointmentId)form.append('appointment_id',appointmentId);
    form.append('stars',String(selectedReviewStars));
    form.append('comment',comment);
    if(reviewPhotoFile){const optimized=await optimizeClientImage(reviewPhotoFile);form.append('photo',optimized,optimized.name);}
    const data=await apiFetch('/reviews',{method:'POST',body:form});
    setMessage(message,data.message,true);
    $('reviewComment').value='';$('reviewAppointmentSelect').value='';selectedReviewStars=0;reviewPhotoFile=null;
    document.querySelectorAll('#reviewStarPicker button').forEach(item=>item.classList.remove('active'));
    removeReviewPhoto();
    await loadReviews();
  }catch(error){setMessage(message,error.message);}
  finally{button.disabled=false;updateOwnReviewAvailability();}
}

function handleReviewPhoto(event){
  const file=event.target.files?.[0]||null;if(!file)return;
  reviewPhotoFile=file;
  const preview=$('reviewPhotoPreview'), remove=$('removeReviewPhotoButton');
  if(preview){preview.hidden=false;preview.innerHTML='';const img=document.createElement('img');img.src=URL.createObjectURL(file);img.alt='Vista previa de la foto de tus uñas';img.onload=()=>URL.revokeObjectURL(img.src);preview.appendChild(img);}
  if(remove)remove.hidden=false;
}
function removeReviewPhoto(){reviewPhotoFile=null;['reviewCameraPicker','reviewGalleryPicker'].forEach(id=>{if($(id))$(id).value='';});const preview=$('reviewPhotoPreview');if(preview){preview.hidden=true;preview.innerHTML='';}const remove=$('removeReviewPhotoButton');if(remove)remove.hidden=true;}

function renderClientDailyWelcome(){
  const dateEl=$('clientTodayLabel'),motivationEl=$('clientMotivation');if(!dateEl||!motivationEl)return;
  const now=new Date();dateEl.textContent=new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now);
  const messages=['Hoy también es un buen día para regalarte un momento para ti. ✨','Tus manos cuentan tu estilo. Déjalas brillar hoy. 💕','Un pequeño detalle puede cambiar todo tu día. 🌸','Date permiso de consentirte: te lo mereces. ✨','Hoy puede ser el día de tu próximo diseño favorito. 💅','La belleza también está en hacer una pausa para ti. ♡'];
  let index=0;try{const arr=new Uint32Array(1);crypto.getRandomValues(arr);index=arr[0]%messages.length;}catch{index=Math.floor(Math.random()*messages.length);}motivationEl.textContent=messages[index];
}

function initInstallTutorial(){
  const modal=$('installTutorialModal');
  let open=$('openInstallTutorialButton');
  const close=$('closeInstallTutorialButton'),choice=$('installDeviceChoice'),steps=$('installTutorialSteps'),back=$('installTutorialBack'),install=$('tutorialInstallNowButton');
  if(!open&&modal){open=document.createElement('button');open.id='openInstallTutorialButton';open.hidden=true;document.body.appendChild(open);}
  if(!modal||!open||!choice||!steps)return;
  const visualStep=(n,icon,title,text,highlight='')=>`<article class="tutorial-step-visual"><div class="tutorial-phone"><div class="tutorial-phone-top"><span></span><span></span><span></span></div><div class="tutorial-screen"><div class="tutorial-ui-bar"><strong>Suldery Nails</strong><span>${icon}</span></div><div class="tutorial-ui-body"><div class="tutorial-ui-title">${highlight||title}</div><div class="tutorial-ui-chip">${icon}</div><div class="tutorial-ui-lines"><i></i><i></i><i></i></div></div></div></div><div class="tutorial-copy"><span>PASO ${n}</span><h3>${title}</h3><p>${text}</p></div></article>`;
  const render=(device)=>{
    const ios=device==='ios';
    const data=ios?[
      ['1','🌐','Abre Safari','Abre Suldery Nails directamente en Safari.','Safari'],
      ['2','↗','Pulsa Compartir','En la barra de Safari toca el botón Compartir para abrir las opciones.','Compartir'],
      ['3','＋','Añadir a pantalla de inicio','Busca “Añadir a pantalla de inicio”. Si no aparece, desplázate hacia abajo en el menú.','Añadir a pantalla de inicio'],
      ['4','✓','Confirma Añadir','Confirma la instalación. Luego busca el icono de Suldery Nails en tu pantalla de inicio.','Suldery Nails'],
      ['5','💕','Abre la app instalada','Entra desde el icono nuevo. Así Safari la abrirá en modo aplicación.','Suldery Nails']
    ]:[
      ['1','🌐','Abre Chrome','Entra a Suldery Nails desde Google Chrome.','Chrome'],
      ['2','⋮','Abre el menú de Chrome','Toca los tres puntos para ver las acciones del navegador.','⋮'],
      ['3','＋','Instalar aplicación','Elige “Instalar aplicación” o “Añadir a pantalla principal”, según tu teléfono.','Instalar aplicación'],
      ['4','✓','Confirma la instalación','Acepta la instalación y espera a que aparezca el icono.','Instalar'],
      ['5','💕','Abre Suldery Nails','Usa el nuevo icono para entrar como si fuera una app.','Suldery Nails']
    ];
    steps.innerHTML=`<div class="tutorial-device-title"><div><span class="tutorial-badge">${ios?'🍎':'🤖'}</span><strong>${ios?'iPhone / iOS':'Android'}</strong></div><small>Guía visual · 5 pasos</small></div><div class="tutorial-steps-visual">${data.map(d=>visualStep(...d)).join('')}</div><div class="tutorial-powerpoint-link"><span>📊</span><div><strong>Guía visual en PowerPoint</strong><small>Abre el material con las imágenes paso a paso.</small></div><a class="small-button ghost" href="assets/Suldery-Nails-Tutorial-Instalacion-v5.3.pptx" target="_blank" rel="noopener">Abrir PPTX</a></div>`;
    choice.classList.add('hidden-step');steps.classList.remove('hidden-step');back.hidden=false;if(install)install.hidden=ios;
  };
  open.addEventListener('click',()=>modal.classList.remove('hidden-modal'));
  close?.addEventListener('click',()=>modal.classList.add('hidden-modal'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden-modal');});
  choice.querySelectorAll('[data-install-device]').forEach(btn=>btn.addEventListener('click',()=>render(btn.dataset.installDevice)));
  back?.addEventListener('click',()=>{choice.classList.remove('hidden-step');steps.classList.add('hidden-step');back.hidden=true;if(install)install.hidden=true;});
  install?.addEventListener('click',async()=>{if(window.isIOSDevice&&window.isIOSDevice()){alert('En iPhone sigue la guía de Safari mostrada arriba.');return;}if(window.installSulderyApp){const installed=await window.installSulderyApp();if(!installed)alert('Tu navegador no ofrece la instalación automática en este momento. Sigue la guía visual.');}else{alert('Sigue la guía visual para instalar Suldery Nails.');}});
}

function initClientPhotoMessaging(){
  const modal=$('clientPhotoModal');
  let open=$('openClientPhotoButton');
  const close=$('closeClientPhotoButton'),send=$('sendClientPhotoButton');
  if(!open&&modal){open=document.createElement('button');open.id='openClientPhotoButton';open.hidden=true;document.body.appendChild(open);}
  if(!modal||!open||!send)return;
  open.addEventListener('click',()=>modal.classList.remove('hidden-modal'));close?.addEventListener('click',()=>modal.classList.add('hidden-modal'));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden-modal');});
  ['clientPhotoCameraPicker','clientPhotoGalleryPicker'].forEach(id=>$(id)?.addEventListener('change',handleClientMessagePhoto));
  send.addEventListener('click',sendClientPhotoToSuldery);
}

function handleClientMessagePhoto(event){
  const file=event.target.files?.[0]||null;if(!file)return;clientMessagePhotoFile=file;const preview=$('clientPhotoPreview');if(preview){preview.hidden=false;preview.innerHTML='';const img=document.createElement('img');img.src=URL.createObjectURL(file);img.onload=()=>URL.revokeObjectURL(img.src);img.alt='Vista previa';preview.appendChild(img);}}
async function sendClientPhotoToSuldery(){
  const send=$('sendClientPhotoButton'),status=$('clientPhotoMessageStatus');
  if(!clientMessagePhotoFile)return setMessage(status,'Selecciona o toma una foto primero.');
  try{send.disabled=true;setMessage(status,'Enviando foto…');const form=new FormData();const optimized=await optimizeClientImage(clientMessagePhotoFile);form.append('photo',optimized,optimized.name);form.append('message',String($('clientPhotoMessage')?.value||''));const data=await apiFetch('/client/photo-messages',{method:'POST',body:form});setMessage(status,data.message,true);$('clientPhotoMessage').value='';clientMessagePhotoFile=null;['clientPhotoCameraPicker','clientPhotoGalleryPicker'].forEach(id=>{if($(id))$(id).value='';});const preview=$('clientPhotoPreview');if(preview){preview.hidden=true;preview.innerHTML='';}setTimeout(()=>{ $('clientPhotoModal')?.classList.add('hidden-modal');setMessage(status,'');},900);}catch(error){setMessage(status,error.message);}finally{send.disabled=false;}
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
    const url = apiAssetUrl(photos[index]?.image_url);
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
    image.src = apiAssetUrl(photo.image_url);
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

function renderClientPhotoGrid(gallery, photos) {
  if (!gallery) return;
  gallery.innerHTML='';
  gallery.classList.add('photo-gallery-grid');
  if(!photos.length){gallery.innerHTML='<div class="empty-state">Pronto verás aquí los diseños de Suldery.</div>';return;}
  photos.forEach(photo=>{
    const card=document.createElement('figure');
    card.className='client-photo-tile';
    card.innerHTML=`<img src="${escapeAttribute(apiAssetUrl(photo.image_url))}" loading="lazy" decoding="async" alt="${escapeAttribute(photo.title || 'Diseño de Suldery Nails')}"><figcaption>${escapeHtml(photo.title || '')}</figcaption>`;
    gallery.appendChild(card);
  });
}

async function loadGallery() {
  const data = await apiFetch('/portfolio?visibility=client');
  const photos = Array.isArray(data.photos) ? data.photos : [];
  renderClientPhotoGrid($('clientGallery'), photos);
  if ($('clientHeroGallery')) await buildCarousel($('clientHeroGallery'), photos.slice(0, Math.min(6, photos.length)), true);
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
