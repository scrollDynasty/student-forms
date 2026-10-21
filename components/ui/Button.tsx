import type { ComponentProps, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white shadow-sm hover:bg-accent-strong active:bg-indigo-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 shadow-xs hover:bg-slate-50 hover:border-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm sm:min-h-10',
  lg: 'min-h-12 px-5 text-base',
};

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, className = '', type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

type IconButtonProps = ComponentProps<'button'> & {
  label: string;
  tone?: 'default' | 'danger';
};

/** Square icon-only button; `label` becomes the accessible name and tooltip. */
export function IconButton({ label, tone = 'default', className = '', type = 'button', children, ...rest }: IconButtonProps) {
  const toneCls =
    tone === 'danger' ? 'text-slate-500 hover:bg-red-50 hover:text-red-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={
        'inline-flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
        'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ' +
        `${toneCls} ${className}`
      }
      {...rest}
    >
      {children}
    </button>
  );
}
