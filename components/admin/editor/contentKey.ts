import type { Field, FormContent } from '@/lib/schema';

// The builder keeps an unparsable min/max as NaN (see FieldCard), which JSON would turn into null.
const limitKey = (v: number | null) => (v === null || Number.isFinite(v) ? v : 'invalid');

/** Order-stable serialization used to detect unsaved changes. */
export function contentKey(d: FormContent): string {
  return JSON.stringify([
    d.title,
    d.description,
    d.fields.map((f: Field) => [
      f.id, f.type, f.label, f.hint, f.placeholder, f.required, f.options.map((o) => [o.id, o.label]), limitKey(f.min), limitKey(f.max),
    ]),
  ]);
}
