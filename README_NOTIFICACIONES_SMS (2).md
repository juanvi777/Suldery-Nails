# SULDERY NAILS v3.4 — bot gratuito de Telegram

El sistema usa Telegram para avisar a Suldery sin Twilio. La Bot API de Telegram está disponible gratuitamente para bots; el servidor envía mensajes mediante HTTPS.

## Qué debes hacer una sola vez

1. En Telegram abre **@BotFather** y crea un bot con `/newbot`.
2. Copia el **token** que te entregue BotFather.
3. Abre el bot que acabas de crear desde la cuenta de Suldery y pulsa **Start** o envíale `/start`.
4. En Railway agrega:
   - `TELEGRAM_BOT_TOKEN` = token de BotFather.
   - `TELEGRAM_CHAT_ID` = identificador del chat de Suldery.
5. En el panel de Suldery pulsa **Probar Telegram**.

La aplicación no necesita Twilio para avisar a Suldery. Los SMS a números de teléfono siguen siendo un servicio distinto y no se pueden garantizar de forma gratuita solo desde el navegador.

## Avisos al chat de Suldery

- Nueva cuenta pendiente.
- Nueva solicitud de cita.
- Cancelación de una cita.
- Resumen de cuentas/citas pendientes.
- Recordatorio de cita aproximadamente 24 horas antes.
- Recordatorio de cita aproximadamente 30 minutos antes.

No se registra una notificación como enviada hasta que Telegram confirma el envío.

## Fotos

- Máximo 8 fotos.
- Cada foto nueva se puede asignar a **Inicio de sesión** o **Página de clienta**.
- Se eliminó la opción **Ambos** para nuevas fotos.
- Las fotos antiguas que todavía tengan `both` muestran un aviso para elegir dónde dejarlas.
- Cada foto tiene **Cambiar foto** y **Eliminar**.
- Las imágenes se guardan en MySQL, para que sobrevivan a redeploys de Railway.
