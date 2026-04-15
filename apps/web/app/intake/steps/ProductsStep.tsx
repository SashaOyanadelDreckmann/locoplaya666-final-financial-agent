'use client';
import type {
  IntakeQuestionnaire,
  FinancialProductEntry,
} from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { CHILE_FINANCIAL_INSTITUTIONS, FINANCIAL_SERVICE_OPTIONS } from '@/lib/financialCatalog';

const QUICK_PRODUCTS = [
  'Tarjeta de crédito',
  'Crédito de consumo',
  'Crédito hipotecario',
  'Línea de crédito',
  'Cuenta de ahorro',
  'Fondo mutuo',
  'AFP / APV',
  'Seguro de vida',
];

export function ProductsStep({
  form,
  updateProduct,
  addProductRow,
  onNext,
  onBack,
}: {
  form: IntakeQuestionnaire;
  updateProduct: (index: number, field: keyof FinancialProductEntry, value: any) => void;
  addProductRow: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const hasAtLeastOneProduct = form.financialProducts.some((p) => p.product?.trim());

  const quickAdd = (label: string) => {
    const emptyIdx = form.financialProducts.findIndex((p) => !p.product?.trim());
    if (emptyIdx >= 0) {
      updateProduct(emptyIdx, 'product', label);
    } else {
      addProductRow();
      // Will be set on next render — use a micro-task
      setTimeout(() => {
        updateProduct(form.financialProducts.length, 'product', label);
      }, 0);
    }
  };

  const alreadyAdded = form.financialProducts.map((p) => p.product?.trim()).filter(Boolean);

  return (
    <div className="intake-step animate-intake-in">
      <div className="intake-step-header">
        <span className="intake-step-tag">Productos financieros</span>
        <h2 className="intake-step-title">¿Qué productos tienes?</h2>
        <p className="intake-step-subtitle">
          Tus tarjetas, créditos y cuentas son piezas clave del rompecabezas.
          Puedes ser aproximado, no necesitamos cifras exactas todavía.
        </p>
      </div>

      {/* Quick-add chips */}
      <div className="intake-question-block">
        <label className="intake-question-label">Agrega rápidamente</label>
        <div className="intake-chips intake-chips-wrap">
          {QUICK_PRODUCTS.map((qp) => {
            const active = alreadyAdded.includes(qp);
            return (
              <button
                key={qp}
                type="button"
                className={`intake-chip intake-chip-tag${active ? ' is-selected' : ''}`}
                onClick={() => !active && quickAdd(qp)}
                disabled={active}
              >
                {active ? '✓ ' : '+ '}{qp}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product rows */}
      {form.financialProducts.filter(p => p.product?.trim()).length > 0 && (
        <div className="intake-question-block">
          <label className="intake-question-label">Detalla cada producto</label>
          <div className="intake-products-list">
            {form.financialProducts.map((p, i) => {
              if (!p.product?.trim() && i > 0) return null;
              return (
                <div key={i} className="intake-product-row">
                  <div className="intake-product-row-header">
                    <span className="intake-product-tag">{p.product || `Producto ${i + 1}`}</span>
                  </div>
                  <div className="intake-product-fields">
                    {!p.product?.trim() && (
                      <input
                        className="intake-input"
                        list="financial-product-suggestions"
                        placeholder="Tipo de producto"
                        value={p.product}
                        onChange={(e) => updateProduct(i, 'product', e.target.value)}
                      />
                    )}
                    <input
                      className="intake-input"
                      list="financial-institution-suggestions"
                      placeholder="Institución (Ej: BancoEstado, Santander)"
                      value={p.institution ?? ''}
                      onChange={(e) => updateProduct(i, 'institution', e.target.value)}
                    />
                    <input
                      className="intake-input"
                      type="number"
                      placeholder="Costo mensual aprox. (opcional)"
                      value={p.monthlyCost ?? ''}
                      onChange={(e) =>
                        updateProduct(i, 'monthlyCost', e.target.value ? Number(e.target.value) : undefined)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button className="intake-add-btn" type="button" onClick={addProductRow}>
            + Agregar otro producto
          </button>
        </div>
      )}

      <datalist id="financial-product-suggestions">
        {FINANCIAL_SERVICE_OPTIONS.map((o) => <option key={o.id} value={o.label} />)}
      </datalist>
      <datalist id="financial-institution-suggestions">
        {CHILE_FINANCIAL_INSTITUTIONS.map((inst) => <option key={inst} value={inst} />)}
      </datalist>

      <div className="intake-footer">
        <button className="intake-back-btn" onClick={onBack}>← Volver</button>
        <button className="intake-next-btn" onClick={onNext}>
          {hasAtLeastOneProduct ? 'Continuar' : 'Omitir por ahora'}
          <span className="intake-next-arrow">→</span>
        </button>
      </div>
    </div>
  );
}
