'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LIMITS, isChoiceType, validateAnswers, type Answers, type ErrorMap, type Field } from '@/lib/schema';
import { Spinner } from '@/components/ui/feedback';
import { IconAlert, IconInfo } from '@/components/ui/icons';

/** What the user has typed so far; number fields stay strings until validateAnswers converts them. */
export type DraftValue = string | boolean | string[];
export type DraftAnswers = Record<string, DraftValue>;

export type SubmitOutcome = { ok: true } | { ok: false; fieldErrors?: ErrorMap; message?: string };

export interface RenderableForm {
  title: string;
  description: string;
  fields: Field[];
}

export const controlId = (fieldId: string) => `q-${fieldId}`;

/** Keeps answers only for fields (and options) that still exist with the same type. */
function pruneAnswers(answers: DraftAnswers, prevFields: Field[], fields: Field[]): DraftAnswers {
  const prevType = new Map(prevFields.map((f) => [f.id, f.type]));
  const out: DraftAnswers = {};
  for (const f of fields) {
    if (!(f.id in answers) || prevType.get(f.id) !== f.type) continue;
    const v = answers[f.id];
    if (isChoiceType(f.type)) {
      const ids = new Set(f.options.map((o) => o.id));
      if (Array.isArray(v)) out[f.id] = v.filter((id) => ids.has(id));
      else if (typeof v === 'string' && ids.has(v)) out[f.id] = v;
    } else {
      out[f.id] = v;
    }
  }
  return out;
}

const hasErrors = (e: ErrorMap) => Object.keys(e).length > 0;

function focusControl(fieldId: string) {
  const el = document.getElementById(controlId(fieldId));
  if (!el) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  el.focus({ preventScroll: true });
}

export function FormRenderer({
  form,
  mode,
  onSubmit,
  onFieldChange,
  notice,
}: {
  form: RenderableForm;
  mode: 'public' | 'preview';
  onSubmit: (values: Answers) => Promise<SubmitOutcome>;
  /** Called after every user change of a field value (used for analytics in public mode). */
  onFieldChange?: (fieldId: string) => void;
  notice?: ReactNode;
}) {
  const { fields } = form;
  const [answers, setAnswers] = useState<DraftAnswers>({});
  const [errors, setErrors] = useState<ErrorMap>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // When the form definition changes (e.g. 409 FORM_CHANGED), keep answers for fields that still exist.
  const [prevFields, setPrevFields] = useState(fields);
  if (prevFields !== fields) {
    setPrevFields(fields);
    setAnswers((a) => pruneAnswers(a, prevFields, fields));
    setErrors({});
  }

  const errorOrder = fields.filter((f) => errors[f.id]);
  // Errors keyed by something other than a known field id (rare server-side keys) are shown in the summary only.
  const otherErrors = Object.entries(errors).filter(([k]) => !fields.some((f) => f.id === k));

  function revalidate(next: DraftAnswers) {
    setErrors(validateAnswers(fields, next).errors);
  }

  function change(field: Field, value: DraftValue) {
    const next = { ...answers, [field.id]: value };
    setAnswers(next);
    if (attempted) revalidate(next);
    onFieldChange?.(field.id);
  }

  function blur() {
    if (attempted) revalidate(answers);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    setAttempted(true);
    setSubmitError(null);
    const { values, errors: found } = validateAnswers(fields, answers);
    setErrors(found);
    if (hasErrors(found)) {
      const first = fields.find((f) => found[f.id]);
      if (first) requestAnimationFrame(() => focusControl(first.id));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const outcome = await onSubmit(values);
      if (!outcome.ok) {
        if (outcome.fieldErrors && hasErrors(outcome.fieldErrors)) {
          const fe = outcome.fieldErrors;
          setErrors(fe);
          const first = fields.find((f) => fe[f.id]);
          if (first) requestAnimationFrame(() => focusControl(first.id));
        }
        if (outcome.message) setSubmitError(outcome.message);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const Heading = mode === 'preview' ? 'h2' : 'h1';
  const errorCount = errorOrder.length + otherErrors.length;

  return (
    <div className="@container overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400" aria-hidden="true" />
      <div className="px-5 py-6 @lg:px-8 @lg:py-8">
        {mode === 'preview' ? (
          <p className="mb-5 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
            <IconInfo size={16} className="shrink-0" />
            Предпросмотр: ответы не сохраняются
          </p>
        ) : null}

        <Heading className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 @lg:text-[1.75rem]">
          {form.title || 'Без названия'}
        </Heading>
        {form.description ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-slate-600">{form.description}</p>
        ) : null}
        {fields.some((f) => f.required) ? (
          <p className="mt-4 text-sm text-slate-500">
            <span aria-hidden="true" className="text-red-600">
              *
            </span>{' '}
            — обязательные вопросы
          </p>
        ) : null}

        {notice ? <div className="mt-5">{notice}</div> : null}

        <form noValidate onSubmit={submit} className="mt-6" aria-label={form.title || 'Форма'}>
          <div aria-live="polite">
            {attempted && errorCount > 0 ? (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                <p className="flex items-center gap-2 font-semibold">
                  <IconAlert size={16} />
                  Проверьте ответы: {errorCount === 1 ? 'есть 1 ошибка' : `ошибок — ${errorCount}`}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  {errorOrder.map((f) => (
                    <li key={f.id}>
                      <a
                        href={`#${controlId(f.id)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          focusControl(f.id);
                        }}
                        className="underline underline-offset-2 hover:text-red-700"
                      >
                        {f.label || 'Вопрос'}
                      </a>
                      : {errors[f.id]}
                    </li>
                  ))}
                  {otherErrors.map(([k, msg]) => (
                    <li key={k}>{msg}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {fields.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-slate-500">
              В форме пока нет вопросов.
            </p>
          ) : (
            <div className="space-y-7">
              {fields.map((field) => (
                <FieldControl
                  key={field.id}
                  field={field}
                  value={answers[field.id]}
                  error={errors[field.id]}
                  onChange={(v) => change(field, v)}
                  onBlur={blur}
                />
              ))}
            </div>
          )}

          {submitError ? (
            <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900">
              {submitError}
            </div>
          ) : null}

          <div className="mt-8">
            <button
              type="submit"
              disabled={submitting || fields.length === 0}
              className={
                'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-sm ' +
                'transition-colors hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ' +
                'disabled:cursor-not-allowed disabled:opacity-60 @lg:w-auto'
              }
            >
              {submitting ? (
                <>
                  <Spinner /> Отправка…
                </>
              ) : (
                'Отправить'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const controlCls = (invalid: boolean) =>
  'block w-full min-h-12 rounded-xl border bg-white px-4 py-3 text-base leading-normal text-slate-900 placeholder:text-slate-500 ' +
  'transition-colors focus:outline-none focus-visible:ring-4 ' +
  (invalid
    ? 'border-red-500 focus-visible:ring-red-500/20'
    : 'border-slate-300 hover:border-slate-400 focus-visible:border-accent focus-visible:ring-accent/20');

function RequiredMark({ required }: { required: boolean }) {
  if (!required) return null;
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-red-600">
        *
      </span>
      <span className="sr-only"> (обязательное)</span>
    </>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
  onBlur,
}: {
  field: Field;
  value: DraftValue | undefined;
  error?: string;
  onChange: (v: DraftValue) => void;
  onBlur: () => void;
}) {
  const id = controlId(field.id);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [field.hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const invalid = Boolean(error);
  const label = field.label || 'Вопрос без названия';
  const str = typeof value === 'string' ? value : '';

  const hint = field.hint ? (
    <p id={hintId} className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
      {field.hint}
    </p>
  ) : null;
  const errorEl = error ? (
    <p id={errorId} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-red-700">
      <IconAlert size={16} className="mt-0.5 shrink-0" />
      {error}
    </p>
  ) : null;

  const common = {
    id,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    'aria-required': field.required || undefined,
    onBlur,
  };

  if (field.type === 'radio' || field.type === 'multi_select') {
    const multi = field.type === 'multi_select';
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset aria-describedby={describedBy}>
        <legend className="text-base font-medium leading-snug text-slate-900">
          {label}
          <RequiredMark required={field.required} />
        </legend>
        {hint}
        {multi ? <p className="sr-only">Можно выбрать несколько вариантов</p> : null}
        <div className="mt-3 space-y-2">
          {field.options.map((opt, i) => {
            const checked = multi ? selected.includes(opt.id) : value === opt.id;
            return (
              <label
                key={opt.id}
                className={
                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-base leading-snug transition-colors ' +
                  'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/20 ' +
                  (checked ? 'border-accent bg-accent-soft/60' : invalid ? 'border-red-300 hover:bg-slate-50' : 'border-slate-200 hover:bg-slate-50')
                }
              >
                <input
                  id={i === 0 ? id : undefined}
                  type={multi ? 'checkbox' : 'radio'}
                  name={id}
                  value={opt.id}
                  checked={checked}
                  aria-invalid={invalid || undefined}
                  onBlur={onBlur}
                  onChange={(e) => {
                    if (multi) {
                      const set = new Set(selected);
                      if (e.target.checked) set.add(opt.id);
                      else set.delete(opt.id);
                      onChange(field.options.map((o) => o.id).filter((oid) => set.has(oid)));
                    } else {
                      onChange(opt.id);
                    }
                  }}
                  className="size-5 shrink-0 accent-indigo-600 focus:outline-none"
                />
                <span className="min-w-0 break-words text-slate-800">{opt.label}</span>
              </label>
            );
          })}
        </div>
        {errorEl}
      </fieldset>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <div>
        <label
          className={
            'flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-base leading-snug transition-colors ' +
            'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/20 ' +
            (invalid ? 'border-red-400' : value === true ? 'border-accent bg-accent-soft/60' : 'border-slate-200 hover:bg-slate-50')
          }
        >
          <input
            {...common}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-indigo-600 focus:outline-none"
          />
          <span className="min-w-0 break-words font-medium text-slate-900">
            {label}
            <RequiredMark required={field.required} />
          </span>
        </label>
        {hint}
        {errorEl}
      </div>
    );
  }

  let control: ReactNode;
  switch (field.type) {
    case 'long_text':
      control = (
        <textarea
          {...common}
          rows={5}
          maxLength={LIMITS.long_text}
          placeholder={field.placeholder || undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={`${controlCls(invalid)} resize-y leading-relaxed`}
        />
      );
      break;
    case 'email':
      control = (
        <input
          {...common}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={LIMITS.email}
          placeholder={field.placeholder || undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={controlCls(invalid)}
        />
      );
      break;
    case 'phone':
      control = (
        <input
          {...common}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={LIMITS.phone}
          placeholder={field.placeholder || undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={controlCls(invalid)}
        />
      );
      break;
    case 'number':
      control = (
        <input
          {...common}
          type="number"
          inputMode="decimal"
          step="any"
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          placeholder={field.placeholder || undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={controlCls(invalid)}
        />
      );
      break;
    case 'date':
      control = (
        <input
          {...common}
          type="date"
          min="1900-01-01"
          max="2100-12-31"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={controlCls(invalid)}
        />
      );
      break;
    case 'select':
      control = (
        <select {...common} value={str} onChange={(e) => onChange(e.target.value)} className={`${controlCls(invalid)} pr-10`}>
          <option value="">Выберите…</option>
          {field.options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      );
      break;
    default:
      control = (
        <input
          {...common}
          type="text"
          maxLength={LIMITS.short_text}
          placeholder={field.placeholder || undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={controlCls(invalid)}
        />
      );
  }

  const rangeHint =
    field.type === 'number' && (field.min !== null || field.max !== null) ? (
      <p className="mt-1 text-sm text-slate-500">
        {field.min !== null && field.max !== null
          ? `От ${field.min} до ${field.max}`
          : field.min !== null
            ? `Не меньше ${field.min}`
            : `Не больше ${field.max}`}
      </p>
    ) : null;

  return (
    <div>
      <label htmlFor={id} className="block text-base font-medium leading-snug text-slate-900">
        {label}
        <RequiredMark required={field.required} />
      </label>
      {hint}
      {rangeHint}
      <div className="mt-2.5">{control}</div>
      {errorEl}
    </div>
  );
}
