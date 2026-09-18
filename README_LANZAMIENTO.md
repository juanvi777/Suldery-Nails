# SULDERY NAILS v2.5

Correcciones y mejoras incluidas:

- Corrige la carga de horarios de citas: se implementan las consultas que faltaban para días bloqueados y citas existentes.
- El horario usa America/Bogota para evitar desajustes de fecha/hora entre Railway y Colombia.
- La disponibilidad se calcula por duración completa del servicio y respeta el almuerzo fijo de 12:00 a 13:00.
- Servicios: manicure semipermanente 90 min, pedicure semipermanente 60 min, dipping 120 min, press on 120 min.
- El panel de dueña muestra estadísticas reales de clientas activas (accepted), citas activas futuras (pending/accepted) y portafolio.
- Las tres estadísticas son clicables y abren sus listados correspondientes.
- Portafolio abre directamente la herramienta de fotos.
- Se conserva la administración por botones: horario, agendar clienta, bloquear días y subir fotos.
- Se conserva el soporte para varios tramos de horario y excepciones por fecha.
- Se sincroniza `public/` con `docs/` para GitHub Pages.


## v2.6: teléfono y SMS
- El registro pide teléfono obligatorio y lo guarda en `users.phone`.
- Las citas guardan `client_phone`; la dueña puede verlo.
- Se envía un SMS a la dueña al recibir una nueva cuenta pendiente y al recibir una solicitud de cita, cuando las variables de Twilio están configuradas.


## v2.8 - mensajes más cálidos
- El teléfono es obligatorio al crear una cuenta.
- El teléfono queda guardado en users.phone y en appointments.client_phone.
- La dueña recibe SMS al entrar una cuenta pendiente y al solicitarse una cita, incluyendo nombre, correo/teléfono, servicio, fecha y hora.
- Los mensajes mostrados a la clienta confirman que la solicitud quedó pendiente y muestran el teléfono registrado para contacto.
- Configura en Railway: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM y OWNER_SMS_TO.

- Los avisos que ve la clienta después de registrarse o pedir una cita ahora usan un tono más cercano y muestran el contacto de Suldery (310 631 9093).
- Los SMS para Suldery también tienen un texto más natural y directo.
