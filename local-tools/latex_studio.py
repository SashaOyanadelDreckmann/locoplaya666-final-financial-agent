#!/usr/bin/env python3
"""
LaTeX Studio (local, privado, sin servidor)

- Editas `main.tex` desde tu editor/terminal.
- Este script recompila a PDF al detectar cambios.
- El PDF queda en `local-tools/tesis/_build/main.pdf` para previsualizar/compartir.

Requisito: tener `latexmk` (ideal) o `pdflatex` en tu PATH.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
TESIS_DIR = REPO_ROOT / "local-tools" / "tesis"
MAIN_TEX = TESIS_DIR / "main.tex"
BUILD_DIR = TESIS_DIR / "_build"
OUT_PDF = BUILD_DIR / "main.pdf"


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


def _run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        text=True,
        capture_output=True,
    )


def _compile(tex: Path, build_dir: Path) -> tuple[bool, str]:
    build_dir.mkdir(parents=True, exist_ok=True)

    latexmk = _which("latexmk")
    if latexmk:
        p = _run(
            [
                latexmk,
                "-pdf",
                "-interaction=nonstopmode",
                "-halt-on-error",
                f"-outdir={str(build_dir)}",
                str(tex),
            ],
            cwd=tex.parent,
        )
        ok = p.returncode == 0
        return ok, (p.stdout + "\n" + p.stderr).strip()

    pdflatex = _which("pdflatex")
    if pdflatex:
        logs: list[str] = []
        for _ in range(2):
            p = _run(
                [
                    pdflatex,
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-output-directory",
                    str(build_dir),
                    str(tex),
                ],
                cwd=tex.parent,
            )
            logs.append((p.stdout + "\n" + p.stderr).strip())
            if p.returncode != 0:
                return False, "\n\n".join(logs).strip()
        return True, "\n\n".join(logs).strip()

    return (
        False,
        "No encuentro `latexmk` ni `pdflatex` en PATH. Instala BasicTeX/MacTeX.",
    )


def _open_file(path: Path) -> None:
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    elif os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", str(path)])


def _tail(s: str, max_chars: int = 2400) -> str:
    if len(s) <= max_chars:
        return s
    return s[-max_chars:]


def watch(tex: Path, build_dir: Path, open_pdf: bool, poll_ms: int) -> int:
    if not tex.exists():
        print(f"ERROR: no existe {tex}", file=sys.stderr)
        return 2

    last_mtime_ns = 0
    opened = False

    print(f"Watching: {tex}")
    print(f"Output:   {OUT_PDF}")
    print("Tip: guarda el archivo y recompila solo.")

    while True:
        try:
            mtime_ns = tex.stat().st_mtime_ns
        except FileNotFoundError:
            time.sleep(poll_ms / 1000.0)
            continue

        if mtime_ns != last_mtime_ns:
            last_mtime_ns = mtime_ns
            ok, log = _compile(tex, build_dir)
            if ok:
                print("OK: compilado")
                if open_pdf and OUT_PDF.exists() and not opened:
                    _open_file(OUT_PDF)
                    opened = True
            else:
                print("ERROR: compilacion fallo")
                print(_tail(log))

        time.sleep(poll_ms / 1000.0)


def compile_once(tex: Path, build_dir: Path, open_pdf: bool) -> int:
    ok, log = _compile(tex, build_dir)
    if ok:
        print(f"OK: {OUT_PDF}")
        if open_pdf and OUT_PDF.exists():
            _open_file(OUT_PDF)
        return 0
    print("ERROR: compilacion fallo")
    print(_tail(log))
    return 1


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--tex", default=str(MAIN_TEX), help="Ruta a main.tex")
    ap.add_argument("--build-dir", default=str(BUILD_DIR), help="Carpeta build")
    ap.add_argument("--once", action="store_true", help="Compila una vez y sale")
    ap.add_argument("--open", action="store_true", help="Abre el PDF tras compilar")
    ap.add_argument("--poll-ms", type=int, default=400, help="Polling (ms)")
    args = ap.parse_args()

    tex = Path(args.tex).expanduser().resolve()
    build_dir = Path(args.build_dir).expanduser().resolve()

    if args.once:
        return compile_once(tex, build_dir, args.open)
    return watch(tex, build_dir, args.open, args.poll_ms)


if __name__ == "__main__":
    raise SystemExit(main())

