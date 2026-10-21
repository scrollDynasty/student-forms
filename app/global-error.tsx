'use client'; // Error boundaries must be Client Components

// Replaces the root layout when it fails, so it brings its own <html>, <body>, styles and font.
import '@fontsource-variable/rubik';
import './globals.css';
import { useEffect } from 'react';

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-bg font-sans text-ink">
        <title>Ошибка · Формы откликов</title>
        <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-[72px] pt-12 sm:px-5 sm:pt-20">
          <div role="alert" className="rounded-[36px] bg-neutral-100 px-6 py-12 shadow-sm sm:px-9 sm:py-14">
            <h1 className="m-0 text-[30px] sm:text-[36px]">Сервис временно недоступен</h1>
            <p className="mb-0 mt-3 max-w-[460px] text-base leading-relaxed text-neutral-800">
              Произошла непредвиденная ошибка. Попробуйте ещё раз через минуту.
            </p>
            <button
              type="button"
              onClick={() => retry()}
              className="mt-7 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-accent-700 px-[22px] text-[15px] font-semibold text-neutral-100 hover:bg-accent-800"
            >
              Попробовать снова
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
