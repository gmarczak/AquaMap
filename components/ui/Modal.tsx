"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode };

/** Natywny <dialog>: pułapka fokusu, Esc i tło za darmo. Na telefonie wyjeżdża od dołu. */
export function Modal({ open, onClose, title, subtitle, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="mb-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[28px] border border-border bg-bg p-0 text-text backdrop:bg-black/50 sm:m-auto sm:w-[min(32rem,calc(100%-2rem))] sm:rounded-[28px]"
    >
      {open && (
        <div className="flex flex-col gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="font-serif text-2xl font-semibold">
                {title}
              </h2>
              {subtitle && <p className="mt-0.5 text-sm text-muted first-letter:uppercase">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Zamknij" className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-full text-muted">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
