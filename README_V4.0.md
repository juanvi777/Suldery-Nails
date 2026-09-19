# SULDERY NAILS v4.0

## Catálogo independiente
- El perfil de clienta tiene un botón Catálogo.
- El catálogo usa una tabla MySQL independiente (`catalog_photos`) y no consume las 8 fotos de inicio/clienta.
- La dueña administra el catálogo desde un botón propio del panel.
- No hay límite de cantidad de fotos del catálogo; cada archivo individual conserva el límite de tamaño existente del servidor.
- La vista del catálogo muestra una imagen a la vez con anterior/siguiente, contador y título.
- La dueña puede agregar, cambiar, eliminar y reordenar las fotos del catálogo.
- Las fotos se almacenan como BLOB en MySQL para que sobrevivan a los redeploys de Railway.

## Fotos principales
- Subir fotos separa claramente `Inicio de sesión` y `Página de clienta`.
- Se mantienen como el conjunto limitado de 8 fotos principales.
