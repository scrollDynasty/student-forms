import type { ReactNode } from 'react';
import type { FormStatus } from '@/lib/api-client';
import { Button } from './Button';
import { IconAlert, IconInfo, IconRefresh } from './icons';

export function StatusBadge({ status }: { status: FormStatus }) {
  const published = status === 'published';
  return (
    <span
      className={
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ' +
        (published ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20')
      }
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${published ? 'bg-emerald-600' : 'bg-slate-400'}`} />
      {published ? 'Опубликована' : 'Черновик'}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200/80 motion-reduce:animate-none ${className}`} />;
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none ${className}`}
    />
  );
}

type Tone = 'info' | 'warning' | 'error' | 'success';
const toneCls: Record<Tone, string> = {
  info: 'border-indigo-200 bg-indigo-50 text-indigo-950',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  error: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
};

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  role,
  className = '',
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
}) {
  const Icon = tone === 'error' || tone === 'warning' ? IconAlert : IconInfo;
  return (
    <div role={role} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${toneCls[tone]} ${className}`}>
      <Icon className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>
      ) : null}
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Не удалось загрузить данные', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-red-200 bg-white px-6 py-10 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <IconAlert size={22} />
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {message ? <p className="mt-2 max-w-md text-sm text-slate-600">{message}</p> : null}
      {onRetry ? (
        <Button className="mt-6" onClick={onRetry} icon={<IconRefresh size={16} />}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
