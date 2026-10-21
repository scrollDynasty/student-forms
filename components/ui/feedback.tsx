import type { ReactNode } from 'react';
import type { FormStatus } from '@/lib/api-client';
import { Button } from './Button';
import { IconAlert, IconInfo, IconRefresh } from './icons';

/** Organic tag: «Опубликована» on sage, «Черновик» on sand. */
export function StatusBadge({ status }: { status: FormStatus }) {
  const published = status === 'published';
  return (
    <span
      className={
        'inline-flex shrink-0 items-center rounded-xl px-2.5 py-[3px] text-xs font-medium tracking-[0.02em] ' +
        (published ? 'bg-accent-2-100 text-accent-2-800' : 'bg-neutral-200 text-neutral-800')
      }
    >
      {published ? 'Опубликована' : 'Черновик'}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-full bg-neutral-200 motion-reduce:animate-none ${className}`} />;
}

/** Screen-reader announcement for a loading placeholder. */
export function LoadingStatus({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
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
  info: 'bg-accent-2-100 text-accent-2-900',
  warning: 'bg-accent-100 text-accent-900 ring-1 ring-inset ring-accent-300',
  error: 'bg-accent-200 text-accent-900 ring-1 ring-inset ring-accent-400',
  success: 'bg-accent-2-200 text-accent-2-900',
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
    <div role={role} className={`flex gap-3 rounded-[24px] px-5 py-4 text-sm leading-relaxed ${toneCls[tone]} ${className}`}>
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
  headingLevel = 'h2',
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return (
    <div className="rounded-[32px] bg-neutral-100 px-6 py-10 sm:px-9 sm:py-12">
      {icon ? (
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-accent-2-200 text-accent-2-800">{icon}</div>
      ) : null}
      <Heading className="text-2xl">{title}</Heading>
      {children ? <div className="mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-700">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Не удалось загрузить данные', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[32px] bg-neutral-100 px-6 py-10 sm:px-9">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-accent-200 text-accent-800">
        <IconAlert size={24} />
      </div>
      <h2 className="text-2xl">{title}</h2>
      {message ? <p className="mt-2 max-w-xl text-[15px] text-neutral-700">{message}</p> : null}
      {onRetry ? (
        <Button className="mt-6" onClick={onRetry} icon={<IconRefresh size={16} />}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
