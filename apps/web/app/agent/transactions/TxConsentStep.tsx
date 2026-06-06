'use client';

type TxConsentStepProps = {
  quickBank: string;
  productTemplate: string;
  showInstitutionCatalog: boolean;
  showTemplateCatalog: boolean;
  filteredInstitutions: string[];
  filteredTemplates: Array<{ label: string }>;
  consentAccepted: boolean;
  canContinueAuto: boolean;
  isDockingToLibrary: boolean;
  onBankChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  onOpenInstitutionCatalog: () => void;
  onOpenTemplateCatalog: () => void;
  onToggleInstitutionCatalog: () => void;
  onToggleTemplateCatalog: () => void;
  onSelectInstitution: (institution: string) => void;
  onSelectTemplate: (template: string) => void;
  onToggleConsent: () => void;
  onDeleteProduct: () => void;
  onContinue: () => void;
};

export function TxConsentStep(props: TxConsentStepProps) {
  return (
    <section className="tx-content-card is-main-center tx-summary-clean tx-step-reveal">
      <div className="pt-stage-header">
        <span className="pt-stage-eyebrow">Paso 1</span>
        <h4>Autorización del producto</h4>
        <p>Define institución, tipo y consentimiento para iniciar el flujo simulado.</p>
      </div>
      <div className="transactions-summary-card tx-consent-card">
        <span className="transactions-summary-title">Consentimiento Open Finance (simulado)</span>
        <div className="bank-sim-grid">
          <label>
            Institución (sugerida)
            <div className="tx-picker-field">
              <input
                value={props.quickBank}
                onChange={(e) => {
                  props.onBankChange(e.target.value);
                }}
                onFocus={props.onOpenInstitutionCatalog}
                placeholder="Busca o escribe una institución"
              />
              <button
                type="button"
                className="tx-picker-toggle"
                onClick={props.onToggleInstitutionCatalog}
              >
                {props.showInstitutionCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
              </button>
              {props.showInstitutionCatalog && (
                <div className="tx-picker-catalog">
                  {props.filteredInstitutions.map((institution) => (
                    <button
                      key={institution}
                      type="button"
                      className="tx-picker-option"
                      onClick={() => props.onSelectInstitution(institution)}
                    >
                      {institution}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
          <label>
            Plantilla de producto o servicio
            <div className="tx-picker-field">
              <input
                value={props.productTemplate}
                onChange={(e) => {
                  props.onTemplateChange(e.target.value);
                }}
                onFocus={props.onOpenTemplateCatalog}
                placeholder="Busca o escribe una plantilla"
              />
              <button
                type="button"
                className="tx-picker-toggle"
                onClick={props.onToggleTemplateCatalog}
              >
                {props.showTemplateCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
              </button>
              {props.showTemplateCatalog && (
                <div className="tx-picker-catalog">
                  {props.filteredTemplates.map((template) => (
                    <button
                      key={template.label}
                      type="button"
                      className="tx-picker-option"
                      onClick={() => props.onSelectTemplate(template.label)}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
          <button
            type="button"
            className={`tx-consent-toggle ${props.consentAccepted ? 'is-checked' : ''}`}
            role="checkbox"
            aria-checked={props.consentAccepted}
            onClick={props.onToggleConsent}
          >
            <span className="tx-consent-toggle-box" aria-hidden="true" />
            <span className="tx-consent-toggle-copy">
              Autorizo el análisis de datos en ambiente simulado (sin credenciales reales).
            </span>
          </button>
          <div className="tx-consent-inline-actions" />
        </div>
        <div className="agent-modal-actions tx-consent-actions-row">
          <button
            type="button"
            className="continue-ghost tx-delete-product-btn"
            onClick={props.onDeleteProduct}
          >
            Eliminar producto
          </button>
          <button
            type="button"
            className="button-primary tx-consent-continue-main"
            disabled={!props.canContinueAuto || props.isDockingToLibrary}
            onClick={props.onContinue}
          >
            {props.isDockingToLibrary ? 'Autorizando…' : 'Autorizar y continuar'}
          </button>
        </div>
      </div>
    </section>
  );
}
