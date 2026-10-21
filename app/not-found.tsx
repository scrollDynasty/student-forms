import type { Metadata } from 'next';
import { BackButton } from '@/components/ui/BackButton';

export const metadata: Metadata = { title: 'Страница не найдена' };

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-[72px] pt-12 sm:px-5 sm:pt-20">
      <div className="rounded-[36px] bg-neutral-100 px-6 py-12 shadow-sm sm:px-9 sm:py-14">
        <h1 className="m-0 text-[30px] sm:text-[36px]">Страница не найдена</h1>
        <p className="mb-0 mt-3 max-w-[460px] text-base leading-relaxed text-neutral-800">
          Проверьте адрес — возможно, в нём опечатка или страница была удалена. Если вы переходили по ссылке на форму, попросите
          прислать её ещё раз.
        </p>
        <div className="mt-7">
          <BackButton />
        </div>
      </div>
    </main>
  );
}
