# Recovery snapshots — 3 jun 2026

Backups locales creados tras la pérdida de trabajo no commiteado entre ~01:40 y ~02:28.

## Punto de restauración definitivo (git)

- **Rama:** `main` @ `cb87cdb`
- **Tag:** `checkpoint/jun3-pro-ui`
- **Contenido:** `agent.css` pro (~1 MB) + `modals.tsx` completo desde Claude file-history 01:39

## Contenido de esta carpeta

| Path | Descripción |
|------|-------------|
| `safe-backup-20260603/` | Copia previa a la restauración CSS |
| `worktree-20260603.patch` | Diff completo capturado ~02:28 |
| `hmr-0120-0228/` | Snapshots HMR (modals con timestamp) |
| `status-20260603.txt` | `git status` del incidente |

## No usar para restore ciego

Los `agent.css` en carpetas `hmr-*` de 70 bytes son stubs HMR, no CSS real.

Copias reales de Claude: `~/.claude/file-history/86fdedca-117c-4098-9c92-677c76ea1629/`
