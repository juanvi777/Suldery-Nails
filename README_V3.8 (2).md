# SULDERY NAILS v3.8

Corrección del inicio de sesión y caché de PWA.

- Redirección de login con `location.replace`.
- `requireRole` no rebota al login por un fallo temporal de red.
- Service Worker usa network-first para las páginas HTML para evitar HTML/JS viejo.
- Versionado v38 de los assets.
- Corregido el cierre del `span` del formulario de login.
