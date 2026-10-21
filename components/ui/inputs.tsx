import type { ComponentProps, ReactNode } from 'react';

export function inputClasses(invalid = false, extra = '') {
  return (
    'block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-xs placeholder:text-slate-400 ' +
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 sm:text-sm ' +
    (invalid
      ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30'
      : 'border-slate-300 hover:border-slate-400 focus-visible:border-accent focus-visible:ring-accent/25') +
    (extra ? ` ${extra}` : '')
  );
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-800">
      {children}
      {hint ? <span className="ml-1 font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-700">
      {children}
    </p>
  );
}

type TextInputProps = ComponentProps<'input'> & { invalid?: boolean };
export function TextInput({ invalid = false, className = '', ...rest }: TextInputProps) {
  return <input aria-invalid={invalid || undefined} className={inputClasses(invalid, className)} {...rest} />;
}

type TextAreaProps = ComponentProps<'textarea'> & { invalid?: boolean };
export function TextArea({ invalid = false, className = '', ...rest }: TextAreaProps) {
  return <textarea aria-invalid={invalid || undefined} className={inputClasses(invalid, `leading-relaxed ${className}`)} {...rest} />;
}

/** On/off switch with a visible label (role="switch"). */
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
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ' +
          (checked ? 'bg-accent' : 'bg-slate-300')
        }
      >
        <span
          aria-hidden="true"
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description ? (
          <span id={`${id}-desc`} className="block text-sm text-slate-500">
            {description}
          </span>
        ) : null}
      </label>
    </div>
  );
}
