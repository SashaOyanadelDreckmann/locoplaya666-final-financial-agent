'use client';

import { useState } from 'react';
import { BudgetModal } from '../agent/modals';

const rows: any[] = [
  { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1850000, product: 'Cuenta Corriente', cadence: 'fixed', movementType: 'income_main', momentum: 'steady' },
  { id: 'income_extra', category: 'Ingreso extra', type: 'income', amount: 240000, cadence: 'variable', movementType: 'income_extra', momentum: 'up' },
  { id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 640000, cadence: 'fixed', movementType: 'housing', momentum: 'steady', strategy: 'shield' },
  { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 420000, cadence: 'variable', movementType: 'food', momentum: 'up', strategy: 'review' },
  { id: 'expense_transport', category: 'Transporte', type: 'expense', amount: 180000, cadence: 'variable', movementType: 'transport', momentum: 'steady' },
  { id: 'expense_services', category: 'Servicios básicos', type: 'expense', amount: 150000, cadence: 'fixed', movementType: 'home_services', momentum: 'up', strategy: 'optimize' },
  { id: 'expense_debt', category: 'Deudas y cuotas', type: 'expense', amount: 320000, cadence: 'fixed', movementType: 'debt', momentum: 'steady', strategy: 'review' },
  { id: 'expense_savings', category: 'Ahorro e inversión', type: 'expense', amount: 200000, cadence: 'fixed', movementType: 'savings_investment', momentum: 'up' },
];

export default function BudgetPreview() {
  const [budgetRows, setBudgetRows] = useState<any[]>(rows);
  const [chatAnswers, setChatAnswers] = useState<Array<{ q: string; a: string }>>([]);

  const income = budgetRows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expenses = budgetRows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const balance = income - expenses;
  const filledRows = budgetRows.filter((r) => r.amount > 0);

  const topExpenses = budgetRows
    .filter((r) => r.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((r) => ({ id: r.id, label: r.category, amount: r.amount, pct: Math.round((r.amount / expenses) * 100) }));

  const noop = () => {};

  return (
    <div style={{ minHeight: '100vh', background: '#04070d' }}>
      <BudgetModal
        isOpen
        onClose={noop}
        budgetTotals={{ income, expenses, balance }}
        budgetInsights={{
          savingsRate: Math.round((balance / income) * 100),
          healthScore: 78,
          fixedTotal: 1310000,
          variableTotal: 600000,
          topExpenses,
          nonZeroRows: filledRows,
          risingExpenseCount: 3,
          optimizePotential: 95000,
        }}
        budgetRows={budgetRows}
        budgetProductOptions={['Cuenta Corriente', 'Tarjeta de Crédito', 'Efectivo']}
        budgetCompletion={{ fillRate: filledRows.length / budgetRows.length, totalRows: budgetRows.length, filledRows }}
        budgetSignals={{
          balanceTone: balance > 0 ? 'surplus' : balance < 0 ? 'deficit' : 'balanced',
          balanceLabel: balance > 0 ? 'Tienes superávit este mes' : 'Gastas más de lo que ingresas',
          balanceHint: 'Tu flujo mensual deja un margen sano para fortalecer ahorro e inversión sin comprometer gastos esenciales.',
          coreFilledCount: 6,
          coreTotal: 8,
          coreFillRate: 0.75,
          readinessScore: 82,
          nextAction: 'Revisa alimentación y servicios para liberar $95.000 al mes.',
          risingExpenseCount: 3,
          optimizePotential: 95000,
        }}
        updateBudgetRow={(id, field, value) =>
          setBudgetRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
        }
        upsertBudgetRow={(row) =>
          setBudgetRows((prev) => {
            const i = prev.findIndex((r) => r.id === row.id);
            if (i === -1) return [...prev, row];
            const next = [...prev];
            next[i] = row;
            return next;
          })
        }
        applyBudgetTemplate={noop}
        coachHint="Empieza por confirmar tu ingreso principal."
        addBudgetRow={(type) =>
          setBudgetRows((prev) => [...prev, { id: `${type}_${Date.now()}`, category: type === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto', type, amount: 0 }])
        }
        deleteBudgetRow={(id) => setBudgetRows((prev) => prev.filter((r) => r.id !== id))}
        sendBudgetToAgent={noop}
        chatAnswers={chatAnswers}
        onChatAnswersChange={setChatAnswers}
        sessionInfo={{ name: 'Sasha' }}
        bankProducts={[]}
      />
    </div>
  );
}
