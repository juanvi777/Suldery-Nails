# Suldery Nails v4.7

Cambios principales:
- Corrección robusta de formato de hora en agenda para evitar `formatTime12 is not defined`.
- Confirmación de cita mostrada como enviada y pendiente cuando el servidor ya la guardó.
- Nueva tarjeta/botón "Recuperar acceso" con contador de solicitudes pendientes.
- Panel de recuperación con nombre, correo y teléfono de la clienta.
- Restablecimiento seguro de contraseña desde el panel: la contraseña anterior nunca se muestra ni se almacena en texto plano.
- Al restablecer la contraseña, la solicitud se marca como atendida y se notifica a la clienta mediante Web Push si tiene avisos activos.
- El contador de "Citas agendadas" cuenta todas las citas confirmadas actualmente.
- Cache-busting v47 en public y docs.
