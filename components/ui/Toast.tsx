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

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, action?: ToastAction) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, tone, message, action }]);
      // Toasts with an action (e.g. «Отменить») stay longer so there is time to use it.
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === 'error' || action ? 8000 : 3500),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
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
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={
              'animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ' +
              (t.tone === 'error' ? 'bg-red-700 text-white ring-red-800' : 'bg-slate-900 text-white ring-slate-800')
            }
          >
            <span className="mt-0.5 shrink-0">
              {t.tone === 'error' ? <IconAlert size={16} /> : <IconCheck size={16} className={t.tone === 'success' ? 'text-emerald-300' : ''} />}
            </span>
            <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.onClick();
                }}
                className="-my-1 shrink-0 rounded px-2 py-1 font-semibold text-indigo-200 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Закрыть уведомление"
              className="-m-1 rounded p-1 text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
