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
    if(tool==='reviews'){$('reviewsSection')?.scrollIntoView({behavior:'smooth',block:'start'});$('reviewsViewer')?.classList.remove('hidden-review-viewer');$('reviewsToggleButton')?.setAttribute('aria-expanded','true');return;}
    if(tool==='notifications'){
      try{await enableSulderyPush();alert('Listo. Este dispositivo quedó registrado para recibir tus avisos importantes.');}
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
  $('serviceNextButton')?.addEventListener('click',nextFromService);
  $('dateNextButton')?.addEventListener('click',nextFromDate);
  $('timeNextButton')?.addEventListener('click',nextFromTime);
  $('reviewsToggleButton')?.addEventListener('click', toggleReviewsViewer);
  $('reviewPreviousButton')?.addEventListener('click', () => moveReview(-1));
  $('reviewNextButton')?.addEventListener('click', () => moveReview(1));
  $('reviewStarPicker')?.addEventListener('click', chooseReviewStars);
  $('submitReviewButton')?.addEventListener('click', submitClientReview);
  initBookingStepFlow();
  renderClientDailyWelcome();
  initInstallTutorial();
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
      if (push.needsAttention) $('enableNotificationsButton').textContent='Revisar avisos';
      else if (push.subscribed) $('enableNotificationsButton').textContent='Avisos activos';
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
  const map={1:$('serviceStep'),2:document.querySelector('.calendar-card'),3:$('timeStep'),4:$('bookingSummary')};
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
  selectedService=$('service').value; updateServiceDurationHint(); selectedDate=''; selectedTime='';
  setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false); setMessage($('bookingMessage'),'');
}
async function nextFromService(){
  if(!selectedService)return setMessage($('bookingMessage'),'Primero selecciona qué servicio deseas realizarte.');
  setMessage($('bookingMessage'),''); await refreshCalendar(); showBookingStep(2);
}
async function nextFromDate(){
  if(!selectedDate)return setMessage($('bookingMessage'),'Primero selecciona un día disponible.');
  $('timeSlots').innerHTML='<span class="time-help">Cargando horarios…</span>'; $('dayTimeline').innerHTML='<p class="time-help">Cargando el estado del día…</p>';
  try{
    const data=await apiFetch(`/appointments/slots?date=${encodeURIComponent(selectedDate)}&service=${encodeURIComponent(selectedService)}`);
    renderSlots(data.slots||[]); renderDayTimeline(data.timeline||[],data.slots||[]);
    if(!data.slots?.length)return setMessage($('bookingMessage'),data.message||'No hay inicios disponibles para ese día.');
    $('timeHint').textContent='Selecciona una hora de inicio'; setMessage($('bookingMessage'),''); showBookingStep(3);
  }catch(error){setMessage($('bookingMessage'),error.message);}
}
function nextFromTime(){if(!selectedTime)return setMessage($('bookingMessage'),'Selecciona una hora disponible.');setMessage($('bookingMessage'),'');updateSummary();}

async function previousMonth(){
  const now=new Date(); const minMonth=new Date(now.getFullYear(),now.getMonth(),1); const target=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1); if(target<minMonth)return;
  currentMonth=target; selectedDate=''; selectedTime=''; setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false); clearTimeSelection(); await refreshCalendar(); showBookingStep(2);
}
async function nextMonth(){
  currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1); selectedDate=''; selectedTime=''; setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false); clearTimeSelection(); await refreshCalendar(); showBookingStep(2);
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
    button.dataset.date=date;button.innerHTML=`<strong>${day}</strong><span class="calendar-weekday">${weekday}</span><small>${statusLabel}</small>`;
    if(meta.status==='past'){button.disabled=true;button.title='Esta fecha ya pasó.';} else if(meta.status==='available'){button.addEventListener('click',()=>selectDate(date));button.title=`${meta.slots} inicio${meta.slots===1?'':'s'} disponible${meta.slots===1?'':'s'}.`;} else {button.addEventListener('click',()=>showDayMessage(meta));button.title=meta.message||'Fecha no disponible.';}
    grid.appendChild(button);
  }
  $('previousMonth').disabled = currentMonth <= new Date(today.getFullYear(),today.getMonth(),1);
  $('nextMonth').disabled = false;
}
function showDayMessage(meta){selectedDate='';selectedTime='';setStepVisibility($('bookingSummary'),false);setStepVisibility($('bookingButton'),false);renderCalendar();clearTimeSelection();$('calendarFeedback').textContent=meta.message;shake($('calendarFeedback'));}
async function selectDate(date){
  selectedDate=date; selectedTime=''; setStepVisibility($('bookingSummary'),false); setStepVisibility($('bookingButton'),false); renderCalendar();
  $('calendarFeedback').textContent=`Elegiste ${formatDate(date)}. Pulsa Continuar para ver las horas disponibles.`; setMessage($('bookingMessage'),'');
}

function renderSlots(slots){
  const wrap=$('timeSlots'); wrap.innerHTML='';
  if(!slots.length){wrap.innerHTML='<span class="time-help">No quedan inicios disponibles para ese día.</span>';return;}
  slots.forEach(time=>{const button=document.createElement('button');button.type='button';button.className='time-slot';button.dataset.time=time;button.textContent=safeFormatTime12(time);button.title=`Comienza a las ${safeFormatTime12(time)}. El inicio está disponible; Suldery confirmará la cita según la duración.`;if(time===selectedTime)button.classList.add('selected');button.addEventListener('click',()=>selectTime(time));wrap.appendChild(button);});
}
function timelineStatusLabel(status, reason){if(status==='available')return'Disponible';if(status==='occupied')return'Ocupado';if(status==='lunch')return'Almuerzo';if(status==='blocked')return'Bloqueado';if(status==='past')return'Hora pasada';return reason||'No disponible';}
function renderDayTimeline(timeline, availableSlots){const box=$('dayTimeline');box.innerHTML='';if(!timeline.length){box.innerHTML='<p class="time-help">No hay jornada configurada para este día.</p>';return;}const available=new Set(availableSlots);timeline.forEach(item=>{const row=document.createElement('div');row.className=`day-timeline-row ${item.status}`;if(available.has(item.time))row.classList.add('is-selectable');row.innerHTML=`<strong>${safeFormatTime12(item.time)}</strong><span>${escapeHtml(timelineStatusLabel(item.status,item.reason))}</span>`;if(item.reason)row.title=item.reason;if(available.has(item.time))row.addEventListener('click',()=>selectTime(item.time));box.appendChild(row);});}
function selectTime(time){selectedTime=time;document.querySelectorAll('.time-slot').forEach(button=>button.classList.toggle('selected',button.dataset.time===selectedTime));$('timeHint').textContent=`${safeFormatTime12(time)} seleccionada. Pulsa Continuar para revisar.`;setMessage($('bookingMessage'),'');}
function updateSummary(){bookingStep=4;showBookingStep(4);$('summaryDate').textContent=formatDate(selectedDate);$('summaryTime').textContent=safeFormatTime12(selectedTime);$('summaryService').textContent=selectedService;$('summaryDuration').textContent=durationLabel(serviceDuration(selectedService));setStepVisibility($('bookingSummary'),true);setStepVisibility($('bookingButton'),true);$('bookingSummary').scrollIntoView({behavior:'smooth',block:'nearest'});}
function clearTimeSelection(){$('timeSlots').innerHTML='<span class="time-help">Primero selecciona un día.</span>';$('dayTimeline').innerHTML='<p class="time-help">Aquí aparecerá el estado del horario cuando elijas un día.</p>';$('timeHint').textContent='Selecciona primero un día';setMessage($('bookingMessage'),'');}

async function crearCita(){
  const message = $('bookingMessage');
  const button = $('bookingButton');
  if (!selectedService) { setMessage(message, 'Primero selecciona el servicio que deseas realizarte.'); return; }
  if (!selectedDate) { setMessage(message, 'Primero selecciona un día disponible.'); return; }
  if (!selectedTime) { setMessage(message, 'Ahora selecciona una hora disponible.'); return; }

  button.disabled = true;
  setMessage(message, 'Enviando tu solicitud a Suldery… ');

  try {
    const data = await apiFetch('/appointments', {
      method:'POST',
      body:JSON.stringify({ service:selectedService, date:selectedDate, time:selectedTime })
    });

    const bookedDate = selectedDate;
    const successMessage = data.message || ` Tu cita para ${formatDate(bookedDate)} a las ${safeFormatTime12(selectedTime)} quedó enviada y está pendiente de confirmación por parte de Suldery.`;

    // La creación de la cita ya fue confirmada por el servidor. Las actualizaciones
    // de la agenda se hacen aparte para que un fallo secundario de carga nunca
    // convierta una cita guardada en un falso mensaje de “espacio ocupado”.
    setMessage(message, successMessage, true);
    $('calendarFeedback').textContent = data.already_exists
      ? ' Esta solicitud ya estaba registrada. Suldery la está revisando.'
      : ' Tu solicitud quedó enviada y está pendiente de confirmación. Te avisaremos cuando haya una respuesta.';
    $('calendarFeedback').classList.add('success');
    selectedTime = '';
    setStepVisibility($('bookingSummary'), false);
    setStepVisibility($('bookingButton'), false);
    $('timeSlots').innerHTML = '<span class="time-help success-help"> Solicitud enviada. Esta cita queda pendiente de confirmación de Suldery.</span>';

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
    window.myClientReviews = Array.isArray(mine?.reviews) ? mine.reviews : (mine?.review ? [mine.review] : []);
    window.reviewEligibleAppointments = Array.isArray(mine?.eligible_appointments) ? mine.eligible_appointments : [];
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
      myClientReview = clientReviews.find(review => Number(review.user_id) === Number(currentUser?.id)) || null; window.myClientReviews=myClientReview?[myClientReview]:[]; window.reviewEligibleAppointments=[];
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
  const submit=$('submitReviewButton'),select=$('reviewAppointmentSelect'),stars=$('reviewStarPicker'),comment=$('reviewComment'); const box=document.querySelector('.client-review-submit'); if(!box)return;
  const reviews=Array.isArray(window.myClientReviews)?window.myClientReviews:[]; const eligible=Array.isArray(window.reviewEligibleAppointments)?window.reviewEligibleAppointments:[];
  const copy=box.querySelector('.client-review-copy p:last-child'); if(copy)copy.textContent=reviews.length?'Ya publicaste una primera reseña. Para publicar otra, selecciona una cita confirmada que ya hayas realizado.':'Tu primera reseña puede ser general, sin cita. Después, cada nueva reseña deberá estar vinculada a una cita confirmada y ya realizada.';
  if(select){select.disabled=false;select.innerHTML=`<option value="">${reviews.length?'Selecciona una cita realizada…':'Reseña general (sin cita)'}</option>`;eligible.forEach(appt=>{const o=document.createElement('option');o.value=appt.id;o.textContent=`${formatDate(String(appt.appointment_date).slice(0,10))} · ${safeFormatTime12(String(appt.appointment_time).slice(0,5))} · ${appt.service}`;select.appendChild(o);});}
  if(stars)stars.classList.remove('disabled');if(comment)comment.disabled=false;if(submit){submit.disabled=false;submit.textContent=reviews.length?'Publicar nueva reseña':'Publicar reseña';}
}

function renderCurrentReview() {
  const card = $('currentReviewCard');
  const dots = $('reviewDots');
  if (!card || !dots) return;
  dots.innerHTML = '';
  if (!clientReviews.length) {
    card.innerHTML = '<p class="empty-state">Todavía no hay reseñas. Sé la primera en contar tu experiencia. </p>';
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

function populateReviewableAppointments() { updateOwnReviewAvailability(); }

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
  if((Array.isArray(window.myClientReviews)?window.myClientReviews:[]).length>0&&!appointmentId)return setMessage(message,'Para publicar otra reseña, selecciona una cita confirmada que ya hayas realizado.');
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

async function optimizeClientImage(file,maxDimension=1600,maxBytes=1.8*1024*1024){
  if(!file||!file.type.startsWith('image/'))return file;
  if(/image\/(heic|heif)/i.test(file.type))return file;
  if(file.size<=maxBytes)return file;
  const url=URL.createObjectURL(file);
  try{
    const image=new Image(); image.decoding='async'; image.src=url;
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
    const scale=Math.min(1,maxDimension/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));
    const width=Math.max(1,Math.round((image.naturalWidth||image.width)*scale)); const height=Math.max(1,Math.round((image.naturalHeight||image.height)*scale));
    const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height; const ctx=canvas.getContext('2d'); if(!ctx)return file; ctx.drawImage(image,0,0,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82)); if(!blob||blob.size>=file.size)return file;
    const base=file.name.replace(/\.[^.]+$/,'')||'suldery-foto'; return new File([blob],`${base}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  }finally{URL.revokeObjectURL(url);}
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
  const messages=['Hoy también es un buen día para regalarte un momento para ti. ','Tus manos cuentan tu estilo. Déjalas brillar hoy. ','Un pequeño detalle puede cambiar todo tu día. ','Date permiso de consentirte: te lo mereces. ','Hoy puede ser el día de tu próximo diseño favorito. ','La belleza también está en hacer una pausa para ti. '];
  let index=0;try{const arr=new Uint32Array(1);crypto.getRandomValues(arr);index=arr[0]%messages.length;}catch{index=Math.floor(Math.random()*messages.length);}motivationEl.textContent=messages[index];
}

function initInstallTutorial(){
  const modal=$('installTutorialModal'),open=$('openInstallTutorialButton')||(()=>{const b=document.createElement('button');b.id='openInstallTutorialButton';b.hidden=true;document.body.appendChild(b);return b;})(),close=$('closeInstallTutorialButton'),choice=$('installDeviceChoice'),steps=$('installTutorialSteps'),documentBox=$('installTutorialDocument'),back=$('installTutorialBack');
  if(!modal||!choice||!documentBox)return;
  const render=device=>{
    const ios=device==='ios';
    const pdf=ios?'Suldery-Nails-Tutorial-iPhone-iOS.pdf':'Suldery-Nails-Tutorial-Android.pdf';
    const label=ios?'iPhone / iOS':'Android';
    const src=`assets/${pdf}`;
    if(steps){steps.innerHTML='';steps.classList.add('hidden-step');steps.setAttribute('aria-hidden','true');}
    documentBox.innerHTML=`<div class="tutorial-pdf-head"><div><span class="tutorial-pdf-kicker">GUÍA DE INSTALACIÓN</span><h3>${label}</h3><p>La guía PDF se muestra directamente en este cuadro. Puedes leerla aquí sin salir de Suldery Nails.</p></div><a class="small-button ghost tutorial-pdf-open" href="${src}" target="_blank" rel="noopener">Abrir PDF completo</a></div><div class="tutorial-pdf-frame"><object data="${src}#toolbar=1&navpanes=0&view=FitH" type="application/pdf" aria-label="Guía de instalación ${label}"><iframe class="tutorial-pdf-embed-fallback" title="Guía de instalación ${label}" src="${src}#toolbar=1&navpanes=0&view=FitH"></iframe><div class="tutorial-pdf-fallback"><strong>El visor PDF de este navegador no está disponible.</strong><a href="${src}" target="_blank" rel="noopener">Abrir la guía PDF</a></div></object></div>`;
    documentBox.classList.remove('hidden-step');
    choice.classList.add('hidden-step');
    back.hidden=false;
  };
  open.addEventListener('click',()=>modal.classList.remove('hidden-modal'));
  close?.addEventListener('click',()=>modal.classList.add('hidden-modal'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden-modal');});
  choice.querySelectorAll('[data-install-device]').forEach(b=>b.addEventListener('click',()=>render(b.dataset.installDevice)));
  back?.addEventListener('click',()=>{choice.classList.remove('hidden-step');documentBox.classList.add('hidden-step');documentBox.innerHTML='';back.hidden=true;});
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
