(() => {
  const $ = id => document.getElementById(id);
  function dateOnly(value) { return String(value || '').slice(0,10); }
  function timeOnly(value) { return String(value || '').slice(0,5); }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-owner-edit-appointment]');
    if (!button) return;
    const id = button.dataset.ownerEditAppointment;
    const currentDate = button.dataset.date || '';
    const currentTime = button.dataset.time || '';
    const date = window.prompt('Nueva fecha de la cita (AAAA-MM-DD):', dateOnly(currentDate));
    if (date === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T12:00:00'))) {
      alert('Escribe una fecha válida con formato AAAA-MM-DD.');
      return;
    }
    const time = window.prompt('Nueva hora de la cita (formato 24 horas HH:MM):', timeOnly(currentTime));
    if (time === null) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      alert('Escribe una hora válida entre 00:00 y 23:59, por ejemplo 14:30.');
      return;
    }
    if (!window.confirm(`¿Cambiar esta cita al ${date} a las ${time}?`)) return;
    button.disabled = true;
    try {
      const data = await apiFetch(`/owner/appointments/${encodeURIComponent(id)}/reschedule`, {
        method:'PATCH', body:JSON.stringify({appointment_date:date,appointment_time:time})
      });
      alert(data.message || 'Cita reprogramada.');
      window.location.reload();
    } catch (error) {
      alert(error.message || 'No se pudo reprogramar la cita.');
      button.disabled = false;
    }
  });
})();
