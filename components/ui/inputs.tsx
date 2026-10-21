import type { ComponentProps, ReactNode } from 'react';
import { IconAlert } from './icons';

/**
 * Organic pill input. Borders use neutral-600 (≥3:1 against the surface) so the field boundary is
 * perceivable; focus adds the accent border plus the global 2px accent outline.
 */
export function inputClasses(invalid = false, extra = '', shape = 'rounded-full') {
  // Callers may override the default height / font size; don't emit two competing utilities.
  const minH = /(^|\s)min-h-/.test(extra) ? '' : 'min-h-[46px] ';
  const size = /(^|\s)text-(\[|xs|sm|base|lg|xl)/.test(extra) ? '' : 'text-base ';
  return (
    `block w-full ${minH}${shape} border px-[14px] py-2 ${size}text-ink caret-accent ` +
    'placeholder:text-neutral-700 transition-colors focus-visible:border-accent ' +
    (invalid ? 'border-accent-700 bg-accent-100 ' : 'border-neutral-600 bg-surface hover:border-ink ') +
    extra
  ).trim();
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-[5px] block text-[13px] font-medium text-neutral-700">
      {children}
      {hint ? <span className="font-normal"> — {hint}</span> : null}
    </label>
  );
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 px-3 text-sm font-medium text-accent-800">
      <IconAlert size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

type TextInputProps = ComponentProps<'input'> & { invalid?: boolean };
export function TextInput({ invalid = false, className = '', ...rest }: TextInputProps) {
  return <input aria-invalid={invalid || undefined} className={inputClasses(invalid, className)} {...rest} />;
}

type TextAreaProps = ComponentProps<'textarea'> & { invalid?: boolean };
export function TextArea({ invalid = false, className = '', ...rest }: TextAreaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={inputClasses(invalid, `px-4 py-3 leading-normal ${className}`, 'rounded-[24px]')}
      {...rest}
    />
  );
}

/** On/off switch (role="switch") with a visible label and description. */
export function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-desc` : undefined}
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer items-center gap-3 rounded-full text-left"
    >
      <span
        aria-hidden="true"
        className={`relative h-7 w-[46px] shrink-0 rounded-full transition-colors ${checked ? 'bg-accent-700' : 'bg-neutral-600'}`}
      >
        <span
          className={`absolute left-[3px] top-[3px] size-[22px] rounded-full bg-neutral-100 shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : ''}`}
        />
      </span>
      <span>
        <span id={`${id}-label`} className="block text-[15px] font-semibold">
          {label}
        </span>
        {description ? (
          <span id={`${id}-desc`} className="block text-[13px] text-neutral-700">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
