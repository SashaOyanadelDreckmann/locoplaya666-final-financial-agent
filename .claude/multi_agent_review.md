---
name: Multi-Agent Review System
description: Sistema de 3 agentes especializados para revisión de MVP financiero
type: project
---

# Sistema Multi-Agente - Revisión MVP Financial Agent

## 📋 Arquitectura (Optimizado por Tokens)

### Fase 1: Revisiones Paralelas (3 Agentes Especializados)

#### **Agente 1: Security & Architecture Reviewer**
- Enfoque: Arquitectura, seguridad, patrones de código
- Scope limitado:
  - Structure monorepo (folders, dependencies)
  - Auth/API patterns (endpoints críticos)
  - Data flow & storage
  - Critical security issues only
- Output: JSON estructurado (max 500 tokens)

#### **Agente 2: Frontend & UX Reviewer**
- Enfoque: Experiencia de usuario, funcionalidad browser
- Scope limitado:
  - Component structure & state management
  - User interactions críticas
  - Error handling & edge cases
  - Responsiveness (no pixel-perfect)
- Output: JSON estructurado (max 500 tokens)

#### **Agente 3: Testing & Quality Reviewer**
- Enfoque: Test coverage, quality assertions
- Scope limitado:
  - Test file presence & structure
  - Critical path coverage
  - Integration points
  - MVP readiness (no production standards)
- Output: JSON estructurado (max 500 tokens)

---

## 📊 Formato de Output Normalizado

Cada agente responde en este JSON para minimizar tokens:

```json
{
  "agent": "nombre",
  "score": "X/10",
  "critical": [
    {
      "id": "SEC-001",
      "title": "Issue Title",
      "impact": "high|medium|low",
      "MVP_concern": true/false,
      "fixable": true/false
    }
  ],
  "findings": {
    "positive": ["item1", "item2"],
    "gaps": ["item1", "item2"],
    "recommendations": ["item1"]
  },
  "thesis_relevance": "Impacto para tesis (brevemente)"
}
```

---

## 🤝 Fase 2: Sesión de Validación

Los 3 agentes **intercambian hallazgos** en sesión compartida (max 2 rondas):
1. **Ronda 1**: Cada agente presenta sus findings críticos (2 min por agente)
2. **Ronda 2**: Validación cruzada y consenso en prioritización

Reglas para minimizar tokens:
- Solo discutir issues CRÍTICAS
- No repetir información
- Validar impacto MVP vs tesis
- Consenso en top-5 problemas

---

## ✅ Fase 3: Reporte Final

Estructura simplificada:
- **Top Issues** (5 máximo, validados por 3 agentes)
- **MVP vs Production Gap** (análisis)
- **Thesis Angle** (qué contar en tesis)
- **Quick Wins** (fixes fáciles)

---

## 🎯 Optimizaciones de Tokens

1. **Scope Clarity**: Cada agente revisa solo su dominio
2. **JSON Output**: Menos prosa, más estructura
3. **Cached Context**: Monorepo structure se carga 1 vez
4. **Parallel Execution**: 3 agentes en paralelo (no secuencial)
5. **Minimal Rounding**: Solo 2 rondas de discusión

**Estimado Total**: 1500-2000 tokens (vs 5000+ método tradicional)

---

## 🚀 MVP Considerations

El sistema asume:
- ✅ Es para demostración de navegador (no producción)
- ✅ Target: Evaluadores de tesis (no usuarios finales)
- ✅ Prototipo funcional (no pulido)
- ⚠️ Seguridad básica sí (no puede ser inseguro)
- ⚠️ UX simple pero usable

---

## 📅 Próximos Pasos

1. [ ] Iniciar 3 agentes en paralelo
2. [ ] Compilar findings en 15 minutos
3. [ ] Sesión de validación (10 minutos)
4. [ ] Generar reporte final
