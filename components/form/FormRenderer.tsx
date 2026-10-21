'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LIMITS, isChoiceType, validateAnswers, type Answers, type ErrorMap, type Field } from '@/lib/schema';
import { buttonClasses } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/feedback';
import { IconAlert } from '@/components/ui/icons';

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

/** Turns untrusted stored data (a restored draft) into answers that fit the current fields. */
export function sanitizeAnswers(raw: unknown, fields: Field[]): DraftAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: DraftAnswers = {};
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(src, f.id)) continue;
    const v = src[f.id];
    if (f.type === 'checkbox') {
      if (typeof v === 'boolean') out[f.id] = v;
    } else if (f.type === 'multi_select') {
      if (Array.isArray(v)) {
        const ids = new Set(f.options.map((o) => o.id));
        out[f.id] = v.filter((x): x is string => typeof x === 'string' && ids.has(x));
      }
    } else if (f.type === 'select' || f.type === 'radio') {
      if (typeof v === 'string' && f.options.some((o) => o.id === v)) out[f.id] = v;
    } else if (typeof v === 'string') {
      out[f.id] = v.slice(0, LIMITS.long_text);
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
  initialAnswers,
  onAnswersChange,
  notice,
}: {
  form: RenderableForm;
  mode: 'public' | 'preview';
  onSubmit: (values: Answers) => Promise<SubmitOutcome>;
  /** Called after every user change of a field value (used for analytics in public mode). */
  onFieldChange?: (fieldId: string) => void;
  /** Answers to start from (e.g. a draft restored after a reload). */
  initialAnswers?: DraftAnswers;
  /** Receives every new set of answers (e.g. to keep a draft). */
  onAnswersChange?: (answers: DraftAnswers) => void;
  notice?: ReactNode;
}) {
  const { fields } = form;
  const [answers, setAnswers] = useState<DraftAnswers>(() => initialAnswers ?? {});
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
    onAnswersChange?.(next);
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
  const showSummary = attempted && errorCount > 0;

  return (
    <div className="@container">
      {mode === 'preview' ? (
        <p className="mb-4 flex items-center gap-2.5 rounded-full bg-accent-100 px-[18px] py-2.5 text-sm font-semibold text-accent-800">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
          Предпросмотр: ответы не сохраняются
        </p>
      ) : null}

      <div className="rounded-[36px] bg-neutral-100 px-5 pb-7 pt-8 shadow-sm @lg:px-9 @lg:pb-9 @lg:pt-10">
        <Heading className="m-0 text-[30px] text-pretty break-words @lg:text-[36px]">{form.title || 'Без названия'}</Heading>
        {form.description ? (
          <p className="mb-0 mt-3.5 whitespace-pre-wrap break-words text-base leading-[1.6] text-neutral-800">{form.description}</p>
        ) : null}
        {fields.some((f) => f.required) ? (
          <p className="mb-0 mt-4 text-[13px] text-neutral-700">
            <span aria-hidden="true" className="text-accent-700">
              *
            </span>{' '}
            — обязательные вопросы
          </p>
        ) : null}

        {notice ? <div className="mt-6">{notice}</div> : null}

        <form noValidate onSubmit={submit} className="mt-9 grid grid-cols-1 gap-[30px]" aria-label={form.title || 'Форма'}>
          {/* Only the count is a live region, so fixing answers doesn't re-read the whole list on every keystroke. */}
          <div className={showSummary ? 'rounded-[24px] bg-accent-100 px-5 py-4 text-sm text-accent-900 ring-1 ring-inset ring-accent-300' : 'contents'}>
            <p aria-live="polite" className={showSummary ? 'flex items-center gap-2 font-semibold' : 'sr-only'}>
              {showSummary ? (
                <>
                  <IconAlert size={16} />
                  Проверьте ответы: {errorCount === 1 ? 'есть 1 ошибка' : `ошибок — ${errorCount}`}
                </>
              ) : null}
            </p>
            {showSummary ? (
              <ul className="mb-0 mt-2 list-disc space-y-1 pl-6">
                {errorOrder.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`#${controlId(f.id)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        focusControl(f.id);
                      }}
                      className="text-accent-900 underline hover:text-accent-800"
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
            ) : null}
          </div>

          {fields.length === 0 ? (
            <p className="rounded-[26px] border border-dashed border-neutral-500 px-5 py-8 text-center text-neutral-700">
              В форме пока нет вопросов.
            </p>
          ) : (
            fields.map((field) => (
              <FieldControl
                key={field.id}
                field={field}
                value={answers[field.id]}
                error={errors[field.id]}
                onChange={(v) => change(field, v)}
                onBlur={blur}
              />
            ))
          )}

          {submitError ? (
            <div role="alert" className="rounded-[24px] bg-accent-200 px-5 py-4 text-sm leading-relaxed text-accent-900 ring-1 ring-inset ring-accent-400">
              {submitError}
            </div>
          ) : null}

          <div>
            <button
              type="submit"
              aria-disabled={submitting || fields.length === 0 || undefined}
              onClick={(e) => {
                // Inert while sending (but still focusable, so focus isn't lost).
                if (submitting || fields.length === 0) e.preventDefault();
              }}
              className={buttonClasses('primary', 'lg', 'w-full @lg:w-auto')}
            >
              {submitting ? (
                <>
                  <Spinner /> Отправка…
                </>
              ) : (
                'Отправить'
              )}
            </button>
            <p role="status" className="sr-only">
              {submitting ? 'Отправка…' : ''}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

function controlCls(invalid: boolean, extra = '', shape = 'rounded-full') {
  return (
    `mt-2.5 block w-full min-h-[50px] ${shape} border px-5 py-3 text-base leading-normal text-ink caret-accent ` +
    'placeholder:text-neutral-700 transition-colors focus-visible:border-accent ' +
    (invalid ? 'border-accent-700 bg-accent-100 ' : 'border-neutral-600 bg-bg hover:border-ink ') +
    extra
  );
}

function RequiredMark({ required }: { required: boolean }) {
  if (!required) return null;
  return (
    <>
      <span aria-hidden="true" className="ml-[3px] text-accent-700">
        *
      </span>
      <span className="sr-only"> (обязательное)</span>
    </>
  );
}

// Option cards: the card shows the focus ring for the native control inside it.
const optionCardBase =
  'flex cursor-pointer items-center gap-3 border bg-bg px-5 text-base transition-colors ' +
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-solid ';
const nativeChoice = 'size-5 shrink-0 cursor-pointer accent-accent-700 focus-visible:outline-none';

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
    <p id={hintId} className="mb-0 mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
      {field.hint}
    </p>
  ) : null;
  const errorEl = error ? (
    <p id={errorId} className="mb-0 mt-2 flex items-start gap-1.5 px-1 text-sm font-semibold text-accent-800">
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
      <fieldset aria-describedby={describedBy} className="m-0 min-w-0 border-0 p-0">
        <legend className="w-full p-0 text-base font-semibold leading-[1.35]">
          {label}
          <RequiredMark required={field.required} />
        </legend>
        {hint}
        {multi ? <p className="sr-only">Можно выбрать несколько вариантов</p> : null}
        <div className="mt-3 grid grid-cols-1 gap-2">
          {field.options.map((opt, i) => {
            const checked = multi ? selected.includes(opt.id) : value === opt.id;
            return (
              <label
                key={opt.id}
                className={
                  optionCardBase +
                  'min-h-[50px] rounded-full py-2.5 leading-snug ' +
                  (checked ? 'border-accent bg-accent-100' : invalid ? 'border-accent-700 hover:border-accent' : 'border-neutral-500 hover:border-accent')
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
                  className={nativeChoice}
                />
                <span className="min-w-0 break-words">{opt.label}</span>
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
            optionCardBase +
            'items-start rounded-[26px] py-4 font-semibold leading-[1.4] ' +
            (invalid ? 'border-accent-700' : value === true ? 'border-accent bg-accent-100' : 'border-neutral-500 hover:border-accent')
          }
        >
          <input
            {...common}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className={`${nativeChoice} mt-px`}
          />
          <span className="min-w-0 break-words">
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
          className={controlCls(invalid, 'resize-y py-3.5 leading-[1.55]', 'rounded-[26px]')}
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
        <select {...common} value={str} onChange={(e) => onChange(e.target.value)} className={controlCls(invalid, 'cursor-pointer pr-10')}>
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
      <p className="mb-0 mt-1 text-sm text-neutral-700">
        {field.min !== null && field.max !== null
          ? `От ${field.min} до ${field.max}`
          : field.min !== null
            ? `Не меньше ${field.min}`
            : `Не больше ${field.max}`}
      </p>
    ) : null;

  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold leading-[1.35]">
        {label}
        <RequiredMark required={field.required} />
      </label>
      {hint}
      {rangeHint}
      {control}
      {errorEl}
    </div>
  );
}
