'use client';

import { useState } from 'react';
import { FormRenderer, type SubmitOutcome } from '@/components/form/FormRenderer';
import { SubmitSuccess } from '@/components/form/SubmitSuccess';
import { IconMonitor, IconPhone } from '@/components/ui/icons';
import type { Draft } from './BuilderTab';

export function PreviewTab({ draft }: { draft: Draft }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  // Preview never calls the API: client validation only, then a local confirmation screen.
  async function submit(): Promise<SubmitOutcome> {
    setDoneAt(new Date().toISOString());
    return { ok: true };
  }

  const options = [
    { value: 'desktop' as const, label: 'Компьютер', icon: <IconMonitor size={16} /> },
    { value: 'mobile' as const, label: 'Телефон', icon: <IconPhone size={16} /> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">Так форму увидит студент. Показана текущая версия, включая несохранённые изменения.</p>
        <div role="group" aria-label="Ширина предпросмотра" className="inline-flex self-start rounded-lg bg-slate-100 p-1">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={device === o.value}
              onClick={() => setDevice(o.value)}
              className={
                'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ' +
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
                (device === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')
              }
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-indigo-50/80 to-background p-3 sm:p-8">
        <div className={`mx-auto transition-[max-width] ${device === 'mobile' ? 'max-w-[375px]' : 'max-w-2xl'}`}>
          {doneAt ? (
            <SubmitSuccess
              title={draft.title || 'Без названия'}
              submittedAt={doneAt}
              note="Это предпросмотр — ответ не сохранён."
              againLabel="Заполнить заново"
              onAgain={() => {
                setDoneAt(null);
                setRound((r) => r + 1);
              }}
            />
          ) : (
            <FormRenderer key={round} form={draft} mode="preview" onSubmit={submit} />
          )}
        </div>
      </div>
    </div>
  );
}
