# Suldery Nails v5.2 — Modificaciones

Esta versión incorpora las mejoras de experiencia solicitadas: menú de dueña, galerías cuadradas con eliminación individual, catálogo en cuadrícula con optimización de imágenes, reseña única por cuenta con foto, envío de fotos de clientas a Suldery, tutorial Android/iPhone, bienvenida diaria y reserva de citas por pasos.

## Importante
- El archivo `.env` NO se incluye en el paquete por seguridad. Conserva el `.env` que ya usas localmente.
- Si la base de datos ya existe, `server.js` intenta aplicar las columnas/tablas nuevas automáticamente al arrancar. También se incluye `migration_5.2.sql` para migración manual.
- La app mantiene la arquitectura actual Express + MySQL y el almacenamiento de imágenes en MySQL.
- Se actualizó la versión del caché PWA a v52 para ayudar a que los clientes reciban los cambios.
