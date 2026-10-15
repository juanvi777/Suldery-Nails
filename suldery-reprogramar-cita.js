(() => {
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-owner-edit-appointment]');
    if (!button) return;
    const id = button.dataset.ownerEditAppointment;
    const currentDate = String(button.dataset.date || '').slice(0,10);
    const currentTime = String(button.dataset.time || '').slice(0,5);
    const date = window.prompt('Nueva fecha de la cita (AAAA-MM-DD):', currentDate);
    if (date === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00'))) {
      alert('Escribe una fecha válida con formato AAAA-MM-DD.');
      return;
    }
    const time = window.prompt('Nueva hora de la cita (formato 24 horas, en bloques de 30 minutos):', currentTime);
    if (time === null) return;
    if (!/^([01]\d|2[0-3]):(00|30)$/.test(time)) {
      alert('Escribe una hora válida, por ejemplo 09:30 o 14:00.');
      return;
    }
    if (!window.confirm(`¿Cambiar esta cita al ${date} a las ${time}?`)) return;
    button.disabled = true;
    try {
      const data = await apiFetch(`/owner/appointments/${encodeURIComponent(id)}/reschedule`, {
        method:'PATCH',
        body:JSON.stringify({appointment_date:date, appointment_time:time})
      });
      alert(data.message || 'Cita reprogramada.');
      window.location.reload();
    } catch (error) {
      alert(error.message || 'No se pudo reprogramar la cita.');
      button.disabled = false;
    }
  });
})();
