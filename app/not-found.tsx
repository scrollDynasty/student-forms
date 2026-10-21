import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-accent">Ошибка 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Страница не найдена</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          Возможно, ссылка устарела или в адресе опечатка. Если вы искали форму отклика — попросите организатора прислать ссылку ещё раз.
        </p>
        <Link href="/admin" className={buttonClasses('primary', 'md', 'mt-8')}>
          Перейти к формам
        </Link>
      </div>
    </main>
  );
}
