'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Guion del chat (se reproduce en loop) ───────────────────────────────────
type Role = 'user' | 'ai';
interface ScriptMsg {
  role: Role;
  text: string;
}

const SCRIPT: ScriptMsg[] = [
  { role: 'user', text: '¿Cuánto debería ahorrar al mes?' },
  {
    role: 'ai',
    text: 'Con tu perfil —ingreso $1.2M, gastos fijos $820K— puedes ahorrar un 18% mensual sin sacrificar calidad de vida. Empezaría automatizando ese monto el día de pago.',
  },
  { role: 'user', text: '¿Y cómo mejoro mi score crediticio?' },
  {
    role: 'ai',
    text: 'Tu deuda más urgente es la tarjeta a 36 meses. Priorizarla reduce tu carga financiera un 23% y mejora tu perfil en unos 4–6 meses.',
  },
];

const SILK = [0.22, 1, 0.36, 1] as const;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface LiveMsg {
  id: number;
  role: Role;
  text: string;
}

export default function LiveChatDemo() {
  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al fondo cuando cambian los mensajes o el indicador
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  // Secuencia auto-animada en loop
  useEffect(() => {
    let cancelled = false;
    let uid = 0;

    async function run() {
      while (!cancelled) {
        setMessages([]);
        setTyping(false);
        await sleep(700);

        for (const m of SCRIPT) {
          if (cancelled) return;

          if (m.role === 'user') {
            setMessages((prev) => [...prev, { id: ++uid, role: 'user', text: m.text }]);
            await sleep(1000);
          } else {
            setTyping(true);
            await sleep(1300);
            if (cancelled) return;
            setTyping(false);

            const id = ++uid;
            setMessages((prev) => [...prev, { id, role: 'ai', text: '' }]);

            // Efecto typewriter
            for (let i = 1; i <= m.text.length; i++) {
              if (cancelled) return;
              const partial = m.text.slice(0, i);
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.id === id) copy[copy.length - 1] = { ...last, text: partial };
                return copy;
              });
              await sleep(16);
            }
            await sleep(1600);
          }
        }
        await sleep(2600); // pausa antes de reiniciar
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0e16]/80 backdrop-blur-sm"
      style={{ boxShadow: '0 24px 60px -20px rgba(0,0,0,0.7)' }}
    >
      {/* Barra superior estilo ventana */}
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <div className="ml-1.5 flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6f8fa6] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#6f8fa6]" />
          </span>
          <span className="text-[11px] font-medium tracking-tight text-white/45">
            Financieramente · Asesor IA
          </span>
        </div>
      </div>

      {/* Mensajes */}
      <div
        ref={scrollRef}
        className="flex h-[340px] flex-col gap-2.5 overflow-y-auto px-4 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.45, ease: SILK }}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[82%] rounded-[16px_16px_4px_16px] bg-[#6f8fa6] px-3.5 py-2.5 text-[13.5px] leading-relaxed tracking-tight text-white'
                    : 'max-w-[82%] rounded-[16px_16px_16px_4px] border border-white/[0.06] bg-[#12161e] px-3.5 py-2.5 text-[13.5px] leading-relaxed tracking-tight text-white/75'
                }
              >
                {m.text}
                {m.role === 'ai' && m.text.length > 0 && (
                  <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-[#a48f4f]" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Indicador de escribiendo */}
        <AnimatePresence>
          {typing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-1.5 rounded-[16px_16px_16px_4px] border border-white/[0.06] bg-[#12161e] px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-white/40"
                    animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
