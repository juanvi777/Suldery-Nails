# EMPRE.IA — One Run

Este paquete prepara una ejecución única para Codex.

Incluye:
- `EMPREIA-MASTER-PROMPT.txt`: especificación completa.
- `EMPREIA-ONE-RUN.ps1`: ejecuta Codex, verifica `pnpm check`, `pnpm build`, revisa secretos, crea commit y hace push sin `--force`.

Uso:

1. Copia estos archivos a `C:\proyectos\EMPRE.IA`.
2. Cuando tengas cuota de Codex disponible, abre PowerShell en esa carpeta.
3. Ejecuta:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\EMPREIA-ONE-RUN.ps1
```

El script usa la sintaxis compatible con Codex CLI 0.154.0 (`--sandbox workspace-write --approve-for-me`), no inventa un remoto `origin`, no hace force-push y se detiene si encuentra posibles secretos o si las verificaciones fallan. El `git push` final lo ejecuta PowerShell después de que Codex termine.

## Corrección para Windows PowerShell 5.1

El prompt se entrega a `codex exec` por STDIN (`-`) para evitar errores de argumentos causados por prompts largos con espacios, comas o saltos de línea. La imagen `design-reference.png` se adjunta automáticamente cuando está presente.

## Corrección adicional de Windows PowerShell

La ejecución usa explícitamente `codex.cmd` en lugar de `codex`, porque PowerShell 5.1 puede seleccionar `codex.ps1` y provocar que un prompt largo se fragmente como argumentos. El prompt sigue entrando por STDIN.
