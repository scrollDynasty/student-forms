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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1.5">
        <p className="m-0 text-[15px] text-neutral-700">Так форму увидит студент — с учётом несохранённых изменений.</p>
        <div role="group" aria-label="Ширина предпросмотра" className="inline-flex overflow-hidden rounded-full border border-neutral-500">
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={device === o.value}
              onClick={() => setDevice(o.value)}
              className={
                'inline-flex min-h-10 cursor-pointer items-center gap-1.5 px-3.5 text-[13px] font-semibold transition-colors focus-visible:-outline-offset-2 ' +
                (i > 0 ? 'border-l border-neutral-500 ' : '') +
                (device === o.value ? 'bg-accent-700 text-neutral-100' : 'text-ink hover:bg-ink/7')
              }
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`mx-auto transition-[max-width] ${device === 'mobile' ? 'max-w-[375px]' : 'max-w-[680px]'}`}>
        {doneAt ? (
          <SubmitSuccess
            title={draft.title || 'Без названия'}
            submittedAt={doneAt}
            message="Так студент увидит подтверждение после отправки."
            note="Это предпросмотр — ответ не сохранён."
            againLabel="Заполнить заново"
            headingLevel="h2"
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
  );
}
