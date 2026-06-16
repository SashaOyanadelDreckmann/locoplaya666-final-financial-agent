'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInterviewStore } from '@/state/interview.store';
import {
  buildBootScriptLines,
  clearAgentBootFromIntake,
  shouldShowAgentBootSequence,
  type BootScriptLine,
} from './agent-boot-sequence.helpers';

type BootPhase = 'void' | 'terminal' | 'running' | 'exit';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function toneClass(tone: BootScriptLine['tone']): string {
  return `agent-boot-line--${tone}`;
}

export type AgentBootHandoffOrigin = { x: number; y: number };

export function AgentBootSequence(props: {
  session: { name?: string | null; injectedIntake?: unknown };
  onHandoff?: (origin: AgentBootHandoffOrigin) => void;
  onComplete: () => void;
}) {
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const fromIntakeHandoff = useMemo(() => shouldShowAgentBootSequence(), []);
  const storeIntake = useInterviewStore((s) => s.intake);
  const scriptSession = useMemo(() => {
    if (props.session?.injectedIntake) return props.session;
    if (!storeIntake) return props.session;
    return {
      ...props.session,
      injectedIntake: { intake: storeIntake },
    };
  }, [props.session, storeIntake]);
  const lines = useMemo(() => buildBootScriptLines(scriptSession), [scriptSession]);
  const [phase, setPhase] = useState<BootPhase>('void');
  const [visibleCount, setVisibleCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const codeRef = useRef<HTMLPreElement | null>(null);
  const exitStartedRef = useRef(false);
  const skipStartedRef = useRef(false);
  const firstName =
    String(props.session?.name ?? '')
      .split(' ')[0]
      ?.trim() || 'usuario';

  const runExit = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    setPhase('exit');

    const rect = terminalRef.current?.getBoundingClientRect();
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.42 }
      : { x: window.innerWidth / 2, y: window.innerHeight * 0.38 };

    props.onHandoff?.(origin);

    const finish = () => {
      clearAgentBootFromIntake();
      props.onComplete();
    };

    if (reducedMotion) {
      finish();
      return;
    }

    const overlay = overlayRef.current;
    const stage = overlay?.querySelector<HTMLElement>('.agent-boot-stage');
    const handoffMs = 560;
    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

    const animations: Promise<unknown>[] = [];

    if (stage && typeof stage.animate === 'function') {
      animations.push(
        stage
          .animate(
            {
              opacity: [1, 0],
              transform: ['translateY(0px) scale(1)', 'translateY(-6px) scale(0.96)'],
            },
            { duration: handoffMs, easing, fill: 'forwards' },
          )
          .finished,
      );
    }

    if (overlay && typeof overlay.animate === 'function') {
      animations.push(
        overlay
          .animate(
            {
              opacity: [1, 0],
              backgroundColor: ['rgba(0,0,0,1)', 'rgba(0,0,0,0)'],
            },
            { duration: handoffMs + 180, easing, fill: 'forwards' },
          )
          .finished,
      );
    }

    if (animations.length > 0) {
      Promise.all(animations).then(finish).catch(finish);
      return;
    }

    window.setTimeout(finish, handoffMs + 180);
  }, [props, reducedMotion]);

  const skipToAgent = useCallback(() => {
    if (skipStartedRef.current || exitStartedRef.current) return;
    skipStartedRef.current = true;
    setVisibleCount(lines.length);
    setProgress(100);
    runExit();
  }, [lines.length, runExit]);

  useEffect(() => {
    if (phase === 'exit') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        skipToAgent();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, skipToAgent]);

  useEffect(() => {
    document.documentElement.classList.add('agent-boot-active');
    document.body.classList.add('agent-boot-active');
    return () => {
      document.documentElement.classList.remove('agent-boot-active');
      document.body.classList.remove('agent-boot-active');
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      const t1 = window.setTimeout(() => setPhase('terminal'), 120);
      const t2 = window.setTimeout(() => {
        setVisibleCount(lines.length);
        setProgress(100);
      }, 280);
      const t3 = window.setTimeout(() => runExit(), 720);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
      };
    }

    const tVoid = window.setTimeout(() => setPhase('terminal'), fromIntakeHandoff ? 100 : 680);
    const tRun = window.setTimeout(() => setPhase('running'), fromIntakeHandoff ? 460 : 1180);

    return () => {
      window.clearTimeout(tVoid);
      window.clearTimeout(tRun);
    };
  }, [fromIntakeHandoff, lines.length, reducedMotion, runExit]);

  useEffect(() => {
    if (phase !== 'running' || reducedMotion) return;

    let cancelled = false;
    let index = 0;
    let timer: number | null = null;

    const revealNext = () => {
      if (cancelled) return;
      index += 1;
      setVisibleCount(index);
      setProgress(Math.round((index / lines.length) * 100));

      const el = codeRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }

      if (index >= lines.length) {
        timer = window.setTimeout(() => runExit(), 920);
        return;
      }

      const pause = lines[index - 1]?.pauseMs ?? 72;
      timer = window.setTimeout(revealNext, pause);
    };

    timer = window.setTimeout(revealNext, 140);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [phase, lines, reducedMotion, runExit]);

  const visibleLines = lines.slice(0, visibleCount);

  return (
    <div
      ref={overlayRef}
      className={`agent-boot-overlay${fromIntakeHandoff ? ' is-intake-handoff' : ''}${
        phase === 'void' ? ' is-void' : ''
      }${phase === 'terminal' ? ' is-terminal-enter' : ''}${
        phase === 'running' ? ' is-running' : ''
      }${phase === 'exit' ? ' is-exit' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Inicializando agente financiero"
      aria-busy={phase !== 'exit'}
    >
      <div className="agent-boot-overlay__backdrop" aria-hidden="true" />

      <div className="agent-boot-void" aria-hidden="true">
        <div className="agent-boot-void-vignette" />
        <div className="agent-boot-void-pulse" />
      </div>

      <div className="agent-boot-scanline" aria-hidden="true" />

      <div className="agent-boot-stage">
        <div className="agent-boot-blob-frame" aria-hidden="true">
          <div className="agent-boot-blob" />
          <div className="agent-boot-blob-glass" />
        </div>

        <div ref={terminalRef} className="agent-boot-terminal-shell terminal-composer-shell">
          <div className="agent-boot-terminal-glow" aria-hidden="true" />
          <div className="agent-input terminal-composer agent-boot-terminal">
            <header className="agent-boot-terminal-header">
              <div className="agent-boot-terminal-header__chrome">
                <div className="controls terminal-composer-controls agent-boot-controls" aria-hidden="true">
                  <span className="agent-boot-control-dot" />
                  <span className="agent-boot-control-dot is-amber" />
                  <span className="agent-boot-control-dot is-green" />
                  <span className="agent-boot-control-caption">intake → knowledge → agent</span>
                </div>

                {phase !== 'exit' ? (
                  <button
                    type="button"
                    className="agent-boot-skip agent-boot-skip--inline"
                    onClick={skipToAgent}
                    aria-label="Entrar al agente sin esperar la sincronización completa"
                  >
                    <span className="agent-boot-skip__label">Entrar</span>
                    <span className="agent-boot-skip__hint">Esc</span>
                  </button>
                ) : null}
              </div>

              <div className="terminal-composer-head agent-boot-terminal-head">
                <span className="agent-boot-terminal-prompt">$</span>
                <span className="agent-boot-terminal-cmd">financieramente — hydrate_profile</span>
                <span className="agent-boot-terminal-badge">v2</span>
              </div>

              <div className="agent-boot-status-row">
                <span className="agent-boot-status-label">
                  {phase === 'running' && visibleCount < lines.length
                    ? 'procesando intake…'
                    : phase === 'exit'
                      ? 'desplegando agente…'
                      : `sincronizando perfil de ${firstName}`}
                </span>
                <span className="agent-boot-status-pct">{progress}%</span>
              </div>

              <div className="agent-boot-progress" aria-hidden="true">
                <span className="agent-boot-progress-fill" style={{ width: `${progress}%` }}>
                  <span className="agent-boot-progress-shimmer" />
                </span>
              </div>
            </header>

            <pre
              ref={codeRef}
              className="agent-boot-code"
              aria-live="polite"
              aria-atomic="false"
            >
              {visibleLines.map((line) => (
                <code
                  key={line.id}
                  className={`agent-boot-line ${toneClass(line.tone)}${
                    line.id === visibleLines[visibleLines.length - 1]?.id && phase === 'running'
                      ? ' is-typing'
                      : ''
                  }`}
                >
                  {line.text || '\u00A0'}
                </code>
              ))}
              {phase === 'running' && visibleCount < lines.length ? (
                <span className="agent-boot-cursor" aria-hidden="true" />
              ) : null}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
