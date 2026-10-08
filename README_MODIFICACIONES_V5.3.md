# Suldery Nails v5.3 — mejoras de experiencia y PWA

Esta versión refuerza la experiencia mobile-first y corrige varios puntos detectados en la versión 5.2.

## Cambios principales

- Menú de clienta tipo hamburguesa para reducir botones visibles.
- Catálogo, fotos enviadas, tutorial, reseñas, fotos exclusivas, avisos, tema y cierre de sesión pasan al menú.
- Tutorial de instalación visual dentro de la app, con guía Android/iPhone y enlace a PowerPoint.
- Tutorial legible en modo oscuro.
- Reseña general opcional sin cita; una cuenta solo puede publicar una reseña. Una cita relacionada, cuando se selecciona, debe estar confirmada y ya realizada.
- Fotos exclusivas de clientas cargadas desde Railway incluso cuando la interfaz se sirve desde GitHub Pages, corrigiendo URLs relativas de la API.
- Reserva reorganizada a: día → hora → servicio → confirmación, con validación de la hora al seleccionar servicio.
- Menú de dueña conserva la opción de agendar clientas manualmente; el backend ya soportaba esta función y no se duplicó la lógica.
- Refuerzo de PWA para iPhone con iconos Apple Touch de 120×120, 152×152, 167×167 y 180×180.
- Nuevo cache versionado del service worker para evitar conservar CSS/JS antiguos.
- PowerPoint visual independiente: `assets/Suldery-Nails-Tutorial-Instalacion-v5.3.pptx`.

## Importante

No se añadió una migración SQL porque las reglas de reseñas y citas manuales requeridas ya estaban soportadas por el backend de v5.2.

Antes de subir a producción, ejecutar las comprobaciones de sintaxis indicadas en el procedimiento local.
