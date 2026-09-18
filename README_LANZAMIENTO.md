# SULDERY NAILS v3.5

Esta versión usa notificaciones web (Web Push) sin Telegram ni Twilio.

## Avisos
- La dueña debe entrar a su panel y pulsar “Activar avisos”.
- La clienta puede activarlos después de registrarse y también desde su panel.
- Los avisos se guardan por usuario/dispositivo en MySQL.
- Las claves VAPID se generan y guardan automáticamente en MySQL.

## Fotos
- Máximo 8 fotos.
- Una foto se publica en un solo lugar: inicio de sesión o página de clienta.
- En el panel cada foto aparece una por una y se puede cambiar o eliminar.
- Las fotos se guardan en MySQL para no depender del disco efímero de Railway.
