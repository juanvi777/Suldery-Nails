# SULDERY NAILS v3.1

- El texto de presentación tiene mejor contraste y un tono más cálido en modo oscuro.
- Los avisos SMS ahora muestran su estado en el panel de Suldery y tienen botón de prueba.
- Las notificaciones no se marcan como enviadas si Twilio está sin configurar o falla.
- Se admite TWILIO_FROM o TWILIO_MESSAGING_SERVICE_SID.
- El número de Suldery se normaliza como +57 3106319093 si se deja sin prefijo.
- Las fotos nuevas del portafolio se guardan directamente en MySQL, por lo que sobreviven a redeploys de Railway.
- Las fotos antiguas guardadas solo como archivos del contenedor deberán volver a subirse si el archivo original ya no existe.

## Variables para SMS

Configura en Railway:

- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- OWNER_SMS_TO=+573106319093
- TWILIO_FROM (si usas un número de Twilio)
- o TWILIO_MESSAGING_SERVICE_SID (si usas un Messaging Service)

Después de desplegar, entra al panel de Suldery y pulsa **Probar SMS**.
