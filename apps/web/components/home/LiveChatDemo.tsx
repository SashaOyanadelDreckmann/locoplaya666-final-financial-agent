'use client';

import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, Send } from 'lucide-react';

const SILK = [0.22, 1, 0.36, 1] as const;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const AI_RESPONSES = [
  'La CMF (Comisión para el Mercado Financiero) supervisa bancos, AFP y fondos mutuos en Chile, velando por la estabilidad y transparencia del sistema financiero.',
  'Basándome en lo que describes, identifico áreas con potencial de mejora. Un diagnóstico completo puede revelarte oportunidades concretas: la mayoría de nuestros usuarios mejora su ahorro en un 15–22%.',
];

type Msg = { id: number; role: 'user' | 'ai'; text: string };

export default function LiveChatDemo() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const uidRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, showCTA]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isTyping) return;

    setInput('');
    const newCount = msgCount + 1;
    setMsgCount(newCount);
    setMessages((prev) => [...prev, { id: ++uidRef.current, role: 'user', text }]);

    if (newCount >= 3) {
      await sleep(700);
      setShowCTA(true);
      return;
    }

    setIsTyping(true);
    await sleep(950);
    setIsTyping(false);

    const responseText = AI_RESPONSES[newCount - 1] ?? AI_RESPONSES[AI_RESPONSES.length - 1];
    const aiId = ++uidRef.current;
    setMessages((prev) => [...prev, { id: aiId, role: 'ai', text: '' }]);

    for (let i = 1; i <= responseText.length; i++) {
      await sleep(13);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.id === aiId) copy[copy.length - 1] = { ...last, text: responseText.slice(0, i) };
        return copy;
      });
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') sendMessage();
  }

  return (
    <div
      className="w-full overflow-hidden rounded-2xl"
      style={{
        background: 'rgba(8,12,20,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 32px 80px -24px rgba(0,0,0,0.80)',
        maxWidth: 760,
      }}
    >
      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(4,8,16,0.60)', alignItems: 'center',
      }}>
        {[
          { label: 'Diagnóstico', color: '#6f8fa6', num: 1 },
          { label: 'Bloqueado',   color: 'rgba(164,143,79,0.7)', num: 2 },
          { label: 'Bloqueado',   color: 'rgba(90,70,50,0.6)',   num: 3 },
        ].map((tab, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: i === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${i === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 999, padding: '4px 10px 4px 8px',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, width: 14, height: 14,
              borderRadius: '50%', background: tab.color,
              color: 'rgba(255,255,255,0.90)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{tab.num}</span>
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '-0.01em', color: i === 0 ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.35)' }}>
              {tab.label}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
            color: 'rgba(255,165,0,0.75)',
            border: '1px solid rgba(255,165,0,0.28)',
            borderRadius: 4, padding: '2px 7px',
          }}>DEMO</span>
        </div>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center', padding: '16px 0 12px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(4,8,16,0.40)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.01em', margin: 0 }}>
          Financiera<strong>mente</strong>
        </p>
        <p style={{ fontSize: 10, color: 'rgba(111,143,166,0.70)', letterSpacing: '0.10em', margin: '2px 0 0', textTransform: 'lowercase' }}>
          lectura base
        </p>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px' }}>
        <div style={{
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 12, color: 'rgba(111,143,166,0.90)',
          padding: '12px 0 8px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          marginBottom: 10,
        }}>
          $ user_input
        </div>

        <div ref={scrollRef} style={{
          height: 200, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 8,
          scrollbarWidth: 'none', paddingBottom: 12,
        }}>
          {messages.length === 0 && !showCTA && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', fontFamily: '"Courier New", monospace', margin: '8px 0 0' }}
            >
              _escribe una pregunta financiera...
            </motion.p>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.30, ease: SILK }}
                style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}
              >
                {m.role === 'user' ? (
                  <div style={{
                    fontFamily: '"Courier New", Courier, monospace',
                    fontSize: 12, color: 'rgba(164,143,79,0.90)',
                    background: 'rgba(164,143,79,0.07)',
                    border: '1px solid rgba(164,143,79,0.15)',
                    borderRadius: '2px 10px 10px 2px',
                    padding: '5px 11px', maxWidth: '80%',
                  }}>
                    <span style={{ color: 'rgba(111,143,166,0.55)', marginRight: 6 }}>$</span>
                    {m.text}
                  </div>
                ) : (
                  <div style={{
                    fontSize: 12.5, color: 'rgba(255,255,255,0.72)',
                    lineHeight: 1.60, maxWidth: '88%', letterSpacing: '-0.005em',
                  }}>
                    {m.text}
                    {m.text.length > 0 && (
                      <span style={{ marginLeft: 2, display: 'inline-block', width: 1.5, height: 12, background: '#a48f4f', verticalAlign: 'middle', animation: 'pulse 1s infinite' }} />
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', gap: 4, alignItems: 'center' }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span key={i}
                  style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(111,143,166,0.60)', display: 'block' }}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.16 }}
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!showCTA && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(4,8,16,0.50)',
            }}
          >
            <span style={{ fontFamily: '"Courier New", monospace', fontSize: 12, color: 'rgba(111,143,166,0.45)', flexShrink: 0 }}>$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="escribir_mensaje"
              disabled={isTyping}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: 12, color: 'rgba(255,255,255,0.72)',
              }}
            />
            <motion.button
              onClick={sendMessage}
              disabled={!input.trim() || isTyping}
              whileHover={{ opacity: 0.80 }}
              whileTap={{ scale: 0.92 }}
              style={{
                background: 'none',
                border: '1px solid rgba(111,143,166,0.25)',
                borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                color: 'rgba(111,143,166,0.70)', flexShrink: 0,
                display: 'flex', alignItems: 'center',
                opacity: input.trim() && !isTyping ? 1 : 0.30,
                transition: 'opacity 0.2s',
              }}
            >
              <Send size={11} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CTA panel — aparece después del 3er mensaje ──────────────────── */}
      <AnimatePresence>
        {showCTA && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: SILK }}
            style={{
              background: 'rgba(248,246,240,0.97)',
              borderTop: '1px solid rgba(0,0,0,0.10)',
              borderRadius: '0 0 16px 16px',
              padding: '18px 20px 22px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', margin: '0 0 4px' }}>
                  Diagnóstico
                </p>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'rgba(0,0,0,0.88)', margin: '0 0 3px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  Informe diagnóstico financiero
                </h3>
                <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', margin: 0 }}>
                  Límite de demostración alcanzado.
                </p>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', background: 'rgba(0,0,0,0.88)', color: 'white', borderRadius: 3, padding: '3px 7px', flexShrink: 0, marginLeft: 12 }}>
                EDUCATION
              </span>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.80)',
              border: '1px solid rgba(0,0,0,0.07)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            }}>
              <p style={{
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: 11, lineHeight: 1.65, color: 'rgba(0,0,0,0.52)', margin: 0,
              }}>
                Para acceder al diagnóstico completo, simulaciones de escenarios y descarga del plan financiero en PDF, crea una cuenta gratuita en Financieramente...
              </p>
            </div>

            <motion.button
              onClick={() => router.push('/intake')}
              whileHover={{ scale: 1.02, opacity: 0.90 }}
              whileTap={{ scale: 0.97 }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#050810', border: 'none', borderRadius: 10,
                padding: '13px 20px', fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
                letterSpacing: '-0.01em',
              }}
            >
              Crea una cuenta para continuar <ArrowRight size={13} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
