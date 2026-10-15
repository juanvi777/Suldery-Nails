SULDERY NAILS — CORRECCIÓN DE GALERÍAS (v56)

Cambios incluidos:
- Después de guardar o eliminar fotos en inicio/clientas, la lista se vuelve a cargar desde la API/BD.
- Después de subir o eliminar fotos en el catálogo, la cuadrícula se vuelve a cargar desde la API/BD.
- Las listas de imágenes dinámicas no se sirven desde caché HTTP.
- Las URLs de imágenes contienen una versión basada en el hash del archivo para que una foto reemplazada no se quede mostrando una copia antigua.
- Se estabiliza el orden de fotos cuando varias filas tenían el mismo display_order.
- Se actualizan las referencias de JavaScript y la caché del service worker para recibir el código nuevo.
- Se conserva la corrección previa de conversión/optimización de imágenes.
- Se conserva el botón Instalar app y las instrucciones alternativas de instalación PWA.

IMPORTANTE:
- Este paquete no incluye .env ni node_modules. Conserva tu .env local; no lo subas a GitHub.
- No se borran registros existentes de MySQL. Esta corrección sincroniza la interfaz, el orden de lectura y la caché; los duplicados históricos reales en la base de datos deben revisarse aparte antes de borrar nada.
- Descomprime este paquete sobre una copia de tu proyecto actual, o usa los archivos que reemplaza. Revisa git diff antes de publicar.
- Verifica con una foto de prueba en cada sección (inicio, clientas, catálogo): guardar, cambiar, eliminar y recargar; confirma que no quedan imágenes antiguas.
