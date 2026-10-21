// Shared form schema: field catalog, form-definition normalization, answer validation.
// Used by both the server (authoritative) and the browser (instant feedback), so it must
// stay free of Node- or DOM-specific imports.

export const FIELD_TYPES = [
  { type: 'short_text', label: 'Короткий текст', icon: 'Aa', placeholder: true },
  { type: 'long_text', label: 'Длинный текст', icon: '¶', placeholder: true },
  { type: 'email', label: 'Email', icon: '@', placeholder: true },
  { type: 'phone', label: 'Телефон', icon: '☏', placeholder: true },
  { type: 'number', label: 'Число', icon: '#', placeholder: true },
  { type: 'select', label: 'Выпадающий список', icon: '▾', choice: true },
  { type: 'radio', label: 'Один из списка', icon: '◉', choice: true },
  { type: 'multi_select', label: 'Множественный выбор', icon: '☑', choice: true },
  { type: 'date', label: 'Дата', icon: '▦' },
  { type: 'checkbox', label: 'Флажок (согласие)', icon: '✓' },
];

const TYPE_MAP = new Map(FIELD_TYPES.map((t) => [t.type, t]));
export const isChoiceType = (type) => Boolean(TYPE_MAP.get(type)?.choice);
export const hasPlaceholder = (type) => Boolean(TYPE_MAP.get(type)?.placeholder);
export const fieldTypeLabel = (type) => TYPE_MAP.get(type)?.label ?? type;

export const LIMITS = {
  title: 200,
  description: 2000,
  fields: 100,
  label: 300,
  hint: 500,
  placeholder: 200,
  options: 50,
  optionLabel: 200,
  short_text: 500,
  long_text: 5000,
  email: 254,
  phone: 30,
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+\d\s()-]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMERIC_RE = /^-?\d+([.,]\d+)?$/;

export function generateId(length = 10) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && NUMERIC_RE.test(v.trim())) return Number(v.trim().replace(',', '.'));
  return NaN;
}

export function createField(type = 'short_text') {
  const meta = TYPE_MAP.get(type) ?? TYPE_MAP.get('short_text');
  return {
    id: generateId(),
    type: meta.type,
    label: meta.type === 'checkbox' ? 'Я согласен(на) на обработку персональных данных' : 'Новый вопрос',
    hint: '',
    placeholder: '',
    required: false,
    options: meta.choice
      ? [{ id: generateId(), label: 'Вариант 1' }, { id: generateId(), label: 'Вариант 2' }]
      : [],
    min: null,
    max: null,
  };
}

/**
 * Validates and normalizes a form definition coming from the admin UI.
 * Returns { value, errors } where errors is a flat map keyed like "fields.2.label".
 */
export function normalizeFormInput(input) {
  const errors = {};
  if (!isPlainObject(input)) {
    return { value: null, errors: { _root: 'Ожидался объект формы' } };
  }

  const title = str(input.title);
  if (!title) errors.title = 'Укажите название формы';
  else if (title.length > LIMITS.title) errors.title = `Не длиннее ${LIMITS.title} символов`;

  const description = str(input.description);
  if (description.length > LIMITS.description) errors.description = `Не длиннее ${LIMITS.description} символов`;

  let rawFields = input.fields ?? [];
  if (!Array.isArray(rawFields)) {
    errors.fields = 'Список полей должен быть массивом';
    rawFields = [];
  } else if (rawFields.length > LIMITS.fields) {
    errors.fields = `Не больше ${LIMITS.fields} полей`;
    rawFields = [];
  }

  const usedIds = new Set();
  const uniqueId = (candidate) => {
    let id = typeof candidate === 'string' && ID_RE.test(candidate) ? candidate : generateId();
    while (usedIds.has(id)) id = generateId();
    usedIds.add(id);
    return id;
  };

  const fields = rawFields.map((raw, i) => {
    const key = `fields.${i}`;
    const f = isPlainObject(raw) ? raw : {};
    const meta = TYPE_MAP.get(f.type);
    if (!meta) errors[`${key}.type`] = 'Неизвестный тип поля';

    const label = str(f.label);
    if (!label) errors[`${key}.label`] = 'Укажите вопрос';
    else if (label.length > LIMITS.label) errors[`${key}.label`] = `Не длиннее ${LIMITS.label} символов`;

    const hint = str(f.hint);
    if (hint.length > LIMITS.hint) errors[`${key}.hint`] = `Не длиннее ${LIMITS.hint} символов`;

    const placeholder = meta?.placeholder ? str(f.placeholder) : '';
    if (placeholder.length > LIMITS.placeholder) errors[`${key}.placeholder`] = `Не длиннее ${LIMITS.placeholder} символов`;

    let options = [];
    if (meta?.choice) {
      const rawOptions = Array.isArray(f.options) ? f.options : [];
      if (rawOptions.length === 0) errors[`${key}.options`] = 'Добавьте хотя бы один вариант';
      else if (rawOptions.length > LIMITS.options) errors[`${key}.options`] = `Не больше ${LIMITS.options} вариантов`;
      const seenLabels = new Set();
      const optionIds = new Set();
      options = rawOptions.slice(0, LIMITS.options).map((o, j) => {
        const opt = isPlainObject(o) ? o : {};
        const optLabel = str(opt.label);
        const lower = optLabel.toLowerCase();
        if (!optLabel) errors[`${key}.options.${j}`] = 'Вариант не может быть пустым';
        else if (optLabel.length > LIMITS.optionLabel) errors[`${key}.options.${j}`] = `Не длиннее ${LIMITS.optionLabel} символов`;
        else if (seenLabels.has(lower)) errors[`${key}.options.${j}`] = 'Такой вариант уже есть';
        seenLabels.add(lower);
        let id = typeof opt.id === 'string' && ID_RE.test(opt.id) ? opt.id : generateId();
        while (optionIds.has(id)) id = generateId();
        optionIds.add(id);
        return { id, label: optLabel };
      });
    }

    let min = null;
    let max = null;
    if (meta?.type === 'number') {
      min = toNumberOrNull(f.min);
      max = toNumberOrNull(f.max);
      if (Number.isNaN(min)) errors[`${key}.min`] = 'Минимум должен быть числом';
      if (Number.isNaN(max)) errors[`${key}.max`] = 'Максимум должен быть числом';
      if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
        errors[`${key}.max`] = 'Максимум меньше минимума';
      }
    }

    return {
      id: uniqueId(f.id),
      type: meta ? meta.type : String(f.type ?? ''),
      label,
      hint,
      placeholder,
      required: f.required === true,
      options,
      min,
      max,
    };
  });

  return { value: { title, description, fields }, errors };
}

function isEmptyAnswer(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

function validateOne(field, raw) {
  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof raw !== 'string') return { error: 'Ожидался текст' };
      const v = raw.trim();
      const limit = LIMITS[field.type];
      if (v.length > limit) return { error: `Не длиннее ${limit} символов` };
      return { value: v };
    }
    case 'email': {
      if (typeof raw !== 'string') return { error: 'Ожидался email' };
      const v = raw.trim();
      if (v.length > LIMITS.email || !EMAIL_RE.test(v)) return { error: 'Введите корректный email, например name@example.com' };
      return { value: v };
    }
    case 'phone': {
      if (typeof raw !== 'string') return { error: 'Ожидался номер телефона' };
      const v = raw.trim();
      const digits = v.replace(/\D/g, '').length;
      if (v.length > LIMITS.phone || !PHONE_RE.test(v) || digits < 7 || digits > 15) {
        return { error: 'Введите номер телефона, например +7 999 123-45-67' };
      }
      return { value: v };
    }
    case 'number': {
      const n = toNumberOrNull(raw);
      if (n === null || Number.isNaN(n)) return { error: 'Введите число' };
      if (field.min !== null && field.min !== undefined && n < field.min) return { error: `Не меньше ${field.min}` };
      if (field.max !== null && field.max !== undefined && n > field.max) return { error: `Не больше ${field.max}` };
      return { value: n };
    }
    case 'select':
    case 'radio': {
      if (typeof raw !== 'string' || !field.options.some((o) => o.id === raw)) return { error: 'Выберите вариант из списка' };
      return { value: raw };
    }
    case 'multi_select': {
      if (!Array.isArray(raw)) return { error: 'Выберите варианты из списка' };
      const allowed = new Set(field.options.map((o) => o.id));
      if (!raw.every((v) => typeof v === 'string' && allowed.has(v))) return { error: 'Выберите варианты из списка' };
      const picked = new Set(raw);
      // Keep the manager-defined option order, drop duplicates.
      return { value: field.options.map((o) => o.id).filter((id) => picked.has(id)) };
    }
    case 'date': {
      const m = typeof raw === 'string' ? DATE_RE.exec(raw.trim()) : null;
      if (!m) return { error: 'Введите дату' };
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2100) {
        return { error: 'Такой даты не существует' };
      }
      return { value: raw.trim() };
    }
    case 'checkbox': {
      if (typeof raw !== 'boolean') return { error: 'Некорректное значение' };
      return { value: raw };
    }
    default:
      return { error: 'Неизвестный тип поля' };
  }
}

/**
 * Validates answers against the form fields. Unknown keys are dropped,
 * empty optional answers are omitted. Returns { values, errors } keyed by field id.
 */
export function validateAnswers(fields, answers) {
  const input = isPlainObject(answers) ? answers : {};
  const values = {};
  const errors = {};
  for (const field of fields) {
    const raw = Object.prototype.hasOwnProperty.call(input, field.id) ? input[field.id] : undefined;
    const uncheckedBox = field.type === 'checkbox' && raw === false;
    if (isEmptyAnswer(raw) || uncheckedBox) {
      if (field.required) {
        errors[field.id] = field.type === 'checkbox' ? 'Необходимо отметить' : 'Обязательное поле';
      } else if (uncheckedBox) {
        values[field.id] = false;
      }
      continue;
    }
    const { value, error } = validateOne(field, raw);
    if (error) errors[field.id] = error;
    else values[field.id] = value;
  }
  return { values, errors };
}

/** Human-readable representation of a stored answer value. */
export function formatValue(field, value) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return '—';
  const labelOf = (id) => field.options?.find((o) => o.id === id)?.label ?? String(id);
  switch (field.type) {
    case 'select':
    case 'radio':
      return labelOf(value);
    case 'multi_select':
      return Array.isArray(value) ? value.map(labelOf).join(', ') : String(value);
    case 'checkbox':
      return value === true ? 'Да' : 'Нет';
    case 'date': {
      const m = DATE_RE.exec(String(value));
      return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value);
    }
    default:
      return String(value);
  }
}
