import type { Metadata } from 'next';
import { NavGuardProvider } from '@/components/admin/NavGuard';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: { default: 'Формы откликов — админка', template: '%s · Формы откликов' },
  robots: { index: false },
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <ToastProvider>
      <NavGuardProvider>
        <main className="flex-1 pt-6">{children}</main>
      </NavGuardProvider>
    </ToastProvider>
  );
}
