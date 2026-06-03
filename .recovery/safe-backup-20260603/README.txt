Safe recovery backup — 2026-06-03
================================

Created before restore/pro-jun3-safe CSS recovery.

Files:
- agent.css   — working copy before restore (893 KB)
- modals.tsx  — kept as-is (175 KB, best known pro version)
- page.tsx    — snapshot at recovery start

Restored from Claude file-history (session 86fdedca):
- agent.css base: a3ab32ed2a97e8b0@v3 (01:39 AM, ~1.04 MB)
- modals.tsx: NOT replaced (current matches v2 and is larger than v3)

To rollback CSS only:
  cp .recovery/safe-backup-20260603/agent.css apps/web/app/agent.css
