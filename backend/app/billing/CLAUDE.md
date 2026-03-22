# Módulo Billing — Reglas críticas

## Archivos

- `engine.py` — motor principal de facturación (run_billing, run_catchup)
- `service_status.py` — evalúa deuda y corta/restaura servicios en Mikrotik
- `pdf.py` — generación de PDFs de facturas

## Modos de facturación

Controlado por el setting `billing.mode`:

- **GLOBAL**: todas las conexiones se facturan el mismo día del mes (`billing.global_day`)
- **INDIVIDUAL**: cada conexión tiene su propio `billing_day` (campo en `Connection`)

`effective_billing_day(conn)` en `engine.py` abstrae esta lógica — siempre usar esta función.

## Garantías que DEBEN mantenerse

1. **Idempotencia**: `already_billed(connection_id, period_start, period_end)` previene duplicados. Nunca omitir esta verificación antes de crear una factura.
2. **Aislamiento de errores**: una conexión que falla no debe frenar las demás. Usar try/except por conexión.
3. **Commits por lote**: cada `BATCH_SIZE=50` conexiones se hace commit para no perder todo ante un fallo.
4. **Auditoría**: cada ejecución crea un registro `BillingRun`. Al agregar código al motor, mantener los `slog()` correspondientes.

## Cálculo de período

`period_for_billing_day(billing_day, ref_date)` devuelve `(period_start, period_end)`.

Ejemplo: `billing_day=15`, `ref_date=2026-02-15` → período `2026-01-15` a `2026-02-14`.

## Prorrateo del primer mes

Si `connection.prorate_first_month=True` y es el primer ciclo:
- Se calcula el precio proporcional a los días desde `connection.created_at` hasta `period_end`
- Si el resultado es $0, se omite la factura (no se crea con total=0)
- `prorate_amount(full_price, period_start, period_end, start_date)` hace el cálculo

## Catch-up

`run_catchup(max_days_back=7)` revisa los últimos N días y ejecuta la facturación para cualquier día que no tenga un `BillingRun` con status `COMPLETED`. Se llama al iniciar el backend para recuperar días perdidos por downtime.

## Estados de factura

```
DRAFT → ISSUED → PAID
              ↓
             VOID  (baja lógica, is_deleted=True)
```

- `DRAFT`: generada pero no emitida (sin número de comprobante)
- `ISSUED`: emitida con número, vencimiento activo
- `PAID`: `paid_total >= total`
- `VOID`: anulada (soft delete)

Nunca eliminar facturas físicamente de la DB. Solo `is_deleted=True`.

## Corte de servicios por deuda

`service_status.py` evalúa todas las conexiones activas:
- Si tiene facturas `ISSUED` vencidas sin pagar → encola `JOB_MT_SET_PPP_PROFILE` con el perfil de corte
- Si pagó y estaba cortada → encola `JOB_MT_SET_PPP_PROFILE` con el perfil original

Perfil de corte: setting `billing.cut_profile` (default: `"suspended"`).

## Al agregar nuevos tipos de cobro (ej: Mercado Pago)

Cuando se registre un pago vía MP webhook:
1. Crear el registro `Payment` con `method="MERCADOPAGO"`
2. Imputar a facturas (lógica FIFO ya existente en `routes/payments.py`)
3. **Siempre** encolar `JOB_BILLING_UPDATE_CLIENT_SERVICES` para que el worker evalúe si restaurar el servicio
