import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const SavedReportGroupSchema = z.enum(['plan_action', 'simulation', 'budget', 'diagnosis', 'other']);

const SavePanelStateSchema = z.object({
  panelState: z
    .object({
      budgetRows: z.array(
        z
          .object({
            id: z.string(),
            category: z.string(),
            type: z.enum(['income', 'expense']),
            amount: z.number(),
            note: z.string().optional().default(''),
          })
          .passthrough(),
      ),
      bankSimulation: z
        .object({
          products: z
            .array(
              z
                .object({
                  id: z.string(),
                  label: z.string().optional().default(''),
                  bank: z.string().optional().default(''),
                  productType: z.string().optional().default('checking_account'),
                })
                .passthrough(),
            )
            .optional(),
          productsModuleSkipped: z.boolean().optional(),
          taxonomyOverrides: z.array(z.record(z.string(), z.unknown())).optional(),
        })
        .passthrough(),
      savedReports: z.array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            fileUrl: z.string(),
            createdAt: z.string(),
            group: SavedReportGroupSchema.optional().default('other'),
          })
          .passthrough(),
      ),
      txProductsCreatedTotal: z.number().optional(),
      updatedAt: z.string(),
    })
    .passthrough(),
});

describe('SavePanelStateSchema', () => {
  it('accepts legacy snapshots without note, group or productType', () => {
    const parsed = SavePanelStateSchema.parse({
      panelState: {
        budgetRows: [{ id: 'r1', category: 'Sueldo', type: 'income', amount: 1000 }],
        bankSimulation: {
          products: [{ id: 'p1', label: 'Cuenta', bank: 'Banco Estado' }],
          productsModuleSkipped: false,
          taxonomyOverrides: [],
        },
        savedReports: [
          {
            id: 'rep-1',
            title: 'Informe',
            fileUrl: '/generated/x.pdf',
            createdAt: new Date().toISOString(),
          },
        ],
        txProductsCreatedTotal: 1,
        updatedAt: new Date().toISOString(),
      },
    });

    expect(parsed.panelState.budgetRows[0]?.note).toBe('');
    expect(parsed.panelState.bankSimulation.products?.[0]?.productType).toBe('checking_account');
    expect(parsed.panelState.savedReports[0]?.group).toBe('other');
  });
});
