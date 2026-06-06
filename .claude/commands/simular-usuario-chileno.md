# Simular Usuario Chileno — financieramente.up.railway.app

Cuando se invoque este comando, debes crear un usuario chileno ficticio completamente verosímil,
generarle antecedentes financieros sintéticos en los formatos exactos de sus instituciones, registrar
una cuenta en la app de producción y esperar aprobación.

Argumento opcional `$ARGUMENTS`: si se pasa un perfil sugerido (ej. "joven", "profesional", "clase media",
"ejecutivo", "pensionado"), úsalo como orientación. Si está vacío, elige aleatoriamente.

---

## FASE 1 — Generar persona

### Reglas de generación

**Nombre y datos personales:**
- Nombre y apellidos completamente chilenos y creíbles. Mezcla frecuente de apellidos españoles
  (González, Muñoz, Rojas, Díaz, Pérez, Soto, Contreras, Silva, Martínez, Morales, Pizarro, Vega,
  Navarro, Espinoza, Figueroa, Torres) con ocasional apellido vasco (Iturra, Aguirre, Larraín,
  Undurraga, Errázuriz) o alemán del sur (Müller, Hoffmann, Schäfer, Kerber), pero no siempre.
- Edad entre 21 y 65 años.
- Ciudad: Santiago (con comuna específica: Maipú, La Florida, Pudahuel, Quilicura, Ñuñoa,
  Providencia, Las Condes, Recoleta, San Miguel, Cerrillos, Lo Barnechea) o región (Concepción,
  Temuco, Valparaíso, Viña del Mar, Antofagasta, Iquique, La Serena, Rancagua, Talca, Puerto Montt).

**Trabajo / situación laboral:**
Elige uno que sea muy frecuente en Chile:
- Trabajador(a) de supermercado (Jumbo, Lider, Unimarc, Tottus)
- Auxiliar de enfermería o técnico en enfermería
- Profesor(a) básica o media (municipal o particular)
- Funcionario(a) de municipio o institución pública (FONASA, SII, Registro Civil)
- Conductor(a) de Uber o Cabify (puede ser la actividad principal o complementaria)
- Ingeniero(a) civil, comercial o en informática en empresa mediana
- Técnico electricista o mecánico automotriz (Taller propio o empleado)
- Vendedor(a) en retail (Falabella, Ripley, Paris)
- Dueña(o) de un emprendimiento pequeño (pastelería, peluquería, minimarket, ferretería)
- Asistente administrativo(a) en empresa o clínica
- Diseñador(a) o community manager freelance
- Repartidor(a) de PedidosYa o Rappi (gig economy)
- Cajero(a) de banco
- Chef o cocinero(a) en restaurante o casino

**Ingresos mensuales aproximados:**
Deben ser coherentes con el trabajo. Ejemplos orientativos (en CLP):
- Trabajador supermercado / auxiliar enfermería: 480.000–600.000
- Profesor(a) municipal: 650.000–900.000
- Técnico / vendedor retail: 550.000–750.000
- Conductor Uber (tiempo completo): 700.000–1.100.000
- Ingeniero en empresa mediana: 1.500.000–2.800.000
- Emprendedor pequeño negocio: muy variable, 400.000–1.200.000
- Diseñador freelance: 600.000–1.400.000

**Nivel de conocimiento financiero:**
- Bajo (no sabe qué es CAE, interés compuesto, ni APV): trabajos de menor ingreso típicamente
- Medio (conoce interés, tarjeta de crédito, quizás AFP): la mayoría
- Alto (conoce fondos mutuos, APV, UF, inversiones): ingenieros, ejecutivos, diseñadores con experiencia

**Estrés financiero:**
- Alto (1–3 en escala 1–10): si el ingreso cubre justo o no alcanza
- Medio (4–6): si hay algo de margen pero deudas moderadas
- Bajo (7–10): si hay superávit claro

---

## FASE 2 — Asignar productos financieros (2 o 3)

Cada usuario debe tener entre **2 y 3 productos financieros**. Asígnalos de forma coherente con su perfil.

### Pool de productos disponibles (institución → producto → formato de cartola)

#### Cuenta RUT BancoEstado (cuenta vista)
Perfil típico: cualquier chileno, muy frecuente en ingresos bajos-medios.
CSV headers: `Fecha;Descripción;Cargo (CLP);Abono (CLP);Saldo (CLP)`
Fecha formato: `DD/MM/YYYY`
Delimitador: `;`

#### Cuenta Corriente BCI
Perfil típico: profesional, ingreso medio-alto.
CSV headers: `Fecha Contable;Descripción;Débito;Crédito;Saldo`
Fecha formato: `YYYY-MM-DD`
Delimitador: `;`

#### Cuenta Corriente Banco Santander
Perfil típico: profesional o ejecutivo.
CSV headers: `Fecha;Concepto;Cargo;Abono;Saldo`
Fecha formato: `DD-MM-YYYY`
Delimitador: `;`

#### Cuenta Corriente Banco de Chile
Perfil típico: profesional o empleado en empresa grande.
CSV headers: `Fecha;Descripción del movimiento;Cargos;Abonos;Saldo`
Fecha formato: `DD/MM/YYYY`
Delimitador: `;`

#### CMR Falabella (tarjeta de crédito retail)
Perfil típico: trabajador medio que compra en Falabella/Tottus.
CSV headers: `Fecha;Descripción;N° Cuota;Monto cuota;Monto total`
Fecha formato: `DD/MM/YYYY`
Delimitador: `;`
Nota: Los montos son siempre cargo (gasto), no hay abonos separados.

#### Tarjeta de Crédito BCI
Perfil típico: profesional con tarjeta bancaria.
CSV headers: `Fecha;Descripción;Cuotas;Monto`
Fecha formato: `YYYY-MM-DD`
Delimitador: `;`

#### Mach / Tenpo (billetera digital)
Perfil típico: joven 20–35 años, gig economy, freelance.
CSV headers: `Fecha;Descripción;Monto;Tipo;Saldo`
Fecha formato: `DD/MM/YYYY HH:MM`
Delimitador: `;`
Tipo: `Cargo` o `Abono`

#### Fintual — Fondo mutuo
Perfil típico: profesional 25–45 años con algo de ahorro e interés en inversiones.
Fondo típico: "Prudente Rosario" (conservador), "Risky Norris" (agresivo), "Moderate Pitt" (moderado).
CSV headers: `Fecha;Evento;Fondo;Aporte (CLP);Rescate (CLP);Valor cuota (CLP);Unidades;Saldo (CLP)`
Fecha formato: `YYYY-MM-DD`
Delimitador: `;`

#### Coopeuch — Cuenta de ahorro
Perfil típico: trabajador con cultura del ahorro, cualquier nivel.
CSV headers: `Fecha;Descripción;Depósito;Retiro;Saldo`
Fecha formato: `DD-MM-YYYY`
Delimitador: `;`

#### [RARO — ~1 de 10 simulaciones] Broker extranjero (Interactive Brokers / Charles Schwab)
Solo asígnalo si el perfil tiene conocimiento financiero alto y es muy improbable (tíralo como moneda
con ~10% de chance). Reemplaza uno de los productos locales.
CSV headers: `Date,Description,Amount (USD),Type,Balance (USD)`
Fecha formato: `YYYY-MM-DD`
Delimitador: `,` (inglés)
Incluye transacciones en USD: dividend, purchase stock, deposit wire transfer.
Nota especial al reportar: menciona que esto es inusual y será interesante ver cómo la app lo maneja.

---

## FASE 3 — Generar cartolas sintéticas

Para cada producto, genera **entre 25 y 40 movimientos** abarcando los últimos **2–3 meses** de forma realista.

### Reglas de realismo chileno

**Día de pago:**
- Empleados: sueldo entra el último día hábil del mes o el 1° del mes siguiente.
- Independientes / gig: ingresos irregulares a lo largo del mes.

**Gastos frecuentes según perfil:**

*Trabajador/a medio:*
- Supermercado: Lider, Unimarc o Ekono 2–3 veces al mes ($18.000–$55.000)
- Farmacia: Cruz Verde o Salcobrand 1–2 veces ($3.500–$22.000)
- TAG autopista ($2.500–$8.000 cada vez)
- Transferencias a familiar
- Pago de servicios básicos: agua, luz, gas (una vez al mes)
- Cuenta del teléfono: Entel, WOM, Movistar o Claro (~$15.000)
- Eventual retiro cajero

*Profesional / ingeniero:*
- Supermercado: Jumbo o Santa Isabel ($35.000–$90.000)
- Uber o cabify ocasional ($5.000–$18.000)
- Restaurante o café 1–2 veces por semana ($8.000–$25.000)
- Netflix, Spotify, Disney+ ($5.000–$15.000 c/u)
- LATAM o Sky 1–2 veces al trimestre (viaje trabajo o vacaciones $60.000–$180.000)
- Pago dividendo hipotecario (~$350.000–$700.000)
- APV aporte mensual (si aplica)

*Joven / gig economy:*
- PedidosYa o Rappi frecuente ($8.000–$20.000)
- Supermercado pequeño Ekono ($12.000–$30.000)
- Mach/Tenpo transferencias frecuentes a amigos
- ENTEL o WOM pago mensual
- Retiro cajero ocasional
- Compra en Mercado Libre ($15.000–$80.000)

**Formatos de descripción realistas por banco:**
- BancoEstado: `COMPRA POS JUMBO MAIPÚ`, `TRANSFERENCIA ENVIADA A RODRIGUEZ MARIA`, `PAGO CUENTA MOVISTAR`, `SUELDO EMPRESA CONSTRUCCIONES VEGA`, `RETIRO CAJERO BEE MAIPÚ`
- BCI: `PAGO AUTOMÁTICO ENTEL CHILE`, `TRF ENVIADA HERNÁNDEZ PABLO`, `COMPRA SODIMAC PROVIDENCIA`, `SUELDO NOVIEMBRE EMPRESA XYZ`, `AVANCE EFECTIVO`
- Santander: `REMUNERACIÓN NOVIEMBRE`, `PAGO ISAPRE BANMÉDICA`, `COMPRA TARJETA CONTACTLESS UNIMARC`, `DÉBITO AUTOMÁTICO GAS METROGAS`
- Falabella CMR: `TOTTUS MAIPÚ`, `SODIMAC HOMECENTER`, `FALABELLA.COM`, `NETFLIX`, `RAPPI CL`
- Mach: `Pago a Javiera González`, `Pago PedidosYa`, `Recarga Mach desde BancoEstado`, `Retiro Cajero BCI`
- Fintual: `Suscripción Prudente Rosario`, `Rescate parcial Prudente Rosario`, `Suscripción Risky Norris`

---

## FASE 4 — Crear cuenta en producción

Una vez generados el perfil y las cartolas, ejecuta los siguientes pasos usando la API:

**API base:** `https://locoplaya666-final-financial-agent-production.up.railway.app`
**Cookies file:** `/tmp/sim_<nombre_slug>_cookies.txt`

### Paso 4.1 — Registrar cuenta

```bash
curl -s -c /tmp/sim_SLUG_cookies.txt \
  -X POST https://locoplaya666-final-financial-agent-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "NOMBRE_COMPLETO", "email": "EMAIL_GENERADO", "password": "PASSWORD_GENERADO"}'
```

**Email generado:** usa el formato `nombre.apellido.sim@gmail.com` o similar creíble.
**Password:** cumple requisitos (8+ chars, 1 mayúscula, 1 número). Ej: `Chile2024!`

### Paso 4.2 — Obtener CSRF token

```bash
curl -sv -b /tmp/sim_SLUG_cookies.txt -c /tmp/sim_SLUG_cookies.txt \
  -D /tmp/sim_SLUG_headers.txt \
  https://locoplaya666-final-financial-agent-production.up.railway.app/auth/me > /dev/null

CSRF=$(grep csrf-token /tmp/sim_SLUG_cookies.txt | awk '{print $NF}')
```

### Paso 4.3 — Guardar estado

Guarda en `/tmp/sim_SLUG_state.json`:
```json
{
  "nombre": "...",
  "email": "...",
  "password": "...",
  "slug": "...",
  "perfil": { ... },
  "productos": [ ... ],
  "intake_payload": { ... }
}
```

---

## FASE 5 — Presentar al usuario y esperar aprobación

Una vez creada la cuenta, presenta un resumen claro:

```
## 👤 [NOMBRE COMPLETO]
**Edad:** X años | **Ciudad:** ...
**Trabajo:** ...
**Ingreso mensual aprox:** $XXX.XXX

### Productos financieros:
1. [Institución] — [Producto] (X movimientos generados, período DD/MM–DD/MM)
2. [Institución] — [Producto] (X movimientos generados, período DD/MM–DD/MM)
[3. opcional]

### Cuenta creada:
- **Email:** ...
- **Password:** ...
- **Estado:** PENDING_APPROVAL

Cuando apruebes la cuenta, dime: "continúa con [nombre/email]"
y completaré el flujo: intake + carga de cartolas + conversación con el agente.
```

---

## FASE 6 — Continuar tras aprobación

Cuando el usuario diga "continúa con [nombre o email]", recupera el estado de `/tmp/sim_SLUG_state.json`,
loguéate y ejecuta en orden:

### 6.1 — Login y CSRF

```bash
curl -s -c /tmp/sim_SLUG_cookies.txt \
  -X POST https://locoplaya666-final-financial-agent-production.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "EMAIL", "password": "PASSWORD"}'

curl -sv -b /tmp/sim_SLUG_cookies.txt -c /tmp/sim_SLUG_cookies.txt \
  https://locoplaya666-final-financial-agent-production.up.railway.app/auth/me > /dev/null

CSRF=$(grep csrf-token /tmp/sim_SLUG_cookies.txt | awk '{print $NF}')
```

### 6.2 — Enviar intake

POST `/intake/submit` con el payload construido en Fase 1.
Campos requeridos: `employmentStatus`, `incomeBand`, `expensesCoverage`, `tracksExpenses` (string: `"yes"/"sometimes"/"no"`),
`hasSavingsOrInvestments` (boolean), `hasDebt` (boolean), `financialKnowledge` (objeto con 15 booleans),
`riskReaction` (enum), `selfRatedUnderstanding` (0–10), `moneyStressLevel` (0–10).
Campos opcionales: `age`, `city`, `profession`, `exactMonthlyIncome`, `savingsBand`, `exactSavingsAmount`.

### 6.3 — Cargar cartolas

Para cada cartola generada, convierte el CSV a base64 y llama a `/api/documents/parse`:

```bash
B64=$(echo "CONTENIDO_CSV" | base64 -w 0)

curl -s -b /tmp/sim_SLUG_cookies.txt \
  -X POST https://locoplaya666-final-financial-agent-production.up.railway.app/api/documents/parse \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{
    "files": [{"name": "cartola_INSTITUCION_PRODUCTO.csv", "base64": "'$B64'", "mimeType": "text/csv"}],
    "institutionHint": "INSTITUCIÓN",
    "productTypeHint": "TIPO",
    "fastParse": false
  }'
```

Reporta cuántos movimientos extrajo el parser y qué nivel de confianza reportó.

### 6.4 — Iniciar conversación con el agente

Manda 3–4 mensajes como el usuario:

1. **Primer mensaje:** presentación natural en el tono del personaje.
   Un trabajador de supermercado habla diferente a un ingeniero. Sé fiel al personaje.
   Ejemplo tono trabajador: *"Hola, me registré aquí. La verdad no entiendo mucho de plata
   pero quiero ver si me puedo ordenar. Gano como 550 lucas al mes y siempre me falta plata."*
   Ejemplo tono profesional: *"Buenos días, acabo de cargar mis cartolas de BCI y Fintual.
   Quiero entender si mi flujo de caja es sano dado mi dividendo hipotecario y el APV que estoy haciendo."*

2. **Segundo mensaje:** pregunta específica y realista basada en los datos reales de sus cartolas.

3. **Tercer mensaje:** reacción al análisis. ¿Lo entendió? ¿Fue útil? ¿Algo no tenía sentido?

4. **Cuarto mensaje (opcional):** pregunta de seguimiento o intento de profundizar.

Endpoint: `POST /api/agent`
Payload:
```json
{
  "user_message": "...",
  "session_id": "sim-SLUG-001",
  "history": [ ... mensajes anteriores ... ]
}
```

### 6.5 — Reporte final

Entrega un reporte estructurado:

```
## Reporte simulación: [NOMBRE]

### Parsing de documentos
| Producto | Movimientos extraídos | Confianza | Observaciones |
|----------|----------------------|-----------|---------------|
| ...      | ...                  | ...       | ...           |

### Conversación con el agente
[Resumen de los intercambios]

### Hallazgos sobre el sistema
- ¿El agente usó bien los datos del intake?
- ¿El parsing fue correcto para esa institución?
- ¿Hubo alucinaciones o respuestas genéricas?
- ¿El tono fue adecuado para el perfil del usuario?
- ¿Algo inesperado que valga la pena reportar?

### Veredicto del personaje
[En la voz del personaje: ¿confiaría en esta herramienta?]
```

---

## Notas técnicas importantes

- El CSRF doble-submit requiere que la cookie `csrf-token` y el header `X-CSRF-Token` tengan el **mismo valor**.
  Refresca siempre el CSRF antes de cada POST usando el flujo GET `/auth/me` → leer cookie.
- Si el login falla con "Cuenta pendiente de aprobación", la cuenta aún no fue aprobada. Informa al usuario.
- Si el parser retorna `movement_count: 0`, el CSV puede tener un problema de encoding o headers. Intenta con otro delimitador.
- La base64 debe generarse sin saltos de línea (`base64 -w 0` en Linux).
- Máximo 25 archivos por request de parseo; si hay múltiples cartolas, puedes enviarlas en un mismo request.
