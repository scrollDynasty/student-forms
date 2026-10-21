// Maps validation errors keyed by index ("fields.2.options.1") to errors keyed by stable field/option ids,
// so they survive reordering while the manager fixes them.
import type { ErrorMap, Field } from '@/lib/schema';

export type FieldProp = 'label' | 'hint' | 'placeholder' | 'type' | 'options' | 'min' | 'max';

export interface FieldErrors {
  label?: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  options?: string;
  min?: string;
  max?: string;
  /** Per-option errors keyed by option id. */
  opt?: Record<string, string>;
}

export interface EditorErrors {
  title?: string;
  description?: string;
  fields?: string;
  byField: Record<string, FieldErrors>;
  other: string[];
}

export const NO_ERRORS: EditorErrors = { byField: {}, other: [] };

const FIELD_KEY = /^fields\.(\d+)\.(label|hint|placeholder|type|options|min|max)(?:\.(\d+))?$/;

export function mapErrors(map: ErrorMap, fields: Field[]): EditorErrors {
  const out: EditorErrors = { byField: {}, other: [] };
  for (const [key, msg] of Object.entries(map)) {
    if (key === 'title' || key === 'description' || key === 'fields') {
      out[key] = msg;
      continue;
    }
    const m = FIELD_KEY.exec(key);
    const field = m ? fields[Number(m[1])] : undefined;
    if (!m || !field) {
      out.other.push(msg);
      continue;
    }
    const prop = m[2] as FieldProp;
    const fe = (out.byField[field.id] ??= {});
    if (prop === 'options' && m[3] !== undefined) {
      const opt = field.options[Number(m[3])];
      if (opt) (fe.opt ??= {})[opt.id] = msg;
      else fe.options = msg;
    } else {
      fe[prop] = msg;
    }
  }
  return out;
}

export function countErrors(e: EditorErrors): number {
  let n = (e.title ? 1 : 0) + (e.description ? 1 : 0) + (e.fields ? 1 : 0) + e.other.length;
  for (const fe of Object.values(e.byField)) {
    for (const [k, v] of Object.entries(fe)) {
      if (k === 'opt') n += Object.keys(v as Record<string, string>).length;
      else if (v) n += 1;
    }
  }
  return n;
}

export const hasFieldErrors = (fe: FieldErrors | undefined) => Boolean(fe && countErrors({ byField: { x: fe }, other: [] }) > 0);

export const fieldElId = (fieldId: string, prop: FieldProp) => `fe-${fieldId}-${prop}`;
export const optElId = (fieldId: string, optId: string) => `fe-${fieldId}-opt-${optId}`;
export const PALETTE_ID = 'add-field-palette';
/** The collapsed card's summary button. */
export const summaryElId = (fieldId: string) => `fe-${fieldId}-summary`;
/** The card's «выше» / «ниже» buttons (same ids whether the card is collapsed or expanded). */
export const moveElId = (fieldId: string, dir: 'up' | 'down') => `fe-${fieldId}-move-${dir}`;

/** The element to focus for the first error, in on-screen order. */
export function firstErrorTarget(e: EditorErrors, fields: Field[]): { elId: string; fieldId?: string } | null {
  if (e.title) return { elId: 'form-title' };
  if (e.description) return { elId: 'form-description' };
  for (const f of fields) {
    const fe = e.byField[f.id];
    if (!fe) continue;
    if (fe.label) return { elId: fieldElId(f.id, 'label'), fieldId: f.id };
    if (fe.type) return { elId: fieldElId(f.id, 'type'), fieldId: f.id };
    if (fe.hint) return { elId: fieldElId(f.id, 'hint'), fieldId: f.id };
    if (fe.placeholder) return { elId: fieldElId(f.id, 'placeholder'), fieldId: f.id };
    const badOpt = f.options.find((o) => fe.opt?.[o.id]);
    if (badOpt) return { elId: optElId(f.id, badOpt.id), fieldId: f.id };
    if (fe.options) return { elId: fieldElId(f.id, 'options'), fieldId: f.id };
    if (fe.min) return { elId: fieldElId(f.id, 'min'), fieldId: f.id };
    if (fe.max) return { elId: fieldElId(f.id, 'max'), fieldId: f.id };
  }
  if (e.fields) return { elId: PALETTE_ID };
  return null;
}

/** Drops errors for the given field props once the manager edits them. */
export function clearFieldErrors(e: EditorErrors, fieldId: string, props: string[]): EditorErrors {
  const fe = e.byField[fieldId];
  if (!fe) return e;
  const next: FieldErrors = { ...fe };
  for (const p of props) {
    if (p === 'options') {
      delete next.options;
      delete next.opt;
    } else if (p === 'type') {
      // A type switch can invalidate or fix everything about the field.
      return { ...e, byField: omit(e.byField, fieldId) };
    } else {
      delete next[p as Exclude<FieldProp, 'options'>];
    }
  }
  return { ...e, byField: { ...e.byField, [fieldId]: next } };
}

export function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...rec };
  delete copy[key];
  return copy;
}
