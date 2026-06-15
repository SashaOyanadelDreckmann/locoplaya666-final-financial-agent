'use client';

type TxConsentStepProps = {
  quickBank: string;
  productTemplate: string;
  showInstitutionCatalog: boolean;
  showTemplateCatalog: boolean;
  filteredInstitutions: string[];
  filteredTemplates: Array<{ label: string }>;
  consentAccepted: boolean;
  consentLocked?: boolean;
  canContinueAuto: boolean;
  consentGuidance?: string | null;
  isDockingToLibrary: boolean;
  transactionUploadError?: string | null;
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
                id="tx-institution-input"
                value={props.quickBank}
                onChange={(e) => {
                  props.onBankChange(e.target.value);
                }}
                onFocus={props.onOpenInstitutionCatalog}
                placeholder="Busca o escribe una institución"
                aria-controls="tx-institution-catalog"
                aria-expanded={props.showInstitutionCatalog}
                aria-autocomplete="list"
              />
              <button
                id="tx-institution-toggle"
                type="button"
                className="tx-picker-toggle"
                onClick={props.onToggleInstitutionCatalog}
                aria-expanded={props.showInstitutionCatalog}
                aria-controls="tx-institution-catalog"
              >
                {props.showInstitutionCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
              </button>
              {props.showInstitutionCatalog && (
                <div id="tx-institution-catalog" className="tx-picker-catalog" role="listbox" aria-label="Instituciones sugeridas">
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
                id="tx-template-input"
                value={props.productTemplate}
                onChange={(e) => {
                  props.onTemplateChange(e.target.value);
                }}
                onFocus={props.onOpenTemplateCatalog}
                placeholder="Busca o escribe una plantilla"
                aria-controls="tx-template-catalog"
                aria-expanded={props.showTemplateCatalog}
                aria-autocomplete="list"
              />
              <button
                id="tx-template-toggle"
                type="button"
                className="tx-picker-toggle"
                onClick={props.onToggleTemplateCatalog}
                aria-expanded={props.showTemplateCatalog}
                aria-controls="tx-template-catalog"
              >
                {props.showTemplateCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
              </button>
              {props.showTemplateCatalog && (
                <div id="tx-template-catalog" className="tx-picker-catalog" role="listbox" aria-label="Plantillas de producto">
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
            className={`tx-consent-toggle ${props.consentAccepted ? 'is-checked' : ''}${props.consentLocked ? ' is-locked' : ''}`}
            role="checkbox"
            aria-checked={props.consentAccepted}
            aria-disabled={props.consentLocked || undefined}
            disabled={props.consentLocked}
            title={
              props.consentLocked
                ? 'El consentimiento queda bloqueado mientras el producto esté autorizado.'
                : undefined
            }
            onClick={props.onToggleConsent}
          >
            <span className="tx-consent-toggle-box" aria-hidden="true" />
            <span className="tx-consent-toggle-copy">
              Autorizo el análisis de datos en ambiente simulado (sin credenciales reales).
            </span>
          </button>
        </div>
        {!props.canContinueAuto && props.consentGuidance ? (
          <p className="tx-consent-guidance" role="status">
            {props.consentGuidance}
          </p>
        ) : null}
        {props.transactionUploadError ? (
          <p className="bcc-hero-error" role="alert">
            {props.transactionUploadError}
          </p>
        ) : null}
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
    </section>
  );
}
