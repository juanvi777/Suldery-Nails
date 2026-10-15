# SULDERY NAILS v3.0 — fechas y móvil

Cambios principales:
- MySQL devuelve columnas DATE como `YYYY-MM-DD` para evitar `Invalid Date` en el panel y en los listados.
- Formateo robusto de fechas en frontend y backend para registros provenientes de MySQL.
- Recordatorios y SMS de citas usan la fecha correcta aunque MySQL entregue un objeto Date.
- Ajustes responsive para teléfonos pequeños: encabezado, tarjetas, calendario, horas, formularios y panel de administración.
- No cambia la lógica de horarios/almuerzo ni la conexión con Railway/MySQL.

## Instalar

Sobrescribe la versión actual en:
`C:\proyectos\Suldery nails`

No borres `.git`.

Después:

```powershell
cd "C:\proyectos\Suldery nails"
git add -A
git commit -m "Suldery Nails v3.0 - fechas y diseño móvil"
git push origin main
railway up
```
