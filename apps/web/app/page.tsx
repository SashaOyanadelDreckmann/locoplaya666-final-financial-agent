'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type TodoColor = 'mint' | 'lavender' | 'peach' | 'sky';

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  color: TodoColor;
};

const STORAGE_KEY = 'financiera.todos.v1';

const SEED_TODOS: TodoItem[] = [
  { id: 'seed-1', text: 'Revisar gastos de la semana', done: false, color: 'mint' },
  { id: 'seed-2', text: 'Pagar la tarjeta de crédito', done: false, color: 'lavender' },
  { id: 'seed-3', text: 'Ahorrar para el viaje', done: true, color: 'peach' },
];

const COLORS: TodoColor[] = ['mint', 'lavender', 'peach', 'sky'];

function loadTodos(): TodoItem[] {
  if (typeof window === 'undefined') return SEED_TODOS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_TODOS;
    const parsed = JSON.parse(raw) as TodoItem[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_TODOS;
  } catch {
    return SEED_TODOS;
  }
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export default function HomePage() {
  const router = useRouter();
  const [todos, setTodos] = useState<TodoItem[]>(SEED_TODOS);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTodos(loadTodos());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const remaining = useMemo(() => todos.filter((t) => !t.done).length, [todos]);
  const completed = useMemo(() => todos.filter((t) => t.done).length, [todos]);
  const progress = todos.length === 0 ? 0 : Math.round((completed / todos.length) * 100);

  const filtered = useMemo(() => {
    if (filter === 'active') return todos.filter((t) => !t.done);
    if (filter === 'done') return todos.filter((t) => t.done);
    return todos;
  }, [todos, filter]);

  const addTodo = () => {
    const text = input.trim();
    if (!text) return;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    setTodos((prev) => [{ id: makeId(), text, done: false, color }, ...prev]);
    setInput('');
    inputRef.current?.focus();
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const removeTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const clearDone = () => {
    setTodos((prev) => prev.filter((t) => !t.done));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') addTodo();
  };

  return (
    <main className="hm">
      <style>{STYLES}</style>

      {/* ── Fondo ambiental ── */}
      <div className="hm__ambient" aria-hidden>
        <div className="hm__orb hm__orb--1" />
        <div className="hm__orb hm__orb--2" />
        <div className="hm__orb hm__orb--3" />
      </div>
      <div className="hm__grid" aria-hidden />

      <div className="hm__inner">
        {/* ── Topbar ── */}
        <header className="hm__top">
          <div className="hm__brand">
            <span className="hm__brand-mark">f</span>
            <span className="hm__brand-name">
              financiera<span className="hm__brand-thin">·mente</span>
            </span>
          </div>
          <nav className="hm__nav">
            <button className="hm__nav-link" onClick={() => router.push('/agent')}>
              Agente
            </button>
            <button className="hm__nav-link" onClick={() => router.push('/intake')}>
              Intake
            </button>
            <button className="hm__nav-cta" onClick={() => router.push('/login')}>
              Entrar
              <span className="hm__nav-cta-arrow">→</span>
            </button>
          </nav>
        </header>

        {/* ── Hero ── */}
        <section className="hm__hero">
          <span className="hm__badge">
            <span className="hm__badge-dot" />
            Tu copiloto financiero
          </span>
          <h1 className="hm__title">
            Organiza tu dinero
            <br />
            con <span className="hm__title-accent">claridad</span>
          </h1>
          <p className="hm__subtitle">
            Una lista simple para tus pendientes financieros. Rápida, privada y siempre contigo.
          </p>
        </section>

        {/* ── Tarjeta de pendientes ── */}
        <section className="hm__card">
          <div className="hm__card-glow" aria-hidden />

          <div className="hm__card-head">
            <div>
              <h2 className="hm__card-title">Pendientes</h2>
              <p className="hm__card-sub">
                {remaining === 0 ? 'Todo al día ✦' : `${remaining} por hacer`}
              </p>
            </div>
            <div className="hm__filters">
              {(['all', 'active', 'done'] as const).map((f) => (
                <button
                  key={f}
                  className={`hm__filter ${filter === f ? 'is-active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Hechos'}
                </button>
              ))}
            </div>
          </div>

          {/* barra de progreso */}
          <div className="hm__progress">
            <div className="hm__progress-bar" style={{ width: `${progress}%` }} />
          </div>

          <div className="hm__add">
            <input
              ref={inputRef}
              className="hm__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Agregar un pendiente…"
            />
            <button className="hm__add-btn" onClick={addTodo}>
              Agregar
            </button>
          </div>

          <ul className="hm__list">
            {filtered.length === 0 ? (
              <li className="hm__empty">No hay pendientes aquí.</li>
            ) : (
              filtered.map((todo) => (
                <li key={todo.id} className={`hm__item hm__item--${todo.color}`}>
                  <button
                    className={`hm__check ${todo.done ? 'is-done' : ''}`}
                    onClick={() => toggleTodo(todo.id)}
                    aria-label="Marcar como hecho"
                  >
                    {todo.done ? '✓' : ''}
                  </button>
                  <span className={`hm__item-text ${todo.done ? 'is-done' : ''}`}>
                    {todo.text}
                  </span>
                  <button
                    className="hm__delete"
                    onClick={() => removeTodo(todo.id)}
                    aria-label="Eliminar"
                  >
                    ×
                  </button>
                </li>
              ))
            )}
          </ul>

          <footer className="hm__card-foot">
            <span>{todos.length} en total</span>
            <button className="hm__clear" onClick={clearDone}>
              Limpiar hechos
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Estilos self-contained (estética premium estilo intake)
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
.hm {
  --bg: #050505;
  --ink: #ffffff;
  --muted: rgba(255,255,255,0.55);
  --faint: rgba(255,255,255,0.34);
  --line: rgba(255,255,255,0.08);
  --indigo: #6366f1;
  --purple: #a855f7;
  --blue: #3b82f6;

  min-height: 100vh;
  background:
    radial-gradient(1200px 800px at 20% -10%, rgba(99,102,241,0.18), transparent 55%),
    radial-gradient(1000px 700px at 90% 8%, rgba(168,85,247,0.14), transparent 50%),
    var(--bg);
  color: var(--ink);
  display: flex;
  justify-content: center;
  padding: 56px 24px 96px;
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Fondo ── */
.hm__ambient { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.hm__orb { position: absolute; border-radius: 50%; filter: blur(90px); }
.hm__orb--1 {
  width: 560px; height: 560px;
  background: radial-gradient(circle, rgba(99,102,241,0.22), transparent 60%);
  top: -200px; left: -120px; animation: hmFloat 18s ease-in-out infinite;
}
.hm__orb--2 {
  width: 520px; height: 520px;
  background: radial-gradient(circle, rgba(168,85,247,0.18), transparent 60%);
  bottom: -220px; right: -120px; animation: hmFloat 24s ease-in-out infinite reverse;
}
.hm__orb--3 {
  width: 360px; height: 360px;
  background: radial-gradient(circle, rgba(59,130,246,0.14), transparent 60%);
  top: 42%; left: 60%; animation: hmFloat 30s ease-in-out infinite;
}
@keyframes hmFloat {
  0%,100% { transform: translate(0,0); }
  50% { transform: translate(40px,40px); }
}

.hm__grid {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 70% 55% at 50% 25%, #000 25%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 70% 55% at 50% 25%, #000 25%, transparent 80%);
}

/* ── Layout ── */
.hm__inner { position: relative; z-index: 1; width: 100%; max-width: 560px; }

/* ── Topbar ── */
.hm__top {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 64px;
  animation: hmRise 0.7s cubic-bezier(0.16,1,0.3,1) both;
}
.hm__brand { display: flex; align-items: center; gap: 11px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
.hm__brand-mark {
  width: 28px; height: 28px; border-radius: 9px;
  background: linear-gradient(135deg, var(--indigo), var(--purple));
  box-shadow: 0 0 20px rgba(124,116,255,0.5);
  display: grid; place-items: center; font-size: 14px; font-weight: 700; color: #fff;
}
.hm__brand-thin { color: var(--faint); font-weight: 400; }
.hm__nav { display: flex; align-items: center; gap: 6px; }
.hm__nav-link {
  background: none; border: none; color: var(--muted);
  font-size: 14px; font-weight: 500; padding: 9px 14px; border-radius: 10px;
  cursor: pointer; transition: all 0.2s ease; font-family: inherit;
}
.hm__nav-link:hover { color: var(--ink); background: rgba(255,255,255,0.05); }
.hm__nav-cta {
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(255,255,255,0.06); border: 1px solid var(--line);
  color: var(--ink); font-size: 14px; font-weight: 600;
  padding: 9px 16px; border-radius: 11px; cursor: pointer;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  transition: all 0.2s ease; font-family: inherit;
}
.hm__nav-cta:hover { background: rgba(255,255,255,0.12); transform: translateY(-1px); }
.hm__nav-cta-arrow { transition: transform 0.2s ease; }
.hm__nav-cta:hover .hm__nav-cta-arrow { transform: translateX(3px); }

/* ── Hero ── */
.hm__hero { text-align: center; margin-bottom: 44px; }
.hm__badge {
  display: inline-flex; align-items: center; gap: 9px;
  padding: 7px 15px 7px 12px; border-radius: 100px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  margin-bottom: 24px;
  animation: hmRise 0.7s cubic-bezier(0.16,1,0.3,1) 0.05s both;
}
.hm__badge-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #34d399; box-shadow: 0 0 0 0 rgba(52,211,153,0.6);
  animation: hmPulse 2.4s ease-in-out infinite;
}
@keyframes hmPulse {
  0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.55); }
  70% { box-shadow: 0 0 0 8px rgba(52,211,153,0); }
  100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
}
.hm__title {
  font-size: clamp(38px, 6vw, 60px); font-weight: 600;
  letter-spacing: -0.035em; line-height: 1.02; margin: 0 0 18px;
  animation: hmRise 0.8s cubic-bezier(0.16,1,0.3,1) 0.12s both;
}
.hm__title-accent {
  background: linear-gradient(110deg, #c7c3ff 0%, var(--purple) 50%, var(--blue) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hm__subtitle {
  font-size: 17px; line-height: 1.6; color: var(--muted);
  max-width: 460px; margin: 0 auto;
  animation: hmRise 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s both;
}

/* ── Tarjeta ── */
.hm__card {
  position: relative; overflow: hidden;
  padding: 28px; border-radius: 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  border: 1px solid var(--line);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 30px 80px rgba(0,0,0,0.5);
  animation: hmRise 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s both;
}
.hm__card-glow {
  position: absolute; width: 320px; height: 320px; border-radius: 50%;
  background: radial-gradient(circle, rgba(124,116,255,0.16), transparent 65%);
  top: -140px; right: -80px; pointer-events: none;
}
.hm__card-head {
  position: relative; display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 18px;
}
.hm__card-title { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
.hm__card-sub { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.hm__filters {
  display: inline-flex; gap: 3px; padding: 3px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
}
.hm__filter {
  padding: 7px 13px; border: none; background: transparent;
  color: var(--faint); font-size: 12.5px; font-weight: 500;
  border-radius: 9px; cursor: pointer; transition: all 0.2s ease; font-family: inherit;
}
.hm__filter:hover { color: var(--muted); }
.hm__filter.is-active { background: rgba(255,255,255,0.1); color: var(--ink); box-shadow: 0 2px 10px rgba(0,0,0,0.25); }

/* progreso */
.hm__progress {
  position: relative; height: 5px; border-radius: 100px;
  background: rgba(255,255,255,0.06); overflow: hidden; margin-bottom: 20px;
}
.hm__progress-bar {
  height: 100%; border-radius: 100px;
  background: linear-gradient(90deg, var(--indigo), var(--purple), var(--blue));
  box-shadow: 0 0 14px rgba(124,116,255,0.6);
  transition: width 0.5s cubic-bezier(0.16,1,0.3,1);
}

/* añadir */
.hm__add { display: flex; gap: 10px; margin-bottom: 18px; }
.hm__input {
  flex: 1; padding: 13px 16px; border-radius: 13px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--line);
  color: var(--ink); font-size: 14.5px; font-family: inherit;
  transition: all 0.2s ease; outline: none;
}
.hm__input::placeholder { color: var(--faint); }
.hm__input:focus { border-color: rgba(124,116,255,0.5); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 3px rgba(124,116,255,0.12); }
.hm__add-btn {
  padding: 13px 22px; border-radius: 13px; border: 1px solid transparent;
  background: linear-gradient(135deg, #ffffff, #e7e6ff); color: #0a0a0a;
  font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
  box-shadow: 0 8px 24px rgba(124,116,255,0.25), inset 0 1px 0 rgba(255,255,255,0.6);
  transition: transform 0.18s ease, box-shadow 0.25s ease;
}
.hm__add-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(124,116,255,0.4); }
.hm__add-btn:active { transform: scale(0.97); }

/* lista */
.hm__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.hm__item {
  position: relative; display: flex; align-items: center; gap: 13px;
  padding: 14px 15px; border-radius: 14px;
  background: rgba(255,255,255,0.035); border: 1px solid var(--line);
  transition: all 0.2s ease;
  animation: hmItem 0.4s cubic-bezier(0.16,1,0.3,1) both;
}
.hm__item:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.14); transform: translateX(2px); }
.hm__item::before {
  content: ''; position: absolute; left: 0; top: 14%; bottom: 14%;
  width: 3px; border-radius: 100px; opacity: 0.9;
}
.hm__item--mint::before { background: #34d399; }
.hm__item--lavender::before { background: var(--purple); }
.hm__item--peach::before { background: #fb923c; }
.hm__item--sky::before { background: var(--blue); }

.hm__check {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 7px;
  border: 1.5px solid rgba(255,255,255,0.25); background: transparent;
  color: #0a0a0a; font-size: 13px; font-weight: 700; cursor: pointer;
  display: grid; place-items: center; transition: all 0.2s ease;
}
.hm__check:hover { border-color: rgba(255,255,255,0.5); }
.hm__check.is-done {
  background: linear-gradient(135deg, var(--indigo), var(--purple));
  border-color: transparent; box-shadow: 0 0 12px rgba(124,116,255,0.5);
}
.hm__item-text { flex: 1; font-size: 14.5px; color: var(--ink); transition: all 0.2s ease; }
.hm__item-text.is-done { color: var(--faint); text-decoration: line-through; }
.hm__delete {
  flex-shrink: 0; width: 26px; height: 26px; border-radius: 8px;
  border: none; background: transparent; color: var(--faint);
  font-size: 18px; line-height: 1; cursor: pointer; transition: all 0.2s ease;
}
.hm__delete:hover { background: rgba(251,113,133,0.15); color: #fb7185; }

.hm__empty { text-align: center; padding: 28px; color: var(--faint); font-size: 14px; }

/* footer */
.hm__card-foot {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--line);
  font-size: 12.5px; color: var(--faint);
}
.hm__clear {
  background: none; border: none; color: var(--muted);
  font-size: 12.5px; font-weight: 500; cursor: pointer; font-family: inherit;
  padding: 6px 10px; border-radius: 8px; transition: all 0.2s ease;
}
.hm__clear:hover { color: var(--ink); background: rgba(255,255,255,0.06); }

/* ── Animaciones ── */
@keyframes hmRise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes hmItem { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 560px) {
  .hm__nav-link { display: none; }
  .hm { padding: 36px 18px 72px; }
}

@media (prefers-reduced-motion: reduce) {
  .hm__orb, .hm__badge-dot,
  .hm__top, .hm__badge, .hm__title, .hm__subtitle, .hm__card, .hm__item { animation: none; }
}
`;
