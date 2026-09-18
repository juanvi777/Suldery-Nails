# SULDERY NAILS v3.4

## Notificaciones gratuitas

Se reemplazaron los avisos de Suldery por SMS de Twilio por un bot de Telegram para las notificaciones de administración. Telegram publica su Bot API de forma gratuita.

Configura en Railway:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

Pasos:
1. Crear el bot en @BotFather con /newbot.
2. Desde la cuenta de Suldery abrir el bot y enviar /start.
3. En el panel de Suldery pulsar **Detectar chat** para obtener el chat ID.
4. Copiar ese ID a TELEGRAM_CHAT_ID en Railway.
5. Pulsar **Probar Telegram**.

## Fotos

- Máximo 8 fotos.
- Para nuevas fotos solo se puede elegir Inicio de sesión o Página de clienta; se eliminó la opción Ambos del selector.
- Cada foto se puede cambiar con **Cambiar foto** o quitar con **Eliminar**.
- Las fotos se guardan en MySQL.
- Las fotos antiguas con visibilidad `both` se conservan para no alterar datos sin que la dueña elija un destino; al editar la visibilidad se puede separar.
