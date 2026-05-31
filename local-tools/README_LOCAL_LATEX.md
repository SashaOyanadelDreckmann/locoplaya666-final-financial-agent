# LaTeX Studio (local, privado)

Esto no se despliega en Railway. Solo sirve para tu manuscrito en `local-tools/tesis`.

## Requisito
Tener `latexmk` o `pdflatex` disponible en tu sistema (PATH).

## Usar
Compilar una vez:
```bash
python3 /Users/locoplaya666/final-financial-agent/local-tools/latex_studio.py --once --open
```

Modo “watch” (recompila al guardar):
```bash
python3 /Users/locoplaya666/final-financial-agent/local-tools/latex_studio.py --open
```

## Output
- TEX: `/Users/locoplaya666/final-financial-agent/local-tools/tesis/main.tex`
- PDF: `/Users/locoplaya666/final-financial-agent/local-tools/tesis/_build/main.pdf`

