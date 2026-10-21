'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Button, IconButton } from './Button';
import { Alert } from './feedback';
import { IconX } from './icons';

/**
 * Accessible modal built on the native <dialog>: focus is trapped by the browser (top layer),
 * Esc closes, focus returns to the element that opened it.
 * `modal` is the Organic dialog (sand surface, 32px radius); `drawer` is the right-hand panel.
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
  const pressedOnBackdrop = useRef(false);
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
      if (opener.current?.isConnected) opener.current.focus();
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
      // A click on the backdrop (the dialog box itself, outside the panel) closes it — but only one that also
      // started there: a text selection dragged out of the panel ends with a click on the dialog box too.
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
      className={
        drawer
          ? 'my-3 ml-auto mr-3 h-[calc(100dvh-24px)] w-[min(460px,calc(100vw-24px))] overflow-hidden rounded-[36px]'
          : 'm-auto w-[min(440px,calc(100vw-32px))] overflow-hidden rounded-[32px]'
      }
    >
      {open ? (
        drawer ? (
          <div className="animate-drawer-in flex h-full flex-col overflow-hidden rounded-[36px] bg-neutral-100 shadow-lg">
            <div className="flex items-start gap-3 px-6 pb-2 pt-6 sm:px-7 sm:pt-7">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-[25px]">
                  {title}
                </h2>
                {description ? (
                  <div id={descId} className="mt-1 text-sm text-neutral-700">
                    {description}
                  </div>
                ) : null}
              </div>
              <IconButton label="Закрыть" outlined onClick={onClose} className="size-10">
                <IconX />
              </IconButton>
            </div>
            {children ? (
              // Focusable and named, so the scrolling content can be read with the keyboard in every browser.
              <div role="region" aria-labelledby={titleId} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-6 py-3 sm:px-7">
                {children}
              </div>
            ) : null}
            {footer ? <div className="flex flex-wrap justify-between gap-2 px-5 pb-6 pt-4 sm:px-7">{footer}</div> : null}
          </div>
        ) : (
          <div className="animate-dialog-in flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-[32px] bg-surface p-[22px] shadow-lg">
            <div className="flex items-start gap-3">
              <h2 id={titleId} className="min-w-0 flex-1 pt-1.5 text-xl">
                {title}
              </h2>
              <IconButton label="Закрыть" onClick={onClose} className="-mr-1 -mt-1">
                <IconX />
              </IconButton>
            </div>
            {description ? (
              <div id={descId} className="text-sm leading-relaxed text-ink/85">
                {description}
              </div>
            ) : null}
            {children}
            {footer ? <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
          </div>
        )
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
  error,
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
  /** Shown inside the dialog (a toast would sit under the modal backdrop). */
  error?: string | null;
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
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} aria-disabled={busy || undefined}>
            {busy ? 'Подождите…' : confirmLabel}
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="error" role="alert">
          {error}
        </Alert>
      ) : null}
    </Dialog>
  );
}
