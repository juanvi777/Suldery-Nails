# SULDERY NAILS — Lanzamiento 2.1

## Agenda
- Lunes a sábado: 07:00–18:00.
- Domingo: cerrado.
- Almuerzo: 12:00–13:00; no se pueden crear citas que toquen ese intervalo.
- Los turnos se generan cada 30 minutos para respetar duraciones de 60, 90 y 120 minutos.
- Se bloquean cruces de citas y se usa un bloqueo por fecha para evitar que dos solicitudes tomen el mismo turno al mismo tiempo.

## Servicios
- Manicure semipermanente — 1 h 30 min
- Pedicure semipermanente — 1 hora
- Dipping — 2 horas
- Press on — 2 horas

## Panel de dueña
- Ya no se permite editar el horario semanal.
- Se muestran el horario fijo, el almuerzo y el domingo cerrado.
- La dueña puede bloquear fechas especiales.
- La dueña puede abrir "Agendar clienta" para registrar citas manuales; el sistema no muestra turnos ocupados.
- La dueña puede administrar el portafolio de fotos.

## SMS de nuevas solicitudes
La integración opcional usa Twilio desde el backend. Twilio envía el SMS mediante su API de Messages; el destinatario debe estar en formato E.164 y el remitente puede ser un número de Twilio o un Messaging Service. En cuentas de prueba, Twilio requiere verificar el número destinatario. Ver: https://www.twilio.com/docs/messaging/api/message-resource

Configura estas variables en Railway para activar los avisos:

- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_FROM
- OWNER_SMS_TO

El sistema no falla una reserva si el SMS no está configurado o si Twilio devuelve un error: la cita se guarda y el fallo del SMS se registra en los logs.

## Desarrollo local
```bash
npm install
npm start
```

## Producción
El backend está preparado para Railway. GitHub Pages puede seguir publicando la parte estática, pero las funciones de login, citas y MySQL deben usar el backend de Railway.


## v2.2 — agenda sin cruces
- Panel de dueña con cuatro botones independientes: horario, agendar clienta, bloquear días y fotos.
- Horario semanal con varios tramos por día.
- Excepciones por fecha para diligencias, salidas o jornadas especiales.
- Almuerzo fijo de 12:00 a 13:00, sin citas.
- La duración del servicio determina automáticamente los turnos válidos.
- La reserva de clienta pide primero el servicio, luego el día y después la hora, evitando ofrecer horas que no alcanzan para completar el servicio.
