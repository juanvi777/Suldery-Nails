SULDERY NAILS — REDISEÑO VISUAL WOW + LAHIA IA
================================================

Esta actualización es más amplia que el cambio de nombre de IA. Aplica una capa visual premium al proyecto existente.

INCLUYE
- Paleta marfil, rosa empolvado y oro rosado.
- Marcos finos oro rosado para fotos de galería y catálogo.
- Fotos en tarjetas con `object-fit: cover`, sin fondo blanco añadido ni deformación.
- Transiciones de entrada/salida al desplazarse por la página, con respeto a la preferencia de movimiento reducido.
- Pequeñas mejoras de elevación, sombras, bordes y foco accesible.
- Cambia el nombre visible de la IA del panel de dueña a Lahia IA y añade una etiqueta del motor EMPRE.IA con estado “Conexión pendiente”.
- No elimina las herramientas actuales de diseños, técnicas, catálogo ni cuidados.
- No modifica citas, cuentas, horarios, autenticación ni base de datos.

INSTALAR
1. Descomprime el ZIP.
2. Copia `scripts` y `public` dentro de la carpeta raíz del proyecto Suldery Nails, donde están `server.js` y `package.json`. Si Windows pregunta, combina las carpetas; no reemplaces manualmente todos los archivos.
3. Abre PowerShell en la carpeta raíz.
4. Ejecuta:
   powershell -ExecutionPolicy Bypass -File .\scripts\Aplicar-WOW-LahiaIA.ps1
5. Reinicia el servidor si lo ejecutas localmente. En Railway, sube los archivos modificados y espera el despliegue.
6. Recarga la página con Ctrl+F5.

SEGURIDAD / ALCANCE
- El script crea una carpeta de copia de seguridad antes de cambiar archivos.
- El backend de subida de imágenes no se altera en este paquete. El selector visual y el ajuste de fotos mejoran, pero los formatos aceptados siguen sujetos a la validación del servidor actual; HEIC/HEIF universal requiere conversión de backend y se debe implementar aparte.
- EMPRE.IA no se conecta todavía porque el servicio sigue local en el PC. La interfaz no simula una conexión real.
- Se actualiza `public/`, que es la carpeta servida por el backend. Si tu despliegue usa una copia distinta, comprueba qué carpeta está publicada.
