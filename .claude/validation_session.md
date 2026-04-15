# 🤝 Sesión de Validación Multi-Agente

## Flujo de Ejecución

### FASE 1: Ejecución Paralela de Agentes (15 min)

```
[PARALELO] Agent 1: Security & Architecture
   └─ Revisar: estructura, auth, seguridad crítica
   └─ Output: JSON (500 tokens max)

[PARALELO] Agent 2: Frontend & UX
   └─ Revisar: componentes, flujos de usuario, usabilidad
   └─ Output: JSON (500 tokens max)

[PARALELO] Agent 3: Testing & Quality
   └─ Revisar: cobertura, tests, integraciones
   └─ Output: JSON (500 tokens max)
```

---

### FASE 2: Sesión de Discusión (10 min)

**Ronda 1 - Presentación de Findings Críticos** (3 min)

```
Agent 1 (1 min):
"Los problemas críticos que encontré son:
- [SEC-001]: Auth issue - impact: HIGH
- [SEC-002]: Data storage issue - impact: CRITICAL
(solo máximo 2-3 items)"

Agent 2 (1 min):
"En frontend identifiqué:
- [UX-001]: Critical form validation gap
- [UX-002]: Missing error feedback
(validación de si Agent 1's auth affects frontend)"

Agent 3 (1 min):
"Para testing:
- [TEST-001]: Core auth path not tested
- [TEST-002]: Integration points unclear
(confirmar si los issues de Agent 1 son testables)"
```

**Ronda 2 - Validación Cruzada** (5 min)

```
Questions a resolver:

1. ¿Hay conflicto o consenso en criticidad?
   Ej: "Agent 1 dice AUTH es CRITICAL, ¿Agent 2/3 confirman impacto?"

2. ¿Cuál es el TOP-5 de problemas?
   - Agentes votan por criticidad
   - Consenso en qué debe ir al reporte

3. ¿Qué es MVP-blocker vs nice-to-fix?
   - Auth broken = MVP blocker
   - Styling = nice-to-fix

4. ¿Qué impacta la tesis?
   - "Esto demuestra que..."
   - "Es interesante documentar porque..."
```

---

## 📋 Template de Consenso

```json
{
  "validation_session": {
    "timestamp": "2026-04-14",
    "agents_participated": ["Security", "Frontend", "Testing"],
    
    "top_5_issues": [
      {
        "rank": 1,
        "issue_id": "SEC-001",
        "agent_identified": "Security",
        "validated_by": ["Frontend", "Testing"],
        "criticality": "CRITICAL",
        "mvp_blocking": true,
        "consensus": "100%"
      },
      // ... items 2-5
    ],
    
    "mvp_assessment": {
      "is_demo_ready": true/false,
      "blockers": ["...", "..."],
      "quick_wins": ["...", "..."]
    },
    
    "thesis_opportunities": [
      "Oportunidad 1: arquitectura multi-agente",
      "Oportunidad 2: security gaps en MVP",
      "Oportunidad 3: test-driven development approach"
    ]
  }
}
```

---

## ✅ Fase 3: Reporte Final

Basado en consenso, generar reporte simple:

```markdown
# 📊 Reporte Final - Financial Agent MVP Review

## 🔴 Critical Issues (Top 5)

1. **[SEC-001]** ...
   - Impacto: Bloquea MVP
   - Solución rápida: ...

## 🟡 High Issues

1. **[UX-001]** ...

## ✅ MVP Readiness

- Status: Ready / Needs fixes
- Blockers: [lista]
- Estimated fix time: ...

## 📚 Thesis Angle

Para documentar en tesis:
- Hallazgo 1: ...
- Hallazgo 2: ...
```

---

## 🎯 Reglas para Minimizar Tokens

1. **No repetir información**: Si Agent 2 valida lo de Agent 1, no lo repite
2. **Solo issues CRÍTICAS en discusión**: Nice-to-fix va directo al reporte
3. **Consenso rápido**: Si 2 de 3 agentes están de acuerdo, es consenso
4. **Una vuelta de preguntas**: No más de 2 rondas de intercambio
5. **Output estructurado**: JSON > prosa

---

## 🚀 Cómo Ejecutar

### Opción A: Manual (si ejecutas agentes uno a uno)
```bash
# 1. Ejecutar Agent 1, copiar output JSON
# 2. Ejecutar Agent 2, copiar output JSON
# 3. Ejecutar Agent 3, copiar output JSON
# 4. Lanzar sesión de discusión con los 3 JSONs como context
```

### Opción B: Automated (usando Claude Code team skill)
```
Usar /team para coordinar 3 agentes en paralelo
Cada agente escribe su output a archivo .json
Main session lee los 3 archivos y orquesta validación
```

