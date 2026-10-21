'use client';

import { useEffect, useRef } from 'react';
import { formatDateTime } from '@/lib/format';
import { IconCheck } from '@/components/ui/icons';

export function SubmitSuccess({
  title,
  submittedAt,
  note,
  againLabel = 'Отправить ещё один ответ',
  onAgain,
}: {
  title: string;
  submittedAt: string;
  note?: string;
  againLabel?: string;
  onAgain: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-center shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" aria-hidden="true" />
      <div className="px-6 py-12 sm:px-10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
          <IconCheck size={28} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 focus:outline-none">
          Спасибо! Ваш ответ отправлен
        </h2>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          Форма «{title}» · {formatDateTime(submittedAt)}
        </p>
        {note ? <p className="mt-2 text-sm text-slate-500">{note}</p> : null}
        <button
          type="button"
          onClick={onAgain}
          className={
            'mt-8 inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-base font-medium text-slate-800 ' +
            'transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2'
          }
        >
          {againLabel}
        </button>
      </div>
    </div>
  );
}
