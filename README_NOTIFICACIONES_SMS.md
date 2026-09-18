# SULDERY NAILS v2.9 — avisos para Suldery

- SMS inmediato cuando una clienta crea una cuenta pendiente.
- SMS inmediato cuando una clienta solicita una cita, incluyendo su teléfono de contacto.
- Resumen automático, como máximo una vez por hora, mientras existan cuentas o citas pendientes.
- Recordatorio de citas confirmadas aproximadamente 24 horas antes y 1 hora antes, una sola vez por cita.
- Los mensajes de confirmación para la clienta ya no muestran su propio número; el teléfono queda disponible en el panel de Suldery y en los avisos que recibe ella.

Configura en Railway: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM y OWNER_SMS_TO. El número 3106319093 se usa como valor de respaldo para OWNER_SMS_TO y se normaliza a +57 si se escribe sin prefijo. En cuentas de prueba de Twilio, el destinatario debe estar verificado.
