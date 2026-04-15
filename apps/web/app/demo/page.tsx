'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { sendToAgent } from '@/lib/agent';

type DemoMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function DemoPage() {
  const [messages, setMessages] = useState<DemoMessage[]>([
    {
      role: 'assistant',
      content:
        'Hola. Esta es una demo rapida del agente. Preguntame cualquier tema financiero y te respondo en esta hoja simple.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(
    () =>
      messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    [messages]
  );

  async function onSend() {
    const text = input.trim();
    if (!text || loading) return;

    const nextUser: DemoMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, nextUser]);
    setInput('');
    setError(null);

    try {
      setLoading(true);
      const res = await sendToAgent({
        user_message: text,
        history: [...history, nextUser],
        context: { demo_mode: true },
      });

      const assistantText =
        typeof res?.message === 'string' && res.message.trim().length > 0
          ? res.message
          : 'Recibi tu consulta. Si quieres, te puedo responder con mas detalle o en formato de pasos.';

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantText },
      ]);
    } catch (e: any) {
      const msg = e?.message ?? 'No se pudo enviar el mensaje';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'No pude responder en este intento. Intenta nuevamente.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <div
        className="app-content"
        style={{ width: 'min(920px, 100%)', margin: '0 auto' }}
      >
        <section className="app-section animate-fade-in">
          <h1 className="text-3xl font-light">Demo del agente</h1>
          <p className="text-muted max-w-xl">
            Version simple sin panel. Solo una hoja para preguntar y responder.
          </p>
        </section>

        <section className="app-section">
          <div
            className="form-section"
            style={{
              height: '56vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={`${m.role}-${idx}`}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background:
                    m.role === 'user'
                      ? 'rgba(56, 94, 156, 0.28)'
                      : 'rgba(255, 255, 255, 0.05)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255, 255, 255, 0.05)',
                }}
              >
                Pensando...
              </div>
            )}
          </div>
        </section>

        <section className="app-section">
          <div className="form-section">
            <div className="form-group">
              <label className="form-label">Tu pregunta</label>
              <textarea
                placeholder="Ej: Como ordenar mis gastos del mes si mis ingresos son variables?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                rows={4}
              />
            </div>
            {error && <p className="text-small text-muted">{error}</p>}
          </div>
        </section>

        <section className="app-section">
          <div className="form-footer">
            <Link href="/" className="continue-ghost">
              Volver al inicio
            </Link>
            <button
              type="button"
              onClick={onSend}
              disabled={loading || !input.trim()}
              className="button-primary"
            >
              {loading ? 'Enviando...' : 'Preguntar'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
