'use client';

import { useEffect, useRef } from 'react';
import { formatDayTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { IconCheck } from '@/components/ui/icons';

export function SubmitSuccess({
  title,
  submittedAt,
  note,
  message,
  againLabel = 'Отправить ещё один ответ',
  onAgain,
  headingLevel = 'h1',
}: {
  title: string;
  submittedAt: string;
  note?: string;
  /** Replaces the default «Спасибо! Организатор … получил ваши ответы …» text. */
  message?: string;
  againLabel?: string;
  onAgain: () => void;
  /** h1 on the public page (it is the page's main heading), h2 inside the admin preview. */
  headingLevel?: 'h1' | 'h2';
}) {
  const Heading = headingLevel;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="@container">
      <div className="rounded-[36px] bg-neutral-100 px-6 py-12 shadow-sm @lg:px-9 @lg:py-14">
        <div className="grid size-[72px] place-items-center rounded-full bg-accent-2 text-neutral-100">
          <IconCheck size={32} />
        </div>
        <Heading ref={headingRef} tabIndex={-1} className="mb-0 mt-7 text-[30px] outline-none @lg:text-[36px]">
          Ответ отправлен
        </Heading>
        <p className="mb-0 mt-3 max-w-[440px] text-base text-neutral-800">
          {message ?? `Спасибо! Ваши ответы на форму «${title}» получены ${formatDayTime(submittedAt)}.`}
        </p>
        {note ? <p className="mb-0 mt-2 text-sm text-neutral-700">{note}</p> : null}
        <Button onClick={onAgain} className="mt-7 px-[22px]">
          {againLabel}
        </Button>
      </div>
    </div>
  );
}
