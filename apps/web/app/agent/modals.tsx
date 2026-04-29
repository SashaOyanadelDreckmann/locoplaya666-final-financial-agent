import { useMemo, useState, type ChangeEvent } from 'react';

type BudgetRow = {
  id: string;
  category: string;
  product: string;
  institution: string;
  type: 'income' | 'expense';
  amount: number;
};

type BudgetTopExpense = { id: string; label: string; amount: number; pct: number };
type BudgetInsights = {
  savingsRate: number;
  healthScore: number;
  fixedTotal: number;
  variableTotal: number;
  topExpenses: BudgetTopExpense[];
  nonZeroRows: unknown[];
};

export function BudgetModal(props: {
  isOpen: boolean;
  onClose: () => void;
  budgetTotals: { income: number; expenses: number; balance: number };
  budgetInsights: BudgetInsights;
  budgetRows: BudgetRow[];
  updateBudgetRow: (id: string, field: keyof BudgetRow, value: string | number) => void;
  upsertBudgetRow: (row: BudgetRow) => void;
  removeBudgetRow: (id: string) => void;
  coachHint: string;
  addBudgetRow: (type: 'income' | 'expense') => void;
  sendBudgetToAgent: () => void;
}) {
  if (!props.isOpen) return null;

  const [chatAnswers, setChatAnswers] = useState<Array<{ q: string; a: string }>>([]);
  const [budgetReply, setBudgetReply] = useState('');
  const [budgetQuestionStep, setBudgetQuestionStep] = useState(0);
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);
  const [isAskingAI, setIsAskingAI] = useState(false);

  const requiredQuestionFlow = useMemo(
    () => [
      { key: 'income-salary', text: '¿Cuál es tu sueldo líquido mensual? (solo número)' },
      { key: 'expense-rent', text: '¿Cuánto pagas al mes en vivienda/arriendo?' },
      { key: 'expense-food', text: '¿Cuánto gastas al mes en alimentación?' },
      { key: 'expense-transport', text: '¿Cuánto gastas al mes en transporte?' },
      { key: 'expense-services', text: '¿Cuánto gastas al mes en servicios (luz, agua, internet)?' },
      { key: 'expense-debt', text: '¿Pagas deuda mensual fija? (0 si no)' },
      { key: 'income-extra', text: '¿Tienes otro ingreso mensual recurrente? (0 si no)' },
    ],
    []
  );

  const activeQuestion =
    assistantQuestion ??
    requiredQuestionFlow[Math.min(budgetQuestionStep, requiredQuestionFlow.length - 1)]?.text ??
    '¿Qué quieres ajustar ahora del presupuesto?';

  function parseMoneyInput(raw: string) {
    const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  async function handleBudgetAgentReplySubmit() {
    const answer = budgetReply.trim();
    if (!answer || isAskingAI) return;

    const isGuidedFlow = budgetQuestionStep < requiredQuestionFlow.length;
    const questionObj = isGuidedFlow ? requiredQuestionFlow[budgetQuestionStep] : null;
    const amount = parseMoneyInput(answer);

    if (questionObj) {
      if (questionObj.key === 'income-salary') {
        props.upsertBudgetRow({
          id: 'income-salary',
          type: 'income',
          category: 'Sueldo liquido',
          amount,
          product: 'Ingreso principal',
          institution: 'Declarado por usuario',
        });
      } else if (questionObj.key === 'expense-rent') {
        props.upsertBudgetRow({
          id: 'expense-rent',
          type: 'expense',
          category: 'Vivienda / arriendo',
          amount,
          product: 'Vivienda',
          institution: 'Declarado por usuario',
        });
      } else if (questionObj.key === 'expense-food') {
        props.upsertBudgetRow({
          id: 'expense-food',
          type: 'expense',
          category: 'Alimentacion',
          amount,
          product: 'Alimentación',
          institution: 'Declarado por usuario',
        });
      } else if (questionObj.key === 'expense-transport') {
        props.upsertBudgetRow({
          id: 'expense-transport',
          type: 'expense',
          category: 'Transporte',
          amount,
          product: 'Transporte',
          institution: 'Declarado por usuario',
        });
      } else if (questionObj.key === 'expense-services') {
        props.upsertBudgetRow({
          id: 'expense-services',
          type: 'expense',
          category: 'Servicios básicos',
          amount,
          product: 'Servicios',
          institution: 'Declarado por usuario',
        });
      } else if (questionObj.key === 'expense-debt') {
        props.upsertBudgetRow({
          id: 'expense-debt',
          type: 'expense',
          category: 'Deuda financiera',
          amount,
          product: 'Pago deuda',
          institution: 'Declarado por usuario',
        });
      } else if (questionObj.key === 'income-extra') {
        props.upsertBudgetRow({
          id: 'income-extra',
          type: 'income',
          category: 'Ingresos extra',
          amount,
          product: 'Ingreso adicional',
          institution: 'Declarado por usuario',
        });
      }
    } else {
      const lower = answer.toLowerCase();
      if (/(sueldo|ingreso principal)/i.test(lower)) {
        props.upsertBudgetRow({ id: 'income-salary', type: 'income', category: 'Sueldo liquido', product: 'Ingreso principal', institution: 'Actualizado por chat', amount });
      } else if (/(extra|freelance|bono|comision)/i.test(lower)) {
        props.upsertBudgetRow({ id: 'income-extra', type: 'income', category: 'Ingresos extra', product: 'Ingreso extra', institution: 'Actualizado por chat', amount });
      } else if (/(arriendo|vivienda|hipoteca)/i.test(lower)) {
        props.upsertBudgetRow({ id: 'expense-rent', type: 'expense', category: 'Vivienda / arriendo', product: 'Vivienda', institution: 'Actualizado por chat', amount });
      } else if (/(comida|alimentacion|supermercado)/i.test(lower)) {
        props.upsertBudgetRow({ id: 'expense-food', type: 'expense', category: 'Alimentacion', product: 'Alimentación', institution: 'Actualizado por chat', amount });
      } else if (/(transporte|bencina|metro|uber|taxi)/i.test(lower)) {
        props.upsertBudgetRow({ id: 'expense-transport', type: 'expense', category: 'Transporte', product: 'Transporte', institution: 'Actualizado por chat', amount });
      } else if (/(luz|agua|internet|servicio)/i.test(lower)) {
        props.upsertBudgetRow({ id: 'expense-services', type: 'expense', category: 'Servicios básicos', product: 'Servicios básicos', institution: 'Actualizado por chat', amount });
      } else if (/(deuda|credito|tarjeta|cuota)/i.test(lower)) {
        props.upsertBudgetRow({ id: 'expense-debt', type: 'expense', category: 'Deuda financiera', product: 'Deuda', institution: 'Actualizado por chat', amount });
      } else {
        props.upsertBudgetRow({
          id: `expense-custom-${Date.now()}`,
          type: 'expense',
          category: 'Gasto adicional',
          product: 'Gasto adicional',
          institution: 'Declarado por usuario',
          amount,
        });
      }
    }

    setChatAnswers((prev) => [...prev, { q: activeQuestion, a: answer }]);
    setBudgetReply('');
    setBudgetQuestionStep((prev) => prev + (isGuidedFlow ? 1 : 0));

    try {
      setIsAskingAI(true);
      const res = await fetch('/api/budget-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeQuestion,
          answer,
          budgetRows: props.budgetRows,
          chatAnswers: chatAnswers.slice(-6),
        }),
      });
      const payload = await res.json();
      if (payload?.ok) {
        const upd = payload.update;
        if (
          upd &&
          typeof upd.id === 'string' &&
          (upd.type === 'income' || upd.type === 'expense') &&
          typeof upd.category === 'string'
        ) {
          props.upsertBudgetRow({
            id: upd.id === 'expense-custom' ? `expense-custom-${Date.now()}` : upd.id,
            type: upd.type,
            category: upd.category,
            amount: Math.max(0, Math.round(Number(upd.amount) || 0)),
            product: typeof upd.note === 'string' ? upd.note : 'Actualizado por IA',
            institution: 'Sugerido por IA',
          });
        }
        if (typeof payload.next_question === 'string' && payload.next_question.trim()) {
          setAssistantQuestion(payload.next_question.trim());
        }
      }
    } catch {
      // fallback silencioso: ya aplicamos lógica local arriba
    } finally {
      setIsAskingAI(false);
    }
  }

  return (
    <div className="agent-modal-overlay" onClick={props.onClose}>
      <div className="agent-modal budget-modal" onClick={(e) => e.stopPropagation()}>
        <div className="agent-modal-header">
          <h3>Budget Pro</h3>
          <button type="button" className="agent-modal-close" onClick={props.onClose}>×</button>
        </div>
        <p className="agent-modal-intro">Paso 2 del flujo ideal. Ajustemos un presupuesto de nivel senior con precisión y decisiones accionables.</p>

        <div className="budget-chat-card">
          <span className="budget-chat-badge">Asistente premium de presupuesto</span>
          <h4 className="budget-chat-question">{activeQuestion}</h4>
          <div className="budget-chat-input-row">
            <input
              value={budgetReply}
              onChange={(e) => setBudgetReply(e.target.value)}
              placeholder="Ej: 850000"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleBudgetAgentReplySubmit();
              }}
            />
            <button type="button" className="button-primary" onClick={() => void handleBudgetAgentReplySubmit()} disabled={isAskingAI}>
              {isAskingAI ? 'Pensando...' : 'Responder'}
            </button>
          </div>
          {chatAnswers.length > 0 && (
            <div className="budget-chat-log">
              {chatAnswers.slice(-3).map((item, idx) => (
                <div key={`${item.q}-${idx}`} className="budget-chat-log-row">
                  <span>{item.q}</span>
                  <strong>{item.a}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="budget-kpi-grid">
          <div className="budget-kpi-card"><span className="budget-kpi-label">Ingreso mensual</span><strong>${Math.round(props.budgetTotals.income).toLocaleString('es-CL')}</strong></div>
          <div className="budget-kpi-card"><span className="budget-kpi-label">Gasto mensual</span><strong>${Math.round(props.budgetTotals.expenses).toLocaleString('es-CL')}</strong></div>
          <div className="budget-kpi-card"><span className="budget-kpi-label">Ahorro estimado</span><strong>{Math.round(props.budgetInsights.savingsRate)}%</strong></div>
          <div className="budget-kpi-card"><span className="budget-kpi-label">Health score</span><strong>{props.budgetInsights.healthScore}/100</strong></div>
        </div>
        <div className="budget-health">
          <div className="budget-health-head"><span>Salud financiera actual</span><span>{props.budgetInsights.healthScore}/100</span></div>
          <div className="budget-health-track"><div className="budget-health-fill" style={{ width: `${props.budgetInsights.healthScore}%` }} /></div>
          <div className="budget-health-legend">
            <span>Fijos: ${Math.round(props.budgetInsights.fixedTotal).toLocaleString('es-CL')}</span>
            <span>Variables: ${Math.round(props.budgetInsights.variableTotal).toLocaleString('es-CL')}</span>
          </div>
        </div>
        {props.budgetInsights.topExpenses.length > 0 && (
          <div className="budget-top-expenses">
            <span className="budget-top-title">Top gastos</span>
            {props.budgetInsights.topExpenses.map((row) => (
              <div key={row.id} className="budget-top-row">
                <div className="budget-top-meta"><span>{row.label}</span><span>${Math.round(row.amount).toLocaleString('es-CL')}</span></div>
                <div className="budget-top-track"><div className="budget-top-fill" style={{ width: `${row.pct}%` }} /></div>
              </div>
            ))}
          </div>
        )}
        <div className="budget-table-wrap">
          <table className="budget-table">
            <thead><tr><th>Categoria</th><th>Producto</th><th>Institución</th><th>Tipo</th><th>Monto mensual</th><th>Acción</th></tr></thead>
            <tbody>
              {props.budgetRows.map((row) => (
                <tr key={row.id}>
                  <td><input value={row.category} onChange={(e) => props.updateBudgetRow(row.id, 'category', e.target.value)} /></td>
                  <td><input value={row.product} onChange={(e) => props.updateBudgetRow(row.id, 'product', e.target.value)} /></td>
                  <td><input value={row.institution} onChange={(e) => props.updateBudgetRow(row.id, 'institution', e.target.value)} /></td>
                  <td>
                    <select value={row.type} onChange={(e) => props.updateBudgetRow(row.id, 'type', e.target.value as 'income' | 'expense')}>
                      <option value="income">Ingreso</option><option value="expense">Gasto</option>
                    </select>
                  </td>
                  <td><input type="number" value={row.amount} onChange={(e) => props.updateBudgetRow(row.id, 'amount', Number(e.target.value))} /></td>
                  <td><button type="button" className="continue-ghost" onClick={() => props.removeBudgetRow(row.id)}>Borrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="budget-summary">
          <span>Filas activas: {props.budgetInsights.nonZeroRows.length}</span>
          <span>Coach hint: {props.coachHint}</span>
          <span className={props.budgetTotals.balance >= 0 ? 'is-positive' : 'is-negative'}>Balance: ${props.budgetTotals.balance.toLocaleString('es-CL')}</span>
        </div>
        <div className="agent-modal-actions">
          <button type="button" className="continue-ghost" onClick={() => props.addBudgetRow('income')}>+ Ingreso</button>
          <button type="button" className="continue-ghost" onClick={() => props.addBudgetRow('expense')}>+ Gasto</button>
          <button type="button" className="button-primary" onClick={props.sendBudgetToAgent}>Generar optimización premium</button>
        </div>
      </div>
    </div>
  );
}

type QuestionnaireDashboard = {
  readinessScore: number;
  understanding: number | null;
  stress: number | null;
  responsePairs: Array<{ label: string; value: string }>;
  insights: string[];
};

export function QuestionnaireModal(props: {
  isOpen: boolean;
  questionnaireDashboard: QuestionnaireDashboard | null;
  onClose: () => void;
}) {
  if (!props.isOpen || !props.questionnaireDashboard) return null;
  return (
    <div className="agent-modal-overlay" onClick={props.onClose}>
      <div className="agent-modal questionnaire-modal" onClick={(e) => e.stopPropagation()}>
        <div className="agent-modal-header">
          <h3>Cuestionario y lectura ejecutiva</h3>
          <button type="button" className="agent-modal-close" onClick={props.onClose}>✕</button>
        </div>
        <p className="agent-modal-intro">Resumen de respuestas del intake con una lectura breve para decisiones tácticas.</p>
        <div className="questionnaire-dashboard">
          <div className="questionnaire-kpi-grid">
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Readiness</span><strong>{props.questionnaireDashboard.readinessScore}%</strong></article>
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Comprensión</span><strong>{props.questionnaireDashboard.understanding !== null ? `${props.questionnaireDashboard.understanding}/10` : 'N/D'}</strong></article>
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Estrés</span><strong>{props.questionnaireDashboard.stress !== null ? `${props.questionnaireDashboard.stress}/10` : 'N/D'}</strong></article>
          </div>
          <div className="questionnaire-response-grid">
            {props.questionnaireDashboard.responsePairs.map((item) => (
              <div key={item.label} className="questionnaire-response-item"><span>{item.label}</span><strong>{item.value}</strong></div>
            ))}
          </div>
          <div className="questionnaire-insights">
            <span className="questionnaire-kpi-label">Insights</span>
            <ul>{props.questionnaireDashboard.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}

type TxWizardStep = 'products' | 'credentials' | 'upload' | 'dashboard' | 'locked';
type BankProduct = {
  id: string; label: string; bank: string; simulationAccepted: boolean; connected: boolean; randomMode: boolean;
  uploadedFiles: string[]; parsedDocuments: Array<{ name: string; text: string }>;
};

export function TransactionsModal(props: {
  isOpen: boolean;
  onClose: () => void;
  txWizardStep: TxWizardStep;
  setTxWizardStep: (step: TxWizardStep) => void;
  bankSimulationProductsCount: number;
  transactionIntel: { docs: number; amounts: number[]; summary: string; topKeywords: Array<{ label: string; count: number }>; averageDetected: number; maxDetected: number; totalDetected: number; rows: number };
  isTransactionsLockedThisMonth: boolean;
  activeBankProduct: BankProduct | null;
  transactionProductCards: Array<{ product: BankProduct; descriptor: { title: string; description: string; insights: string[] }; intel: { docs: number; amounts: number[] } }>;
  selectedProductId: string | null;
  selectTransactionProduct: (id: string) => void;
  deleteTransactionProduct: (id: string) => void;
  addTransactionProduct: () => void;
  updateActiveProduct: (patch: Partial<BankProduct>) => void;
  simulateBankLogin: () => void;
  onUploadStatement: (files: FileList | null) => void;
  documentsLoading: boolean;
  sendTransactionsToAgent: () => void;
}) {
  if (!props.isOpen) return null;
  return (
    <div className="agent-modal-overlay" onClick={props.onClose}>
      <div className="agent-modal transactions-modal" onClick={(e) => e.stopPropagation()}>
        <div className="agent-modal-header">
          <h3>Transacciones premium</h3>
          <button type="button" className="agent-modal-close" onClick={props.onClose}>×</button>
        </div>
        {props.txWizardStep !== 'products' && <p className="agent-modal-intro">Paso 1 del flujo ideal. Sube cartolas y consolidemos evidencia financiera real antes de pasar a presupuesto.</p>}
        {props.txWizardStep !== 'products' && (
          <div className="transactions-intelligence">
            <div className="transactions-stat-card"><span className="transactions-stat-label">Productos</span><strong>{props.bankSimulationProductsCount}</strong></div>
            <div className="transactions-stat-card"><span className="transactions-stat-label">Documentos</span><strong>{props.transactionIntel.docs}</strong></div>
            <div className="transactions-stat-card"><span className="transactions-stat-label">Montos detectados</span><strong>{props.transactionIntel.amounts.length}</strong></div>
            <div className="transactions-stat-card"><span className="transactions-stat-label">Estado</span><strong>{props.isTransactionsLockedThisMonth ? 'Ciclo enviado' : props.activeBankProduct?.connected ? 'Conectado' : 'Pendiente'}</strong></div>
          </div>
        )}
        {props.txWizardStep === 'products' && (
          <>
            <div className="transactions-products-column">
              {props.transactionProductCards.map(({ product, descriptor, intel }) => (
                <article key={product.id} className={`transactions-product-card${props.selectedProductId === product.id ? ' is-active' : ''}`}>
                  <button type="button" className="transactions-product-main" onClick={() => props.selectTransactionProduct(product.id)}>
                    <span className="transactions-product-eyebrow">{product.label}</span>
                    <strong>{descriptor.title}</strong>
                    <p>{descriptor.description}</p>
                    <div className="transactions-keywords">
                      <span className="transactions-keyword-pill">{product.connected ? 'Conectado (simulado)' : 'Pendiente conexión'}</span>
                      <span className="transactions-keyword-pill">{intel.docs > 0 ? `${intel.docs} cartola(s)` : 'Sin cartola'}</span>
                      <span className="transactions-keyword-pill">{intel.amounts.length > 0 ? `${intel.amounts.length} movimientos` : 'Sin movimientos'}</span>
                    </div>
                    <div className="transactions-product-insights">{descriptor.insights.map((insight, idx) => <span key={`${product.id}-insight-${idx}`}>{insight}</span>)}</div>
                  </button>
                  <div className="transactions-product-actions">
                    <button type="button" className="continue-ghost" onClick={() => props.selectTransactionProduct(product.id)}>Abrir producto</button>
                    <button type="button" className="continue-ghost danger" onClick={() => props.deleteTransactionProduct(product.id)}>Eliminar</button>
                  </div>
                </article>
              ))}
              <button type="button" className="transactions-product-card add-card" onClick={props.addTransactionProduct}>
                <span className="transactions-product-eyebrow">Nuevo producto</span><strong>Agregar producto</strong>
                <p>Selecciona banco, usa credenciales simuladas y sube cartola en imagen/PDF para análisis automático.</p>
              </button>
            </div>
            {props.transactionProductCards.length === 0 && <div className="transactions-summary-card"><span className="transactions-summary-title">Sin productos</span><p>Empieza agregando un producto. Luego el sistema identificará institución, tipo de producto e insights desde la cartola.</p></div>}
          </>
        )}
        {props.txWizardStep === 'credentials' && props.activeBankProduct && (
          <>
            <div className="transactions-summary-card"><span className="transactions-summary-title">Paso 1 · Banco y declaración de simulación</span><p>Este entorno es solo de simulación. No conecta bancos reales y no debes ingresar usuario, contraseña, token ni claves bancarias.</p></div>
            <div className="bank-sim-grid">
              <label>Nombre del producto<input value={props.activeBankProduct.label} onChange={(e) => props.updateActiveProduct({ label: e.target.value, connected: false })} /></label>
              <label>Banco (simulado)
                <select value={props.activeBankProduct.bank} onChange={(e) => props.updateActiveProduct({ bank: e.target.value, connected: false, randomMode: false })}>
                  <option value="">Selecciona un banco</option><option value="Banco de Chile (simulación)">Banco de Chile</option><option value="Santander (simulación)">Santander</option><option value="BCI (simulación)">BCI</option><option value="Scotiabank (simulación)">Scotiabank</option><option value="BancoEstado (simulación)">BancoEstado</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={props.activeBankProduct.simulationAccepted}
                  onChange={(e) =>
                    props.updateActiveProduct({
                      simulationAccepted: e.target.checked,
                      connected: false,
                    })
                  }
                />
                {' '}Declaro que entiendo que esto es una simulación y no ingresaré credenciales reales.
              </label>
            </div>
            <div className="bank-sim-status">Estado: <strong>{props.activeBankProduct.connected ? `conectado (simulado${props.activeBankProduct.randomMode ? ' aleatorio' : ''})` : 'desconectado'}</strong></div>
            <div className="agent-modal-actions">
              <button type="button" className="continue-ghost" onClick={() => props.setTxWizardStep('products')}>Volver a productos</button>
              <button type="button" className="button-primary" onClick={props.simulateBankLogin}>Continuar a carga</button>
            </div>
          </>
        )}
        {props.txWizardStep === 'upload' && props.activeBankProduct && (
          <>
            <div className="transactions-summary-card"><span className="transactions-summary-title">Paso 2 · Cargar cartola(s) del mes</span><p>Sube cartolas en PDF, Excel, CSV o imagen. El sistema extrae datos y genera hallazgos ejecutivos automáticamente.</p></div>
            <div className="upload-zone">
              <label className="upload-label">Subir cartola(s)<input type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.pdf,.xls,.xlsx,.csv" multiple onChange={(e: ChangeEvent<HTMLInputElement>) => props.onUploadStatement(e.target.files)} /></label>
              <div className="upload-files">
                {props.documentsLoading && <span>Extrayendo texto y estructura de tus documentos…</span>}
                {props.activeBankProduct.uploadedFiles.length === 0 && <span>Aun no hay cartolas cargadas.</span>}
                {props.activeBankProduct.uploadedFiles.map((name, idx) => <span key={`${name}-${idx}`} className="upload-file-pill">{name}</span>)}
              </div>
            </div>
            <div className="agent-modal-actions">
              <button type="button" className="continue-ghost" onClick={() => props.setTxWizardStep('credentials')}>Volver a credenciales</button>
              <button type="button" className="button-primary" disabled={props.documentsLoading || props.activeBankProduct.parsedDocuments.length === 0} onClick={() => props.setTxWizardStep('dashboard')}>Ver resumen ejecutivo</button>
            </div>
          </>
        )}
        {props.txWizardStep === 'dashboard' && props.activeBankProduct && (
          <>
            <div className="transactions-summary-card">
              <span className="transactions-summary-title">Paso 3 · Dashboard mensual</span><p>{props.transactionIntel.summary}</p>
              {props.transactionIntel.topKeywords.length > 0 ? <div className="transactions-keywords">{props.transactionIntel.topKeywords.map((item) => <span key={item.label} className="transactions-keyword-pill">{item.label} · {item.count}</span>)}</div> : null}
            </div>
            <div className="transactions-intelligence">
              <div className="transactions-stat-card"><span className="transactions-stat-label">Promedio</span><strong>{props.transactionIntel.averageDetected > 0 ? `$${Math.round(props.transactionIntel.averageDetected).toLocaleString('es-CL')}` : '—'}</strong></div>
              <div className="transactions-stat-card"><span className="transactions-stat-label">Mayor monto</span><strong>{props.transactionIntel.maxDetected > 0 ? `$${Math.round(props.transactionIntel.maxDetected).toLocaleString('es-CL')}` : '—'}</strong></div>
              <div className="transactions-stat-card"><span className="transactions-stat-label">Total detectado</span><strong>{props.transactionIntel.totalDetected > 0 ? `$${Math.round(props.transactionIntel.totalDetected).toLocaleString('es-CL')}` : '—'}</strong></div>
              <div className="transactions-stat-card"><span className="transactions-stat-label">Filas leídas</span><strong>{props.transactionIntel.rows.toLocaleString('es-CL')}</strong></div>
            </div>
            <div className="agent-modal-actions">
              <button type="button" className="continue-ghost" onClick={() => props.setTxWizardStep('products')}>Volver a productos</button>
              <button type="button" className="continue-ghost" onClick={() => props.setTxWizardStep('upload')}>Cargar más archivos</button>
              <button type="button" className="button-primary" onClick={props.sendTransactionsToAgent} disabled={props.documentsLoading || props.activeBankProduct.parsedDocuments.length === 0}>Enviar y pasar a presupuesto</button>
            </div>
          </>
        )}
        {props.txWizardStep === 'locked' && (
          <>
            <div className="transactions-summary-card"><span className="transactions-summary-title">Ciclo mensual enviado</span><p>Este mes ya fue enviado a Financiera mente. Solo puedes volver al panel o ir al chat. El flujo se reabre automáticamente en el próximo mes para subir cartolas del mes anterior.</p></div>
            <div className="agent-modal-actions"><button type="button" className="continue-ghost" onClick={props.onClose}>Volver atrás</button><button type="button" className="button-primary" onClick={props.onClose}>Ir al chat</button></div>
          </>
        )}
        {!props.activeBankProduct && props.txWizardStep !== 'products' && props.txWizardStep !== 'locked' && (
          <div className="transactions-summary-card">
            <span className="transactions-summary-title">Selecciona un producto</span>
            <p>Primero agrega o selecciona un producto para continuar con el flujo de simulación y análisis.</p>
            <div className="agent-modal-actions"><button type="button" className="button-primary" onClick={() => props.setTxWizardStep('products')}>Ir a productos</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
