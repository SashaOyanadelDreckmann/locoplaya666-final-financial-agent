import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { validateAndPrepareDocumentFiles } from './documents';

async function buildAuthenticatedAgent() {
  vi.resetModules();
  const { createApp } = await import('../app');
  const { listUserDocuments } = await import('../persistence/repos');
  const app = createApp();
  const agent = request.agent(app);

  await agent.post('/auth/register').send({
    name: 'Docs User',
    email: `docs-${Date.now()}@example.com`,
    password: 'secret123',
  });
  const sessionRes = await agent.get('/api/session');
  const csrfToken = String(sessionRes.headers['x-csrf-token'] ?? '');
  const userId = String(sessionRes.body?.data?.id ?? '');
  return { app, agent, csrfToken, userId, listUserDocuments };
}

describe('documents routes', () => {
  beforeEach(() => {
    delete process.env.DOCUMENT_PARSE_MAX_TOTAL_BYTES;
    delete process.env.DOCUMENT_PARSE_MAX_FILE_BYTES;
  });

  it('persists and reloads full transactions panel state without truncating products', async () => {
    const { agent, csrfToken } = await buildAuthenticatedAgent();
    const panelState = {
      budgetRows: [{ id: 'row-1', category: 'Supermercado', type: 'expense', amount: 120000, note: 'test' }],
      budgetChatAnswers: [{ q: 'q1', a: 'a1' }],
      bankSimulation: {
        products: [
          {
            id: 'prod-1',
            label: 'Banco Demo · Cuenta Corriente',
            bank: 'Banco Demo',
            productType: 'checking_account',
            simulationAccepted: true,
            connected: true,
            randomMode: false,
            uploadedFiles: ['cartola.csv'],
            parsedDocuments: [
              {
                documentId: 'doc-123',
                name: 'cartola.csv',
                text: '2026-05-01,ABONO,+1000',
              },
            ],
            assistant: {
              summaryText: 'Resumen',
              messages: [
                {
                  id: 'm1',
                  role: 'assistant',
                  text: 'ok',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
            dashboard: {
              summary: 'Dashboard listo',
              keyMetrics: { inflows_total: 1000, outflows_total: 0, net_flow: 1000, avg_movement: 1000, movement_count: 1 },
            },
          },
        ],
        activeProductId: 'prod-1',
        lockedMonth: '2026-05',
        connected: true,
        randomMode: false,
        uploadedFiles: ['cartola.csv'],
        parsedDocuments: [{ documentId: 'doc-123', name: 'cartola.csv', text: '2026-05-01,ABONO,+1000' }],
      },
      savedReports: [],
      updatedAt: new Date().toISOString(),
    };

    const saveRes = await agent
      .post('/api/panel-state')
      .set('X-CSRF-Token', csrfToken)
      .send({ panelState });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.ok).toBe(true);

    const loadRes = await agent.get('/api/panel-state');
    expect(loadRes.status).toBe(200);
    expect(loadRes.body.data.panelState.bankSimulation.products).toHaveLength(1);
    expect(loadRes.body.data.panelState.bankSimulation.products[0].assistant.summaryText).toBe('Resumen');
    expect(loadRes.body.data.panelState.bankSimulation.activeProductId).toBe('prod-1');
  }, 15000);

  it('rejects unsupported extensions before persisting documents', async () => {
    const { agent, csrfToken, userId, listUserDocuments } = await buildAuthenticatedAgent();

    const res = await agent
      .post('/api/documents/parse')
      .set('X-CSRF-Token', csrfToken)
      .send({
        files: [{ name: 'cartola.zip', base64: Buffer.from('fake-zip').toString('base64') }],
      });

    expect(res.status).toBe(400);
    const docs = await listUserDocuments(userId, 20);
    expect(docs).toHaveLength(0);
  }, 10000);

  it('rejects invalid base64 before persisting documents', async () => {
    const { agent, csrfToken, userId, listUserDocuments } = await buildAuthenticatedAgent();

    const res = await agent
      .post('/api/documents/parse')
      .set('X-CSRF-Token', csrfToken)
      .send({
        files: [{ name: 'cartola.csv', base64: '%%%not-base64%%%' }],
      });

    expect(res.status).toBe(400);
    const docs = await listUserDocuments(userId, 20);
    expect(docs).toHaveLength(0);
  });

  it('prevalidates total size before any ingest side effects', () => {
    const chunk = Buffer.alloc(2 * 1024 * 1024, 'a').toString('base64');
    const oversized = Array.from({ length: 18 }, (_, index) => ({ name: `bulk-${index}.csv`, base64: chunk }));
    expect(() => validateAndPrepareDocumentFiles(oversized)).toThrow(/supera/i);
  });
});
