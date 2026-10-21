'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconAlert, IconCheck, IconX } from './icons';

type ToastTone = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
}

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/**
 * Dark pill toasts at the bottom centre. Auto-dismiss pauses while the pointer is over a toast or focus
 * is inside one, so there is time to read it or reach its action.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, Timer>());
  const paused = useRef(false);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timers.current.delete(id);
    // A removed toast under the pointer never fires mouseleave: don't stay paused forever.
    if (timers.current.size === 0) paused.current = false;
  }, []);

  const start = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (!timer || timer.handle) return;
      timer.startedAt = Date.now();
      timer.handle = setTimeout(() => dismiss(id), timer.remaining);
    },
    [dismiss],
  );

  const pauseAll = useCallback(() => {
    paused.current = true;
    for (const timer of timers.current.values()) {
      if (!timer.handle) continue;
      clearTimeout(timer.handle);
      timer.handle = null;
      timer.remaining = Math.max(1000, timer.remaining - (Date.now() - timer.startedAt));
    }
  }, []);

  const resumeAll = useCallback(() => {
    paused.current = false;
    for (const id of timers.current.keys()) start(id);
  }, [start]);

  const push = useCallback(
    (tone: ToastTone, message: string, action?: ToastAction) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, tone, message, action }]);
      // Errors and toasts with an action (e.g. «Отменить») stay longer.
      timers.current.set(id, { handle: null, remaining: tone === 'error' || action ? 8000 : 3500, startedAt: 0 });
      if (!paused.current) start(id);
    },
    [start],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) if (t.handle) clearTimeout(t.handle);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push('success', m, a),
      error: (m, a) => push('error', m, a),
      info: (m, a) => push('info', m, a),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        onMouseEnter={pauseAll}
        onMouseLeave={resumeAll}
        onFocus={pauseAll}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resumeAll();
        }}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:pb-7"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={
              'animate-toast-in pointer-events-auto flex max-w-[min(32rem,100%)] items-center gap-2.5 rounded-full py-2 pl-5 pr-2 text-sm font-semibold shadow-lg ' +
              (t.tone === 'error' ? 'bg-accent-800 text-neutral-100' : 'bg-neutral-900 text-neutral-100')
            }
          >
            <span className="shrink-0">
              {t.tone === 'error' ? <IconAlert size={16} className="text-accent-300" /> : <IconCheck size={16} className="text-accent-2-300" />}
            </span>
            <p className="min-w-0 flex-1 py-1 leading-snug">{t.message}</p>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.onClick();
                }}
                className="shrink-0 cursor-pointer rounded-full px-3 py-1.5 font-semibold text-accent-300 underline-offset-2 hover:bg-neutral-100/10 hover:underline"
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Закрыть уведомление"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-100/10 hover:text-neutral-100"
            >
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
