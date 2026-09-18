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
