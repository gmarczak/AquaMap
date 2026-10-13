"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; actionLabel?: string; onAction?: () => void; onExpire?: () => void };
type Show = (toast: Omit<Toast, "id"> & { durationMs?: number }) => void;

const ToastContext = createContext<Show>(() => {});

export function useToast(): Show {
  return useContext(ToastContext);
}

/**
 * Jeden toast naraz, nad dolnym paskiem. Zamiast confirm(): akcję da się cofnąć,
 * a `onExpire` wykonuje się dopiero, gdy nikt nie kliknął "Cofnij".
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<Toast | null>(null);

  const finish = useCallback((runExpire: boolean) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (runExpire) current.current?.onExpire?.();
    current.current = null;
    setToast(null);
  }, []);

  const show: Show = useCallback(
    ({ durationMs = 5000, ...t }) => {
      if (current.current) finish(true);
      const next = { ...t, id: Date.now() };
      current.current = next;
      setToast(next);
      timer.current = window.setTimeout(() => finish(true), durationMs);
    },
    [finish],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
        {toast && (
          <div key={toast.id} role="status" className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-text px-5 py-3 text-bg shadow-lg">
            <span className="text-sm font-medium">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  finish(false);
                }}
                className="h-10 shrink-0 rounded-full px-3 text-sm font-bold underline underline-offset-4"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
