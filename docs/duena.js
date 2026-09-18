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
let ownerCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let ownerCalendarData = new Map();
let ownerCalendarSelectedDate = '';

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function timeOptions(includeEndOfDay = false) {
  const values = [];
  for (let minutes = 0; minutes <= 1440; minutes += 30) {
    if (minutes === 1440 && !includeEndOfDay) continue;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    values.push(value);
  }
  return values;
}

function timeSelectHTML(value, allowEndOfDay = false) {
  return `<select class="interval-time" data-time>${timeOptions(allowEndOfDay).map(time => `<option value="${time}" ${time === value ? 'selected' : ''}>${formatTime12(time)}</option>`).join('')}</select>`;
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
  $d('photoReplacePicker')?.addEventListener('change', reemplazarFoto);
  $d('blockedDateForm').addEventListener('submit', bloquearFecha);
  $d('blockedDatesList').addEventListener('click', handleBlockedDateAction);
  $d('blockedMode')?.addEventListener('change', toggleBlockedMode);
  $d('blockedIntervalsEditor')?.addEventListener('click', handleBlockedIntervalEditorClick);
  $d('ownerGallery').addEventListener('click', handleGalleryAction);
  $d('ownerGallery').addEventListener('change', handlePhotoVisibilityChange);
  $d('saveWeeklyScheduleButton').addEventListener('click', saveWeeklySchedule);
  $d('scheduleOverrideForm').addEventListener('submit', saveScheduleOverride);
  $d('scheduleOverrideOpen').addEventListener('change', toggleOverrideIntervals);
  $d('scheduleOverridesList').addEventListener('click', handleOverrideAction);
  $d('detectTelegramButton')?.addEventListener('click', detectTelegramChat);
  $d('testTelegramButton')?.addEventListener('click', testOwnerTelegram);
  $d('ownerCalendarPrevious')?.addEventListener('click', () => changeOwnerCalendarMonth(-1));
  $d('ownerCalendarNext')?.addEventListener('click', () => changeOwnerCalendarMonth(1));
  $d('ownerCalendarToday')?.addEventListener('click', goToOwnerCalendarToday);
  $d('ownerCalendarService')?.addEventListener('change', () => { if (ownerCalendarSelectedDate) loadOwnerCalendarDay(ownerCalendarSelectedDate); });
  $d('ownerCalendarAppointments')?.addEventListener('click', handleOwnerCalendarAppointmentAction);

  updateOwnerServiceDurationHint();
  buildOverrideIntervals();
  buildBlockedIntervalsEditor();
  toggleBlockedMode();
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
  if (name === 'calendar') loadOwnerCalendar();
}

function closeOwnerTools() {
  document.querySelectorAll('.owner-tool-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
}

async function loadTelegramStatus() {
  const title = $d('smsStatusTitle');
  const text = $d('smsStatusText');
  if (!title || !text) return;
  try {
    const data = await apiFetch('/owner/notifications/status');
    if (data.configured) {
      title.textContent = 'Avisos por Telegram · activos';
      text.textContent = `Los avisos llegarán al chat de Suldery (${data.destination}).`;
    } else {
      title.textContent = 'Avisos por Telegram · pendientes';
      text.textContent = `Falta configurar: ${data.missing.join(', ')}.`;
    }
  } catch (error) {
    title.textContent = 'Avisos por Telegram';
    text.textContent = error.message;
  }
}

async function detectTelegramChat() {
  const button = $d('detectTelegramButton');
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Buscando…';
  try {
    const data = await apiFetch('/owner/notifications/telegram/detect-chat');
    alert(`Chat encontrado: ${data.chat_id}${data.first_name ? ` · ${data.first_name}` : ''}\n\nCopia ese chat ID a la variable TELEGRAM_CHAT_ID en Railway.`);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
    await loadTelegramStatus();
  }
}

async function testOwnerTelegram() {
  const button = $d('testTelegramButton');
  if (!button) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Enviando…';
  try {
    const data = await apiFetch('/owner/notifications/test', { method:'POST' });
    alert(data.message);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
    await loadTelegramStatus();
  }
}

async function refreshOwnerData() {
  await Promise.all([loadPendingUsers(), loadOwnerAppointments(), loadTelegramStatus()]);
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
  } else if (name === 'calendar') {
    openOwnerTool('calendar');
  }
}

function closeOwnerStats() {
  document.querySelectorAll('.owner-detail-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
}

function renderOwnerStatsDetails() {
  $d('activeClientCount').textContent = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted').length;
  const today = localISODate(new Date());
  $d('scheduledCount').textContent = ownerAppointmentsCache.filter(a => a.status === 'accepted' && String(a.appointment_date).slice(0,10) >= today).length;
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
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)}${user.phone ? ` · ${escapeHtml(user.phone)}` : ''}</p><small>Activa desde ${escapeHtml(formatDate(String(user.created_at).slice(0,10)))}</small></div><span class="status accepted">Activa</span>`;
    list.appendChild(item);
  });
}

function renderScheduledAppointments() {
  const list = $d('scheduledAppointmentsList');
  if (!list) return;
  const today = localISODate(new Date());
  const appointments = ownerAppointmentsCache
    .filter(appt => appt.status === 'accepted' && String(appt.appointment_date).slice(0,10) >= today)
    .sort((a,b) => `${a.appointment_date}T${a.appointment_time}`.localeCompare(`${b.appointment_date}T${b.appointment_time}`));
  list.innerHTML = '';
  if (!appointments.length) { list.innerHTML = '<div class="empty-state">No hay citas confirmadas de hoy en adelante.</div>'; return; }
  appointments.forEach(appt => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    const source = appt.user_id ? 'Clienta registrada' : 'Cita agendada manualmente';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${formatTime12(appt.appointment_time)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><small>${escapeHtml(source)}${appt.client_email ? ` · ${escapeHtml(appt.client_email)}` : ''}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><span class="status accepted">Confirmada</span>`;
    list.appendChild(item);
  });
}

async function loadPendingUsers() {
  const data = await apiFetch('/owner/users');
  ownerUsersCache = Array.isArray(data.users) ? data.users : [];
  const list = $d('pendingUsersList');
  const pending = ownerUsersCache.filter(user => user.status === 'pending');
  $d('activeClientCount').textContent = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted').length;
  list.innerHTML = '';
  if (!pending.length) { list.innerHTML = '<div class="empty-state">No hay cuentas esperando aprobación. Las clientas aceptadas aparecen en “Clientas activas”.</div>'; return; }
  pending.forEach(user => {
    const item = document.createElement('article'); item.className = 'admin-item';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)}${user.phone ? ` · Tel: ${escapeHtml(user.phone)}` : ''}</p><small>Solicitud recibida ${formatDate(String(user.created_at).slice(0,10))}</small></div><span class="status pending">Pendiente</span>`;
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    actions.append(actionButton('Aceptar', 'small-button', () => setUserStatus(user.id, 'accepted')));
    actions.append(actionButton('Rechazar', 'small-button cancel', () => setUserStatus(user.id, 'rejected')));
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
  const pending = ownerAppointmentsCache.filter(appt => appt.status === 'pending');
  list.innerHTML = '';
  if (!pending.length) { list.innerHTML = '<div class="empty-state">No hay solicitudes de citas pendientes. Las confirmadas permanecen en tu calendario.</div>'; return; }
  pending.forEach(appt => {
    const item = document.createElement('article'); item.className = 'admin-item';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${formatTime12(appt.appointment_time)}</p><small>${escapeHtml(appt.client_email || 'Cita manual')}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><span class="status pending">Pendiente</span>`;
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    actions.append(actionButton('Confirmar', 'small-button', () => setApptStatus(appt.id, 'accepted')));
    actions.append(actionButton('Rechazar', 'small-button cancel', () => setApptStatus(appt.id, 'rejected')));
    item.appendChild(actions); list.appendChild(item);
  });
  renderOwnerStatsDetails();
}

async function setApptStatus(id, status) {
  try {
    await apiFetch(`/owner/appointments/${id}/status`, {method:'PATCH',body:JSON.stringify({status})});
    await loadOwnerAppointments();
    renderOwnerStatsDetails();
    if (ownerCalendarSelectedDate) await loadOwnerCalendarDay(ownerCalendarSelectedDate);
  } catch (error) { alert(error.message); }
}


function ownerCalendarMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}`;
}

function ownerCalendarDateLabel(value) {
  return formatDate(value);
}

function ownerCalendarStatusText(meta) {
  if (!meta) return 'Sin información';
  if (meta.status === 'blocked') return 'Bloqueado';
  if (meta.status === 'rest') return 'Descanso';
  if (meta.status === 'pending') return meta.label || 'Pendiente';
  if (meta.status === 'appointments') return meta.label || 'Citas';
  return 'Libre';
}

async function loadOwnerCalendar() {
  const month = ownerCalendarMonthKey(ownerCalendarMonth);
  const label = $d('ownerCalendarMonthLabel');
  if (label) label.textContent = ownerCalendarMonth.toLocaleDateString('es-CO', {month:'long', year:'numeric'});
  try {
    const data = await apiFetch(`/owner/calendar?month=${encodeURIComponent(month)}`);
    ownerCalendarData = new Map((data.days || []).map(day => [day.date, day]));
    renderOwnerCalendar();
    if (ownerCalendarSelectedDate && ownerCalendarSelectedDate.startsWith(month)) {
      await loadOwnerCalendarDay(ownerCalendarSelectedDate);
    } else {
      const today = localISODate(new Date());
      const defaultDate = ownerCalendarData.has(today) ? today : (data.days?.find(day => ['available','appointments','pending'].includes(day.status))?.date || data.days?.[0]?.date);
      if (defaultDate) await loadOwnerCalendarDay(defaultDate);
    }
  } catch (error) {
    const feedback = $d('ownerCalendarFeedback');
    if (feedback) feedback.textContent = error.message;
  }
}

function renderOwnerCalendar() {
  const grid = $d('ownerCalendarDays');
  if (!grid) return;
  const year = ownerCalendarMonth.getFullYear();
  const month = ownerCalendarMonth.getMonth();
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  grid.innerHTML = '';
  for (let i = 0; i < first; i++) {
    const empty = document.createElement('span');
    empty.className = 'calendar-empty';
    grid.appendChild(empty);
  }
  const today = localISODate(new Date());
  for (let day = 1; day <= total; day++) {
    const date = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const meta = ownerCalendarData.get(date) || {status:'available', label:'Libre'};
    const localDate = new Date(year, month, day);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calendar-day owner-calendar-day ${meta.status}`;
    if (date === ownerCalendarSelectedDate) button.classList.add('selected');
    if (date === today) button.classList.add('today');
    button.innerHTML = `<strong>${day}</strong><span class="calendar-weekday">${localDate.toLocaleDateString('es-CO',{weekday:'short'}).replace('.','')}</span><small>${escapeHtml(ownerCalendarStatusText(meta))}</small>`;
    button.addEventListener('click', () => loadOwnerCalendarDay(date));
    grid.appendChild(button);
  }
}

function changeOwnerCalendarMonth(offset) {
  ownerCalendarMonth = new Date(ownerCalendarMonth.getFullYear(), ownerCalendarMonth.getMonth() + offset, 1);
  ownerCalendarSelectedDate = '';
  loadOwnerCalendar();
}

function goToOwnerCalendarToday() {
  const now = new Date();
  ownerCalendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  ownerCalendarSelectedDate = localISODate(now);
  loadOwnerCalendar();
}

async function loadOwnerCalendarDay(date) {
  ownerCalendarSelectedDate = date;
  renderOwnerCalendar();
  const service = $d('ownerCalendarService')?.value || 'Manicure semipermanente';
  try {
    const data = await apiFetch(`/owner/calendar/day?date=${encodeURIComponent(date)}&service=${encodeURIComponent(service)}`);
    const title = $d('ownerCalendarDayTitle');
    if (title) title.textContent = ownerCalendarDateLabel(data.date);
    const feedback = $d('ownerCalendarFeedback');
    if (feedback) feedback.textContent = data.blocked ? `Día bloqueado${data.blocked.reason ? `: ${data.blocked.reason}` : ''}.` : data.is_past ? 'Estás consultando una fecha pasada. Las citas quedan visibles para tu historial.' : 'Aquí puedes ver tus citas y los espacios que todavía están libres.';
    renderOwnerCalendarSchedule(data.schedule || [], Boolean(data.blocked), Boolean(data.is_past));
    renderOwnerCalendarAppointments(data.appointments || []);
    renderOwnerCalendarFreeSlots(data.free_slots || [], service, Boolean(data.blocked), Boolean(data.is_past));
  } catch (error) {
    const feedback = $d('ownerCalendarFeedback');
    if (feedback) feedback.textContent = error.message;
    $d('ownerCalendarAppointments').innerHTML = '';
    $d('ownerCalendarFreeSlots').innerHTML = '';
  }
}

function renderOwnerCalendarSchedule(intervals, blocked, isPast) {
  const box = $d('ownerCalendarSchedule');
  if (!box) return;
  if (blocked) { box.innerHTML = '<span class="empty-state">Día bloqueado completo.</span>'; return; }
  if (!intervals.length) { box.innerHTML = '<span class="empty-state">No hay atención programada ese día.</span>'; return; }
  const note = isPast ? '<span class="owner-calendar-note">Historial · </span>' : '';
  box.innerHTML = `${note}${intervals.map(i => `<span class="owner-calendar-chip">${escapeHtml(formatTime12(i.start_time))} – ${escapeHtml(formatTime12(i.end_time))}</span>`).join('')}`;
}

function renderOwnerCalendarAppointments(appointments) {
  const list = $d('ownerCalendarAppointments');
  if (!list) return;
  list.innerHTML = '';
  if (!appointments.length) {
    list.innerHTML = '<div class="empty-state">No hay citas agendadas para este día.</div>';
    return;
  }
  appointments.forEach(appt => {
    const item = document.createElement('article');
    item.className = 'admin-item owner-calendar-appointment';
    const status = statusLabel(appt.status);
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(formatTime12(appt.appointment_time))} · ${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><small>${escapeHtml(appt.client_email || 'Cita agendada manualmente')}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><span class="status ${appt.status}">${status}</span>`;
    if (['pending','accepted'].includes(appt.status)) {
      const actions = document.createElement('div'); actions.className = 'admin-actions';
      if (appt.status === 'pending') {
        actions.append(actionButton('Confirmar', 'small-button', () => setApptStatus(appt.id, 'accepted')));
        actions.append(actionButton('Rechazar', 'small-button cancel', () => setApptStatus(appt.id, 'rejected')));
      } else {
        actions.append(actionButton('Cancelar cita', 'small-button cancel', () => setApptStatus(appt.id, 'cancelled')));
      }
      item.appendChild(actions);
    }
    list.appendChild(item);
  });
}

function renderOwnerCalendarFreeSlots(slots, service, blocked, isPast) {
  const box = $d('ownerCalendarFreeSlots');
  if (!box) return;
  box.innerHTML = '';
  if (blocked) { box.innerHTML = '<div class="empty-state">No hay espacios porque el día está bloqueado.</div>'; return; }
  if (isPast) { box.innerHTML = '<div class="empty-state">Los espacios libres no se calculan para fechas pasadas.</div>'; return; }
  if (!slots.length) { box.innerHTML = '<div class="empty-state">No quedan espacios para este servicio.</div>'; return; }
  const intro = document.createElement('p'); intro.className = 'owner-calendar-note'; intro.textContent = `Espacios libres para ${service}:`;
  box.appendChild(intro);
  const wrap = document.createElement('div'); wrap.className = 'owner-calendar-free-grid';
  slots.forEach(time => { const chip = document.createElement('span'); chip.className = 'owner-calendar-free-chip'; chip.textContent = formatTime12(time); wrap.appendChild(chip); });
  box.appendChild(wrap);
}

function handleOwnerCalendarAppointmentAction(event) {
  const button = event.target.closest('[data-owner-calendar-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  if (!id) return;
  const action = button.dataset.ownerCalendarAction;
  if (action === 'accept') setApptStatus(id, 'accepted');
  if (action === 'reject') setApptStatus(id, 'rejected');
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
    data.slots.forEach(time => { const option = document.createElement('option'); option.value = time; option.textContent = formatTime12(time); select.appendChild(option); });
  } catch (error) { select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`; }
}

function updateOwnerServiceDurationHint() { $d('ownerServiceDurationHint').textContent = `Duración: ${DURATION_LABELS[$d('ownerService').value] || '—'}`; }

async function submitManualBooking(event) {
  event.preventDefault();
  const message = $d('ownerBookingMessage'); const button = $d('ownerBookingButton');
  const body = { clientName:$d('ownerClientName').value.trim(), clientPhone:$d('ownerClientPhone')?.value.trim() || '', service:$d('ownerService').value, date:$d('ownerAppointmentDate').value, time:$d('ownerAppointmentTime').value };
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
    const intervals = item.is_open ? item.intervals.map(i => `${formatTime12(i.start_time)}–${formatTime12(i.end_time)}`).join(' · ') : 'Descanso todo el día';
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

function buildBlockedIntervalsEditor() {
  const container = $d('blockedIntervalsEditor');
  if (!container) return;
  container.innerHTML = '';
  addBlockedIntervalRow(container, { start_time: '09:00', end_time: '10:30' });
}

function addBlockedIntervalRow(container, values = { start_time: '09:00', end_time: '10:30' }) {
  const row = document.createElement('div');
  row.className = 'interval-row blocked-interval-row';
  row.innerHTML = `
    <div class="interval-selects">
      <label>Desde${timeSelectHTML(values.start_time)}</label>
      <span>—</span>
      <label>Hasta${timeSelectHTML(values.end_time, true)}</label>
    </div>
    <button type="button" class="small-button ghost blocked-interval-remove">Quitar</button>`;
  row.querySelector('.blocked-interval-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function handleBlockedIntervalEditorClick() {}

function toggleBlockedMode() {
  const mode = $d('blockedMode')?.value || 'full';
  const editor = $d('blockedIntervalsEditor');
  const submit = $d('blockedSubmitButton');
  if (!editor || !submit) return;
  editor.classList.toggle('hidden-tool-panel', mode !== 'hours');
  submit.textContent = mode === 'hours' ? 'Bloquear horas' : 'Bloquear día';
}

function collectBlockedIntervals() {
  return [...document.querySelectorAll('#blockedIntervalsEditor .blocked-interval-row')].map(row => ({
    start_time: row.querySelectorAll('[data-time]')[0].value,
    end_time: row.querySelectorAll('[data-time]')[1].value
  }));
}

async function loadBlockedDates() {
  const data = await apiFetch('/owner/blocked-dates');
  const list = $d('blockedDatesList');
  list.innerHTML = '';
  $d('blockedDate').min = localISODate(new Date());

  const fullDates = Array.isArray(data.dates) ? data.dates : [];
  const hours = Array.isArray(data.hours) ? data.hours : [];

  if (!fullDates.length && !hours.length) {
    list.innerHTML = '<div class="empty-state">No tienes días ni horas bloqueadas.</div>';
    return;
  }

  fullDates.forEach(item => {
    const article = document.createElement('article');
    article.className = 'blocked-date-item';
    article.innerHTML = `<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>Día completo${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</span></div><button type="button" class="small-button cancel" data-blocked-id="${item.id}">Desbloquear</button>`;
    list.appendChild(article);
  });

  hours.forEach(item => {
    const article = document.createElement('article');
    article.className = 'blocked-date-item';
    article.innerHTML = `<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>Bloqueado: ${formatTime12(item.start_time)} – ${formatTime12(item.end_time)}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</span></div><button type="button" class="small-button cancel" data-blocked-hour-id="${item.id}">Quitar</button>`;
    list.appendChild(article);
  });
}

async function bloquearFecha(event) {
  event.preventDefault();
  const date = $d('blockedDate').value;
  const reason = $d('blockedReason').value.trim();
  const mode = $d('blockedMode')?.value || 'full';
  if (!date) return;

  const body = {
    date,
    reason,
    mode,
    intervals: mode === 'hours' ? collectBlockedIntervals() : []
  };

  try {
    await apiFetch('/owner/blocked-dates', { method: 'POST', body: JSON.stringify(body) });
    $d('blockedDateForm').reset();
    $d('blockedDate').min = localISODate(new Date());
    buildBlockedIntervalsEditor();
    toggleBlockedMode();
    await loadBlockedDates();
    await loadOwnerSlots();
  } catch (error) {
    alert(error.message);
  }
}

async function handleBlockedDateAction(event) {
  const dayButton = event.target.closest('[data-blocked-id]');
  const hourButton = event.target.closest('[data-blocked-hour-id]');

  if (dayButton) {
    if (!confirm('¿Desbloquear todo ese día?')) return;
    try {
      await apiFetch(`/owner/blocked-dates/${dayButton.dataset.blockedId}`, { method: 'DELETE' });
      await loadBlockedDates();
      await loadOwnerSlots();
      await loadScheduleEditor();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (hourButton) {
    if (!confirm('¿Quitar este bloqueo de horas?')) return;
    try {
      await apiFetch(`/owner/blocked-hours/${hourButton.dataset.blockedHourId}`, { method: 'DELETE' });
      await loadBlockedDates();
      await loadOwnerSlots();
      await loadScheduleEditor();
    } catch (error) {
      alert(error.message);
    }
  }
}

async function loadOwnerGallery() {
  const data = await apiFetch('/owner/portfolio');
  ownerPhotosCache = Array.isArray(data.photos) ? data.photos : [];
  if ($d('photoCount')) $d('photoCount').textContent = ownerPhotosCache.length;

  const gallery = $d('ownerGallery');
  gallery.innerHTML = '';
  if (!ownerPhotosCache.length) {
    gallery.innerHTML = '<div class="empty-state">Todavía no hay fotos publicadas.</div>';
    return;
  }

  ownerPhotosCache.forEach((photo, index) => {
    const figure = document.createElement('figure');
    figure.className = 'portfolio-photo owner-photo';
    const currentVisibility = photo.visibility === 'both' ? '' : (photo.visibility || 'login');
    figure.innerHTML = `
      <div class="owner-photo-number">${index + 1}</div>
      <img src="${escapeAttribute(photo.image_url)}" alt="${escapeAttribute(photo.title)}" loading="lazy">
      <figcaption>${escapeAttribute(photo.title)}</figcaption>
      ${photo.visibility === 'both' ? '<small class="photo-legacy-note">Esta foto estaba publicada en ambos espacios. Elige dónde dejarla ahora.</small>' : ''}
      <label class="photo-visibility">Mostrar en
        <select data-photo-visibility="${photo.id}">
          <option value="" ${currentVisibility === '' ? 'selected' : ''}>Selecciona…</option>
          <option value="login" ${currentVisibility === 'login' ? 'selected' : ''}>Inicio de sesión</option>
          <option value="client" ${currentVisibility === 'client' ? 'selected' : ''}>Página de clienta</option>
        </select>
      </label>
      <div class="photo-actions">
        <button type="button" class="small-button ghost" ${index === 0 ? 'disabled' : ''} data-photo-action="move" data-id="${photo.id}" data-direction="up">↑</button>
        <button type="button" class="small-button ghost" ${index === ownerPhotosCache.length - 1 ? 'disabled' : ''} data-photo-action="move" data-id="${photo.id}" data-direction="down">↓</button>
        <button type="button" class="small-button ghost" data-photo-action="replace" data-id="${photo.id}">Cambiar foto</button>
        <button type="button" class="remove-photo" data-photo-action="delete" data-id="${photo.id}">Eliminar</button>
      </div>`;
    gallery.appendChild(figure);
  });
}

async function handlePhotoVisibilityChange(event) {
  const select = event.target.closest('[data-photo-visibility]');
  if (!select) return;
  try {
    await apiFetch(`/owner/portfolio/${select.dataset.photoVisibility}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility: select.value })
    });
  } catch (error) {
    alert(error.message);
    await loadOwnerGallery();
  }
}

function handleGalleryAction(event){const button=event.target.closest('[data-photo-action]');if(!button||button.disabled)return;const id=Number(button.dataset.id);if(button.dataset.photoAction==='delete')eliminarFoto(id);if(button.dataset.photoAction==='move')moverFoto(id,button.dataset.direction);if(button.dataset.photoAction==='replace')prepararReemplazoFoto(id);}

async function subirFoto(event){const file=event.target.files[0];if(!file)return;const form=new FormData();form.append('photo',file);form.append('title','Diseño Suldery Nails');form.append('visibility',$d('photoVisibilityPicker')?.value || 'login');try{await apiFetch('/owner/portfolio',{method:'POST',body:form});await loadOwnerGallery();}catch(error){alert(error.message);}finally{event.target.value='';}}

function prepararReemplazoFoto(id){const input=$d('photoReplacePicker');if(!input)return;input.dataset.photoId=String(id);input.value='';input.click();}

async function reemplazarFoto(event){const file=event.target.files[0];const id=Number(event.target.dataset.photoId);if(!file||!id)return;const form=new FormData();form.append('photo',file);try{await apiFetch(`/owner/portfolio/${id}/image`,{method:'PATCH',body:form});await loadOwnerGallery();}catch(error){alert(error.message);}finally{event.target.value='';delete event.target.dataset.photoId;}}
async function eliminarFoto(id){if(!confirm('¿Eliminar esta foto?'))return;try{await apiFetch(`/owner/portfolio/${id}`,{method:'DELETE'});await loadOwnerGallery();}catch(error){alert(error.message);}}
async function moverFoto(id,direction){try{await apiFetch(`/owner/portfolio/${id}/move`,{method:'PATCH',body:JSON.stringify({direction})});await loadOwnerGallery();}catch(error){alert(error.message);}}
function actionButton(text,cls,handler){const button=document.createElement('button');button.type='button';button.className=cls;button.textContent=text;button.addEventListener('click',handler);return button;}
function statusLabel(status){return status==='accepted'?'Confirmada':status==='pending'?'Pendiente':status==='cancelled'?'Cancelada':status==='rejected'?'Rechazada':status;}
function escapeHtml(text){return String(text??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escapeAttribute(text){return escapeHtml(text);}

document.addEventListener('DOMContentLoaded',initDuena);
