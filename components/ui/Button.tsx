import type { ComponentProps, MouseEvent, ReactNode } from 'react';

// Organic buttons: pills, hover/pressed from the accent ramp, themed focus ring (globals.css),
// 45% opacity when disabled. `aria-disabled` keeps a control focusable but inert.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none no-underline ' +
  'transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-45';

// Filled buttons use the deep accent step so the cream label keeps ≥4.5:1 contrast.
const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-700 text-neutral-100 hover:bg-accent-800 hover:text-neutral-100 active:bg-accent-900 ' +
    'disabled:hover:bg-accent-700 aria-disabled:hover:bg-accent-700',
  secondary:
    'border border-neutral-400 text-ink hover:bg-ink/7 hover:text-ink active:bg-ink/14 ' +
    'disabled:hover:bg-transparent aria-disabled:hover:bg-transparent',
  ghost:
    'text-accent-700 hover:bg-accent/10 hover:text-accent-800 active:bg-accent/18 ' +
    'disabled:hover:bg-transparent aria-disabled:hover:bg-transparent',
  danger:
    'bg-accent-800 text-neutral-100 hover:bg-accent-900 hover:text-neutral-100 active:bg-ink ' +
    'disabled:hover:bg-accent-800 aria-disabled:hover:bg-accent-800',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-4 text-sm',
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-[52px] px-[34px] text-[17px]',
};

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

const isAriaDisabled = (v: ComponentProps<'button'>['aria-disabled']) => v === true || v === 'true';

function guard(ariaDisabled: ComponentProps<'button'>['aria-disabled'], onClick?: (e: MouseEvent<HTMLButtonElement>) => void) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    if (isAriaDisabled(ariaDisabled)) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, className = '', type = 'button', children, onClick, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      onClick={guard(rest['aria-disabled'], onClick)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

type IconButtonProps = ComponentProps<'button'> & {
  label: string;
  tone?: 'default' | 'danger';
  /** Outlined circle (btn-secondary btn-icon) instead of a bare icon. */
  outlined?: boolean;
  size?: 'sm' | 'md';
};

/** Round icon-only button; `label` becomes the accessible name and tooltip. */
export function IconButton({
  label,
  tone = 'default',
  outlined = false,
  size = 'sm',
  className = '',
  type = 'button',
  children,
  onClick,
  ...rest
}: IconButtonProps) {
  const toneCls =
    tone === 'danger'
      ? 'text-accent-700 hover:bg-accent-200 hover:text-accent-800 active:bg-accent-300'
      : 'text-neutral-700 hover:bg-neutral-300 hover:text-ink active:bg-neutral-400';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      onClick={guard(rest['aria-disabled'], onClick)}
      className={
        `inline-flex shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${size === 'md' ? 'size-[42px]' : 'size-[38px]'} ` +
        (outlined ? 'border border-neutral-400 ' : '') +
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ' +
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent ' +
        `${toneCls} ${className}`
      }
      {...rest}
    >
      {children}
    </button>
  );
}
