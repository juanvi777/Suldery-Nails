let ownerUser = null;
const $d = id => document.getElementById(id);
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DURATION_LABELS = {
  'Manicure semipermanente': '1 h 30 min',
  'Pedicure semipermanente': '1 hora',
  'Dipping': '2 horas',
  'Press on': '2 horas'
};

let ownerUsersCache = [];
let ownerAppointmentsCache = [];
let ownerPhotosCache = [];

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function timeOptions(includeEndOfDay = false) {
  const values = [];
  for (let minutes = 0; minutes <= 1440; minutes += 30) {
    if (minutes === 1440 && !includeEndOfDay) continue;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    values.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
  return values;
}

function timeSelectHTML(value, allowEndOfDay = false) {
  return `<select class="interval-time" data-time>${timeOptions(allowEndOfDay).map(time => `<option value="${time}" ${time === value ? 'selected' : ''}>${time}</option>`).join('')}</select>`;
}

function intervalRow(interval = { start_time:'07:00', end_time:'12:00' }, removable = true) {
  const row = document.createElement('div');
  row.className = 'interval-row';
  row.innerHTML = `<div class="interval-selects"><label>Desde${timeSelectHTML(interval.start_time)}</label><span>—</span><label>Hasta${timeSelectHTML(interval.end_time, true)}</label></div>${removable ? '<button type="button" class="small-button ghost interval-remove">Quitar</button>' : ''}`;
  const remove = row.querySelector('.interval-remove');
  if (remove) remove.addEventListener('click', () => row.remove());
  return row;
}

function addInterval(container, interval) {
  container.appendChild(intervalRow(interval));
}

function buildWeeklyEditor(weekly) {
  const form = $d('weeklyScheduleForm');
  form.innerHTML = '';
  for (let weekday = 1; weekday <= 7; weekday++) {
    const intervals = Array.isArray(weekly?.[weekday]) ? weekly[weekday] : [];
    const card = document.createElement('article');
    card.className = 'weekday-schedule-card';
    card.dataset.weekday = String(weekday);
    card.innerHTML = `<div class="weekday-schedule-head"><div><strong>${DAY_NAMES[weekday % 7]}</strong><small> ${weekday === 7 ? 'Puedes abrirlo si lo necesitas' : 'Horario semanal recurrente'}</small></div><label class="schedule-switch"><input type="checkbox" data-day-open ${intervals.length ? 'checked' : ''}><span></span><b>Atender</b></label></div><div class="interval-list" data-intervals></div><button type="button" class="small-button add-interval">+ Agregar tramo</button>`;
    const list = card.querySelector('[data-intervals]');
    intervals.forEach((interval) => addInterval(list, interval));
    if (!intervals.length) list.appendChild(intervalRow({start_time:'07:00',end_time:'12:00'}, true)).classList.add('template-row');
    card.querySelector('.add-interval').addEventListener('click', () => addInterval(list, {start_time:'13:00',end_time:'18:00'}));
    form.appendChild(card);
  }
}

function collectScheduleForm() {
  const weekly = {};
  document.querySelectorAll('.weekday-schedule-card').forEach(card => {
    const weekday = Number(card.dataset.weekday);
    const isOpen = card.querySelector('[data-day-open]').checked;
    if (!isOpen) { weekly[weekday] = []; return; }
    weekly[weekday] = [...card.querySelectorAll('[data-intervals] .interval-row')].map(row => ({
      start_time: row.querySelectorAll('[data-time]')[0].value,
      end_time: row.querySelectorAll('[data-time]')[1].value
    }));
  });
  return weekly;
}

function buildOverrideIntervals() {
  const container = $d('scheduleOverrideIntervals');
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'interval-editor-head';
  heading.innerHTML = '<span>Tramos del día</span><button type="button" class="small-button" id="addOverrideInterval">+ Tramo</button>';
  container.appendChild(heading);
  const list = document.createElement('div');
  list.className = 'override-interval-list';
  list.dataset.intervals = '';
  container.appendChild(list);
  addInterval(list, {start_time:'07:00',end_time:'12:00'});
  addInterval(list, {start_time:'13:00',end_time:'18:00'});
  heading.querySelector('#addOverrideInterval').addEventListener('click', () => addInterval(list, {start_time:'13:00',end_time:'15:00'}));
  toggleOverrideIntervals();
}

function toggleOverrideIntervals() {
  const open = $d('scheduleOverrideOpen')?.value === 'yes';
  const container = $d('scheduleOverrideIntervals');
  if (container) container.classList.toggle('disabled-section', !open);
}

function collectOverrideIntervals() {
  return [...document.querySelectorAll('#scheduleOverrideIntervals [data-intervals] .interval-row')].map(row => ({
    start_time: row.querySelectorAll('[data-time]')[0].value,
    end_time: row.querySelectorAll('[data-time]')[1].value
  }));
}

async function initDuena() {
  ownerUser = await requireRole('owner');
  if (!ownerUser) return;
  const now = new Date();
  $d('ownerDateLabel').textContent = now.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
  const today = localISODate(now);
  $d('ownerAppointmentDate').min = today;
  $d('ownerAppointmentDate').value = today;
  $d('blockedDate').min = today;
  $d('scheduleOverrideDate').min = today;

  document.querySelectorAll('[data-owner-tool]').forEach(button => button.addEventListener('click', () => openOwnerTool(button.dataset.ownerTool)));
  document.querySelectorAll('[data-close-owner-tool]').forEach(button => button.addEventListener('click', closeOwnerTools));
  document.querySelectorAll('[data-owner-stat]').forEach(button => button.addEventListener('click', () => openOwnerStat(button.dataset.ownerStat)));
  document.querySelectorAll('[data-close-owner-stat]').forEach(button => button.addEventListener('click', closeOwnerStats));
  $d('ownerAppointmentDate').addEventListener('change', loadOwnerSlots);
  $d('ownerService').addEventListener('change', () => { updateOwnerServiceDurationHint(); loadOwnerSlots(); });
  $d('ownerBookingForm').addEventListener('submit', submitManualBooking);
  $d('photoPicker').addEventListener('change', subirFoto);
  $d('blockedDateForm').addEventListener('submit', bloquearFecha);
  $d('blockedDatesList').addEventListener('click', handleBlockedDateAction);
  $d('ownerGallery').addEventListener('click', handleGalleryAction);
  $d('saveWeeklyScheduleButton').addEventListener('click', saveWeeklySchedule);
  $d('scheduleOverrideForm').addEventListener('submit', saveScheduleOverride);
  $d('scheduleOverrideOpen').addEventListener('change', toggleOverrideIntervals);
  $d('scheduleOverridesList').addEventListener('click', handleOverrideAction);

  updateOwnerServiceDurationHint();
  buildOverrideIntervals();
  await refreshOwnerData();
}

function openOwnerTool(name) {
  document.querySelectorAll('.owner-tool-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
  const panel = $d(`ownerTool${name[0].toUpperCase()}${name.slice(1)}`);
  if (!panel) return;
  panel.classList.remove('hidden-tool-panel');
  panel.scrollIntoView({ behavior:'smooth', block:'start' });
  if (name === 'schedule') loadScheduleEditor();
  if (name === 'manual') loadOwnerSlots();
  if (name === 'blocked') loadBlockedDates();
  if (name === 'photos') loadOwnerGallery();
}

function closeOwnerTools() {
  document.querySelectorAll('.owner-tool-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
}

async function refreshOwnerData() {
  await Promise.all([loadPendingUsers(), loadOwnerAppointments()]);
  await loadOwnerGallery();
  await loadBlockedDates();
  updateOwnerServiceDurationHint();
  await loadOwnerSlots();
  renderOwnerStatsDetails();
}

function openOwnerStat(name) {
  closeOwnerTools();
  closeOwnerStats();
  if (name === 'clients') {
    renderActiveClients();
    $d('ownerStatClients').classList.remove('hidden-tool-panel');
    $d('ownerStatClients').scrollIntoView({ behavior:'smooth', block:'start' });
  } else if (name === 'appointments') {
    renderScheduledAppointments();
    $d('ownerStatAppointments').classList.remove('hidden-tool-panel');
    $d('ownerStatAppointments').scrollIntoView({ behavior:'smooth', block:'start' });
  } else if (name === 'portfolio') {
    openOwnerTool('photos');
  }
}

function closeOwnerStats() {
  document.querySelectorAll('.owner-detail-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
}

function renderOwnerStatsDetails() {
  $d('activeClientCount').textContent = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted').length;
  const today = localISODate(new Date());
  $d('scheduledCount').textContent = ownerAppointmentsCache.filter(a => ['pending','accepted'].includes(a.status) && String(a.appointment_date).slice(0,10) >= today).length;
  $d('photoCount').textContent = ownerPhotosCache.length;
  renderActiveClients();
  renderScheduledAppointments();
}

function renderActiveClients() {
  const list = $d('activeClientsList');
  if (!list) return;
  const clients = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted');
  list.innerHTML = '';
  if (!clients.length) { list.innerHTML = '<div class="empty-state">Todavía no hay clientas activas.</div>'; return; }
  clients.forEach(user => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)}</p><small>Activa desde ${escapeHtml(formatDate(String(user.created_at).slice(0,10)))}</small></div><span class="status accepted">Activa</span>`;
    list.appendChild(item);
  });
}

function renderScheduledAppointments() {
  const list = $d('scheduledAppointmentsList');
  if (!list) return;
  const today = localISODate(new Date());
  const appointments = ownerAppointmentsCache
    .filter(appt => ['pending','accepted'].includes(appt.status) && String(appt.appointment_date).slice(0,10) >= today)
    .sort((a,b) => `${a.appointment_date}T${a.appointment_time}`.localeCompare(`${b.appointment_date}T${b.appointment_time}`));
  list.innerHTML = '';
  if (!appointments.length) { list.innerHTML = '<div class="empty-state">No hay citas agendadas de hoy en adelante.</div>'; return; }
  appointments.forEach(appt => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    item.innerHTML = `<strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${String(appt.appointment_time).slice(0,5)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><span class="status ${appt.status}">${statusLabel(appt.status)}</span><small>${escapeHtml(appt.client_email || 'Cita manual')}</small>`;
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    if (appt.status === 'pending') actions.append(actionButton('Confirmar', 'small-button', () => setApptStatus(appt.id, 'accepted')));
    if (['pending','accepted'].includes(appt.status)) actions.append(actionButton('Cancelar', 'small-button cancel', () => setApptStatus(appt.id, 'cancelled')));
    item.appendChild(actions);
    list.appendChild(item);
  });
}

async function loadPendingUsers() {
  const data = await apiFetch('/owner/users');
  ownerUsersCache = Array.isArray(data.users) ? data.users : [];
  const list = $d('pendingUsersList');
  const pending = data.users.filter(user => user.status === 'pending');
  $d('activeClientCount').textContent = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted').length;
  list.innerHTML = '';
  if (!data.users.length) { list.innerHTML = '<div class="empty-state">No hay solicitudes todavía.</div>'; return; }
  data.users.forEach(user => {
    const item = document.createElement('article'); item.className = 'admin-item';
    const label = user.status === 'pending' ? 'Pendiente' : user.status === 'accepted' ? 'Aceptada' : 'Rechazada';
    item.innerHTML = `<strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)}</p><span class="status ${user.status}">${label}</span>`;
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    if (user.status !== 'accepted') actions.append(actionButton('Aceptar', 'small-button', () => setUserStatus(user.id, 'accepted')));
    if (user.status !== 'rejected') actions.append(actionButton('Rechazar', 'small-button cancel', () => setUserStatus(user.id, 'rejected')));
    if (user.status !== 'pending') actions.append(actionButton('Pendiente', 'small-button ghost', () => setUserStatus(user.id, 'pending')));
    item.appendChild(actions); list.appendChild(item);
  });
}

async function setUserStatus(id, status) {
  try { await apiFetch(`/owner/users/${id}/status`, {method:'PATCH',body:JSON.stringify({status})}); await loadPendingUsers(); }
  catch (error) { alert(error.message); }
  renderOwnerStatsDetails();
}

async function loadOwnerAppointments() {
  const data = await apiFetch('/owner/appointments');
  ownerAppointmentsCache = Array.isArray(data.appointments) ? data.appointments : [];
  const list = $d('ownerAppointmentsList');
  const today = localISODate(new Date());
  $d('scheduledCount').textContent = ownerAppointmentsCache.filter(a => ['pending','accepted'].includes(a.status) && String(a.appointment_date).slice(0,10) >= today).length;
  list.innerHTML = '';
  if (!data.appointments.length) { list.innerHTML = '<div class="empty-state">No hay citas registradas.</div>'; return; }
  data.appointments.forEach(appt => {
    const item = document.createElement('article'); item.className = 'admin-item';
    item.innerHTML = `<strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${String(appt.appointment_time).slice(0,5)}</p><span class="status ${appt.status}">${statusLabel(appt.status)}</span><small>${escapeHtml(appt.client_email || 'Cita manual')}</small>`;
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    if (appt.status === 'pending') actions.append(actionButton('Confirmar', 'small-button', () => setApptStatus(appt.id, 'accepted')));
    if (['pending','accepted'].includes(appt.status)) actions.append(actionButton('Cancelar', 'small-button cancel', () => setApptStatus(appt.id, 'cancelled')));
    if (appt.status !== 'rejected') actions.append(actionButton('Rechazar', 'small-button ghost', () => setApptStatus(appt.id, 'rejected')));
    item.appendChild(actions); list.appendChild(item);
  });
}

async function setApptStatus(id, status) {
  try { await apiFetch(`/owner/appointments/${id}/status`, {method:'PATCH',body:JSON.stringify({status})}); await loadOwnerAppointments(); renderOwnerStatsDetails(); }
  catch (error) { alert(error.message); }
}

async function loadOwnerSlots() {
  const date = $d('ownerAppointmentDate').value;
  const select = $d('ownerAppointmentTime');
  select.innerHTML = '<option value="">Cargando…</option>';
  if (!date) return;
  try {
    const service = encodeURIComponent($d('ownerService').value);
    const data = await apiFetch(`/owner/slots?date=${encodeURIComponent(date)}&service=${service}`);
    select.innerHTML = '';
    if (!data.slots.length) { select.innerHTML = '<option value="">No hay horarios disponibles</option>'; return; }
    data.slots.forEach(time => { const option = document.createElement('option'); option.value = time; option.textContent = time; select.appendChild(option); });
  } catch (error) { select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`; }
}

function updateOwnerServiceDurationHint() { $d('ownerServiceDurationHint').textContent = `Duración: ${DURATION_LABELS[$d('ownerService').value] || '—'}`; }

async function submitManualBooking(event) {
  event.preventDefault();
  const message = $d('ownerBookingMessage'); const button = $d('ownerBookingButton');
  const body = { clientName:$d('ownerClientName').value.trim(), service:$d('ownerService').value, date:$d('ownerAppointmentDate').value, time:$d('ownerAppointmentTime').value };
  if (!body.clientName || !body.date || !body.time) { setMessage(message,'Completa nombre, fecha y hora.'); return; }
  button.disabled = true; setMessage(message,'Guardando cita…');
  try { const data = await apiFetch('/owner/appointments',{method:'POST',body:JSON.stringify(body)}); setMessage(message,data.message,true); $d('ownerClientName').value=''; await Promise.all([loadOwnerSlots(),loadOwnerAppointments()]); renderOwnerStatsDetails(); }
  catch(error){ setMessage(message,error.message); }
  finally{ button.disabled=false; }
}

async function loadScheduleEditor() {
  try {
    const data = await apiFetch('/owner/schedule-editor');
    buildWeeklyEditor(data.weekly);
    renderScheduleOverrides(data.overrides || []);
  } catch (error) { setMessage($d('weeklyScheduleMessage'), error.message); }
}

async function saveWeeklySchedule() {
  const button = $d('saveWeeklyScheduleButton'); const message = $d('weeklyScheduleMessage');
  const weekly = collectScheduleForm();
  button.disabled = true; setMessage(message,'Guardando…');
  try { const data = await apiFetch('/owner/schedule-editor',{method:'PUT',body:JSON.stringify({weekly})}); setMessage(message,data.message,true); await loadScheduleEditor(); await loadOwnerSlots(); }
  catch(error){ setMessage(message,error.message); }
  finally{ button.disabled=false; }
}

async function saveScheduleOverride(event) {
  event.preventDefault();
  const date = $d('scheduleOverrideDate').value; const isOpen = $d('scheduleOverrideOpen').value === 'yes';
  try {
    await apiFetch('/owner/schedule-overrides',{method:'POST',body:JSON.stringify({date,is_open:isOpen,intervals:isOpen?collectOverrideIntervals():[],note:$d('scheduleOverrideNote').value.trim()})});
    $d('scheduleOverrideForm').reset(); $d('scheduleOverrideDate').min = localISODate(new Date());
    buildOverrideIntervals(); await loadScheduleEditor(); await loadOwnerSlots();
  } catch(error){ alert(error.message); }
}

function renderScheduleOverrides(overrides) {
  const list = $d('scheduleOverridesList'); list.innerHTML = '';
  if (!overrides.length) { list.innerHTML = '<div class="empty-state">No hay cambios especiales guardados.</div>'; return; }
  overrides.forEach(item => {
    const article = document.createElement('article'); article.className='override-item';
    const intervals = item.is_open ? item.intervals.map(i => `${i.start_time}–${i.end_time}`).join(' · ') : 'Descanso todo el día';
    article.innerHTML = `<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>${escapeHtml(intervals)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</span></div><button type="button" class="small-button cancel" data-override-date="${item.date}">Quitar</button>`;
    list.appendChild(article);
  });
}

async function handleOverrideAction(event) {
  const button = event.target.closest('[data-override-date]'); if (!button) return;
  if (!confirm('¿Quitar este horario especial? La fecha volverá al horario semanal.')) return;
  try { await apiFetch(`/owner/schedule-overrides/${button.dataset.overrideDate}`,{method:'DELETE'}); await loadScheduleEditor(); await loadOwnerSlots(); }
  catch(error){ alert(error.message); }
}

async function loadBlockedDates() {
  const data = await apiFetch('/owner/blocked-dates'); const list=$d('blockedDatesList'); list.innerHTML='';
  $d('blockedDate').min=localISODate(new Date());
  if(!data.dates.length){list.innerHTML='<div class="empty-state">No tienes fechas bloqueadas.</div>';return;}
  data.dates.forEach(item=>{const article=document.createElement('article');article.className='blocked-date-item';article.innerHTML=`<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>${escapeHtml(item.reason||'Sin motivo indicado')}</span></div><button type="button" class="small-button cancel" data-blocked-id="${item.id}">Desbloquear</button>`;list.appendChild(article);});
}

async function bloquearFecha(event){event.preventDefault();const date=$d('blockedDate').value;const reason=$d('blockedReason').value.trim();if(!date)return;try{await apiFetch('/owner/blocked-dates',{method:'POST',body:JSON.stringify({date,reason})});$d('blockedDateForm').reset();await loadBlockedDates();await loadScheduleEditor();}catch(error){alert(error.message);}}

async function handleBlockedDateAction(event){const button=event.target.closest('[data-blocked-id]');if(!button)return;if(!confirm('¿Desbloquear este día?'))return;try{await apiFetch(`/owner/blocked-dates/${button.dataset.blockedId}`,{method:'DELETE'});await loadBlockedDates();await loadOwnerSlots();await loadScheduleEditor();}catch(error){alert(error.message);}}

async function loadOwnerGallery(){const data=await apiFetch('/portfolio');ownerPhotosCache=Array.isArray(data.photos)?data.photos:[];$d('photoCount').textContent=ownerPhotosCache.length;const gallery=$d('ownerGallery');gallery.innerHTML='';if(!data.photos.length){gallery.innerHTML='<div class="empty-state">Todavía no hay fotos publicadas.</div>';return;}data.photos.forEach((photo,index)=>{const figure=document.createElement('figure');figure.className='portfolio-photo owner-photo';figure.innerHTML=`<div class="owner-photo-number">${index+1}</div><img src="${escapeAttribute(photo.image_url)}" alt="${escapeAttribute(photo.title)}" loading="lazy"><figcaption>${escapeAttribute(photo.title)}</figcaption><div class="photo-actions"><button type="button" class="small-button ghost" ${index===0?'disabled':''} data-photo-action="move" data-id="${photo.id}" data-direction="up">↑</button><button type="button" class="small-button ghost" ${index===data.photos.length-1?'disabled':''} data-photo-action="move" data-id="${photo.id}" data-direction="down">↓</button><button type="button" class="remove-photo" data-photo-action="delete" data-id="${photo.id}">Eliminar</button></div>`;gallery.appendChild(figure);});}

function handleGalleryAction(event){const button=event.target.closest('[data-photo-action]');if(!button||button.disabled)return;const id=Number(button.dataset.id);if(button.dataset.photoAction==='delete')eliminarFoto(id);if(button.dataset.photoAction==='move')moverFoto(id,button.dataset.direction);}

async function subirFoto(event){const file=event.target.files[0];if(!file)return;const form=new FormData();form.append('photo',file);form.append('title','Diseño Suldery Nails');try{await apiFetch('/owner/portfolio',{method:'POST',body:form});await loadOwnerGallery();}catch(error){alert(error.message);}finally{event.target.value='';}}
async function eliminarFoto(id){if(!confirm('¿Eliminar esta foto?'))return;try{await apiFetch(`/owner/portfolio/${id}`,{method:'DELETE'});await loadOwnerGallery();}catch(error){alert(error.message);}}
async function moverFoto(id,direction){try{await apiFetch(`/owner/portfolio/${id}/move`,{method:'PATCH',body:JSON.stringify({direction})});await loadOwnerGallery();}catch(error){alert(error.message);}}
function actionButton(text,cls,handler){const button=document.createElement('button');button.type='button';button.className=cls;button.textContent=text;button.addEventListener('click',handler);return button;}
function statusLabel(status){return status==='accepted'?'Confirmada':status==='pending'?'Pendiente':status==='cancelled'?'Cancelada':status==='rejected'?'Rechazada':status;}
function escapeHtml(text){return String(text??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escapeAttribute(text){return escapeHtml(text);}

document.addEventListener('DOMContentLoaded',initDuena);
