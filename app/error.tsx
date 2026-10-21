'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { IconAlert, IconRefresh } from '@/components/ui/icons';

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;

  return (
    <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-[72px] pt-12 sm:px-5 sm:pt-20">
      <div role="alert" className="rounded-[36px] bg-neutral-100 px-6 py-12 shadow-sm sm:px-9 sm:py-14">
        <div className="grid size-[72px] place-items-center rounded-full bg-accent-200 text-accent-800">
          <IconAlert size={30} />
        </div>
        <h1 className="mb-0 mt-7 text-[30px] sm:text-[36px]">Что-то пошло не так</h1>
        <p className="mb-0 mt-3 max-w-[460px] text-base leading-relaxed text-neutral-800">
          Страница не смогла загрузиться из-за непредвиденной ошибки. Попробуйте ещё раз — обычно это помогает.
        </p>
        {digest ? <p className="mb-0 mt-2 text-sm text-neutral-700">Код ошибки: {digest}</p> : null}
        <Button variant="primary" onClick={() => retry()} icon={<IconRefresh />} className="mt-7 px-[22px]">
          Попробовать снова
        </Button>
      </div>
    </main>
  );
}
