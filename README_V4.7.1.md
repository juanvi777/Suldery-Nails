## Suldery Nails v4.7.1

Corrección del despliegue: si Railway arranca sin `public/index.html` pero sí tiene `docs/index.html`, el servidor recupera automáticamente el frontend desde `docs/`. Así la raíz `/` no devuelve ENOENT.
