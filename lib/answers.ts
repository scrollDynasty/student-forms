// Student-side answer logic shared by the public form and the preview, kept free of React and the DOM.
import { LIMITS, isChoiceType, type ErrorMap, type Field } from '@/lib/schema';

/** What the user has typed so far; number fields stay strings until validateAnswers converts them. */
export type DraftValue = string | boolean | string[];
export type DraftAnswers = Record<string, DraftValue>;

/** Keeps answers only for fields (and options) that still exist with the same type. */
export function pruneAnswers(answers: DraftAnswers, prevFields: Field[], fields: Field[]): DraftAnswers {
  const prevType = new Map(prevFields.map((f) => [f.id, f.type]));
  const out: DraftAnswers = {};
  for (const f of fields) {
    const v = answers[f.id];
    if (v === undefined || prevType.get(f.id) !== f.type) continue;
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

// <input type="number"> and <input type="date"> report value "" for text they can't parse ("1-2", a date
// with only the day typed), so without this check such an answer would be sent as empty.
export const UNPARSED_MESSAGES: Partial<Record<Field['type'], string>> = {
  number: 'Введите число',
  date: 'Введите дату полностью',
};

/** Errors for fields whose control holds unparsable text; they win over errors computed from the value. */
export function withUnparsed(errors: ErrorMap, fields: Field[], unparsed: ReadonlySet<string>): ErrorMap {
  if (unparsed.size === 0) return errors;
  const out = { ...errors };
  for (const f of fields) {
    const message = UNPARSED_MESSAGES[f.type];
    if (message && unparsed.has(f.id)) out[f.id] = message;
  }
  return out;
}
