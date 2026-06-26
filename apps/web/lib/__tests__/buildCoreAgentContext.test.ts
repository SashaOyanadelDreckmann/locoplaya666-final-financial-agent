/** @jest-environment node */

import type { ChatItem } from '@/lib/agente/agent.response.types';
import { buildCoreAgentHistorySnapshot } from '@/lib/agente/nucleo/buildCoreAgentContext';

describe('buildCoreAgentHistorySnapshot', () => {
  it('uses agent_content for questionnaire placeholders in history', () => {
    const items: ChatItem[] = [
      {
        type: 'message',
        role: 'user',
        content: 'Completé el formulario',
        agent_content:
          'Formulario respondido. id=q_diag respuestas=q1=Priorizar deuda; q2=Menos de $500k Siguiente paso: entrega diagnóstico y 3 acciones concretas.',
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'Perfecto, con eso ajusto el plan.',
      },
    ];

    const history = buildCoreAgentHistorySnapshot(items, 'chat-1');
    expect(history[0]?.content).toContain('Formulario respondido.');
    expect(history[0]?.content).toContain('Priorizar deuda');
  });
});
