---
titulo: Inventario operacional de cartolas y estados de cuenta en Chile
fuente: Investigacion web + fuentes oficiales
actualizado: 2026-06-06
alcance: bancos, fintechs y formatos documentales relevantes para el panel de transacciones
---

# Inventario operacional de cartolas y estados de cuenta en Chile

Nota: este inventario solo conserva afirmaciones respaldadas por fuentes publicas oficiales o documentacion de producto verificable. Cuando un detalle no esta explicitamente documentado, se redacta de forma general.

## Familias documentales

- `cartola de cuenta corriente` o `cuenta vista`
- `estado de cuenta de tarjeta de credito`
- `cartola historica`
- `cartola de transferencias`
- `reporte de conciliacion / ledger fintech`
- `exportable bancario TXT / CSV / Excel / PDF`

## Campos que aparecen con mayor frecuencia

- Fecha
- Descripcion o glosa
- Canal o sucursal
- Numero de operacion
- Cargo
- Abono
- Saldo
- Retenciones
- Saldo contable
- Saldo disponible
- Cupo total
- Cupo usado
- Cupo disponible
- Monto minimo
- Fecha de pago
- Intereses y comisiones

## Patrones por institucion

### BancoEstado

- La cartola de `CuentaRUT` muestra `Saldo y Retenciones` y una tabla de movimientos con `Fecha / Sucursal / N° Operacion / Descripcion / Cargos / Abonos / Saldo`.
- BancoEstado informa tipos distintos de cartola, incluyendo `Cartola`, `Cartola de Transferencias` y `Cartola Historica`.
- Para tarjeta de credito, el estado de cuenta sigue el formato habitual de periodos facturados, movimientos, pagos y monto minimo.

### Banco de Chile

- En empresas, el portal de cuenta corriente permite consultar `resumen de saldos y movimientos`, `cartola historica` y `liquidacion de intereses`.
- Para tarjeta de credito, el portal distingue entre `Saldos y Movimientos No Facturados` y `Movimientos Facturados`, con consulta por fecha de estado de cuenta.
- Banco de Chile ofrece una API de `Saldos y movimientos` orientada a conciliacion.

### Santander Chile

- Publica `Estados de cuenta` y un `Estado de Cuenta de Tarjeta de Crédito`.
- La documentacion publica confirma que el estado de cuenta de tarjeta incluye `monto minimo` y movimientos del periodo.

### BCI

- Su centro de ayuda distingue `Cartola electrónica Moneda Extranjera` y documentacion `MT940`.
- La documentacion publica de BCI para banca empresarial incluye cartola electronica en formato `MT 940` y `TXT`.

### Itaú Chile

- En cuenta corriente de empresas, Itaú publica cartolas en formato `texto`, `excel` y `pdf`.
- La periodicidad documentada es `diaria, semanal, quincenal o mensual`.

### Scotiabank Chile

- Existe documentacion publica de la fecha de facturacion de tarjeta de credito.
- Mantener solo la afirmacion general: las tarjetas de credito usan estado de cuenta con periodo facturado, fecha de pago y monto minimo.

### Banco Falabella / CMR

- El material publico confirma gestion de `cupo` de la tarjeta CMR y uso de la app o sitio para consultas.
- Mantener como formato general de tarjeta de credito: cupo, movimientos del periodo y monto minimo.

### Banco BICE

- Ofrece cuenta corriente y publica tarifas para `cartola` en sus documentos de comisiones.
- Tiene cuenta corriente en pesos y en moneda extranjera, ademas de linea de sobregiro.

### Fintechs

- Tenpo: la app permite abrir cuenta y acceder a una cuenta digital desde el celular.
- Global66: la cuenta global permite revisar movimientos desde la app y descargar certificado de cuenta; el historial de movimientos esta disponible para descarga en Chile y Colombia.
- Mercado Pago: tratar sus exportaciones como registro transaccional digital o ledger, no como cartola bancaria tradicional, salvo que el documento lo declare expresamente.

## Heuristicas de parsing

- Si hay `saldo`, `cargos`, `abonos`, asumir cartola de cuenta.
- Si hay `cupo`, `monto minimo`, `fecha de pago`, asumir tarjeta de credito.
- Si hay `retenciones`, `saldo contable` y `saldo disponible`, priorizar cuenta corriente o vista.
- Si el archivo viene en `CSV / TXT / XLSX`, tratarlo como ledger estructurado antes que OCR.
- Si el documento es de empresa, buscar `comprobante`, `numero de operacion`, `canal`, `sucursal` y `tipo de movimiento`.

## Notas de uso interno

- Este inventario sirve como base para taxonomia, normalizacion y deteccion de formato.
- La precision final siempre debe depender del contenido real del documento y no solo de la institucion.
