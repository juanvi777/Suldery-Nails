# Suldery Nails v3.3

## Cambios
- SMS a Suldery (por defecto +57 310 631 9093) al registrar cuenta pendiente y al solicitar una cita.
- SMS a la clienta al aprobar/rechazar la cuenta y al confirmar/rechazar/cancelar una cita.
- Recordatorio automático 24 h y 30 min antes para Suldery y la clienta cuando la clienta tiene teléfono.
- El bot revisa avisos cada minuto mientras el servicio de Railway está activo.
- Horas visibles como AM/PM en la interfaz y en los mensajes.
- Bloqueo de día completo o de tramos de horas concretos sin cerrar el resto del día.
- Calendario de dueña con cancelación de citas.
- Fotos persistentes en MySQL y separación por destino: inicio de sesión, página de clienta o ambos.
- Favicon y manifest reforzados para que el acceso instalado use el icono de Suldery Nails.

## SMS
Railway debe tener `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM` o `TWILIO_MESSAGING_SERVICE_SID`. `OWNER_SMS_TO` queda configurado por defecto en `+573106319093`; puedes dejarlo así o definirlo explícitamente en Railway. Twilio requiere un remitente válido y, en cuentas de prueba, un destinatario verificado.


## Resumen de lanzamiento
- La web completa usa el backend de Railway en `https://suldery-nails-production.up.railway.app/`.
- GitHub Pages puede servir el frontend, pero el login/citas usan el backend de Railway.
- Para SMS reales se necesitan credenciales de Twilio y `OWNER_SMS_TO=+573106319093` (el código usa ese número por defecto).
- Las fotos se guardan en MySQL para sobrevivir a nuevos despliegues.
