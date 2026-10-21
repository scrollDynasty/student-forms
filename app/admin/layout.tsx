import type { Metadata } from 'next';
import { GuardedLink, NavGuardProvider } from '@/components/admin/NavGuard';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: { default: 'Формы откликов — админка', template: '%s · Формы откликов' },
  robots: { index: false },
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <ToastProvider>
      <NavGuardProvider>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
            <GuardedLink
              href="/admin"
              className="flex items-center gap-2 rounded-lg font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
                Ф
              </span>
              <span>Формы откликов</span>
            </GuardedLink>
            <span className="ml-3 hidden text-sm text-slate-500 sm:inline">для стажировок и мероприятий</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </NavGuardProvider>
    </ToastProvider>
  );
}
