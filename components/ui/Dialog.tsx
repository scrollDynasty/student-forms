'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Button, IconButton } from './Button';
import { IconX } from './icons';

/**
 * Accessible modal built on the native <dialog>: focus is trapped by the browser (top layer),
 * Esc closes, focus returns to the element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dlg.showModal();
      const target = initialFocusRef?.current;
      if (target) target.focus();
    } else if (!open && dlg.open) {
      dlg.close();
      opener.current?.focus();
    }
  }, [open, initialFocusRef]);

  useEffect(() => {
    const dlg = ref.current;
    return () => {
      if (dlg?.open) dlg.close();
    };
  }, []);

  const drawer = variant === 'drawer';
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog box itself, outside the panel) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
      className={
        drawer
          ? 'm-0 ml-auto h-dvh w-full max-w-xl outline-none sm:w-[min(36rem,100vw)]'
          : 'm-auto w-[calc(100vw-2rem)] max-w-md outline-none'
      }
    >
      {open ? (
        <div
          className={
            drawer
              ? 'animate-drawer-in flex h-full flex-col bg-white shadow-2xl'
              : 'flex max-h-[85dvh] flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5'
          }
        >
          <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description ? (
                <div id={descId} className="mt-1 text-sm leading-relaxed text-slate-600">
                  {description}
                </div>
              ) : null}
            </div>
            <IconButton label="Закрыть" onClick={onClose} className="-mr-2 -mt-1">
              <IconX />
            </IconButton>
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      description={message}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Подождите…' : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
