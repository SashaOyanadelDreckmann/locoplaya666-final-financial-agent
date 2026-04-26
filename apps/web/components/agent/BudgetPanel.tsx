'use client';

import { useState } from 'react';
import type { BudgetRow } from '@/lib/validation';
import { BudgetRowSchema } from '@/lib/validation';
import { ZodError } from 'zod';

interface BudgetPanelProps {
  budgetRows: BudgetRow[];
  onAddRow: (row: Omit<BudgetRow, 'id'>) => void;
  onDeleteRow: (id: string) => void;
  onUpdateRow: (id: string, updates: Partial<BudgetRow>) => void;
}

/**
 * Panel para gestionar presupuesto
 * Extraído de agent/page.tsx para mejorar mantenibilidad
 */
export function BudgetPanel({ budgetRows, onAddRow, onDeleteRow, onUpdateRow }: BudgetPanelProps) {
  const [newRow, setNewRow] = useState<Omit<BudgetRow, 'id'>>({
    category: '',
    type: 'expense',
    amount: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleAddRow = () => {
    try {
      BudgetRowSchema.omit({ id: true }).parse(newRow);
      onAddRow(newRow);
      setNewRow({ category: '', type: 'expense', amount: 0 });
      setErrors({});
    } catch (e) {
      if (e instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        e.errors.forEach((err) => {
          const field = err.path[0] as string;
          fieldErrors[field] = err.message;
        });
        setErrors(fieldErrors);
      }
    }
  };

  const totalIncome = budgetRows
    .filter((row) => row.type === 'income')
    .reduce((sum, row) => sum + row.amount, 0);

  const totalExpense = budgetRows
    .filter((row) => row.type === 'expense')
    .reduce((sum, row) => sum + row.amount, 0);

  const balance = totalIncome - totalExpense;

  return (
    <div className="budget-panel">
      <div className="budget-header">
        <h3>Presupuesto</h3>
      </div>

      <div className="budget-summary">
        <div className="budget-item">
          <span>Ingresos</span>
          <strong className="income">${totalIncome.toFixed(2)}</strong>
        </div>
        <div className="budget-item">
          <span>Gastos</span>
          <strong className="expense">${totalExpense.toFixed(2)}</strong>
        </div>
        <div className="budget-item total">
          <span>Balance</span>
          <strong className={balance >= 0 ? 'positive' : 'negative'}>
            ${balance.toFixed(2)}
          </strong>
        </div>
      </div>

      <div className="budget-rows">
        <table>
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Monto</th>
              <th>Nota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {budgetRows.map((row) => (
              <tr key={row.id}>
                <td>{row.category}</td>
                <td>
                  <select
                    value={row.type}
                    onChange={(e) =>
                      onUpdateRow(row.id, {
                        type: e.target.value as 'income' | 'expense',
                      })
                    }
                  >
                    <option value="income">Ingreso</option>
                    <option value="expense">Gasto</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    value={row.amount}
                    onChange={(e) => onUpdateRow(row.id, { amount: parseFloat(e.target.value) })}
                    step="0.01"
                  />
                </td>
                <td>{row.note}</td>
                <td>
                  <button onClick={() => onDeleteRow(row.id)} className="delete-btn">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="budget-add-row">
        <h4>Agregar fila</h4>
        <div className="form-row">
          <input
            type="text"
            placeholder="Categoría"
            value={newRow.category}
            onChange={(e) => setNewRow({ ...newRow, category: e.target.value })}
            className={errors.category ? 'error' : ''}
          />
          <select
            value={newRow.type}
            onChange={(e) => setNewRow({ ...newRow, type: e.target.value as 'income' | 'expense' })}
          >
            <option value="income">Ingreso</option>
            <option value="expense">Gasto</option>
          </select>
          <input
            type="number"
            placeholder="Monto"
            value={newRow.amount}
            onChange={(e) => setNewRow({ ...newRow, amount: parseFloat(e.target.value) })}
            step="0.01"
            className={errors.amount ? 'error' : ''}
          />
          <button onClick={handleAddRow} className="add-btn">
            Agregar
          </button>
        </div>
        {Object.entries(errors).map(([field, error]) => (
          <p key={field} className="error-text">
            {error}
          </p>
        ))}
      </div>
    </div>
  );
}

export default BudgetPanel;
