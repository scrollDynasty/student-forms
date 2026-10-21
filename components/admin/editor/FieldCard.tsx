'use client';

import {
  FIELD_TYPES,
  LIMITS,
  fieldTypeIcon,
  fieldTypeLabel,
  generateId,
  hasPlaceholder,
  isChoiceType,
  type Field,
  type FieldType,
  type Option,
} from '@/lib/schema';
import { Button, IconButton } from '@/components/ui/Button';
import { FieldError, Label, TextInput, Toggle, inputClasses } from '@/components/ui/inputs';
import { IconArrowDown, IconArrowUp, IconChevronDown, IconCopy, IconPlus, IconTrash, IconX } from '@/components/ui/icons';
import { fieldElId, hasFieldErrors, optElId, type FieldErrors } from './errors';

export function nextOptionLabel(options: Option[]): string {
  const used = new Set(options.map((o) => o.label.trim().toLowerCase()));
  let n = options.length + 1;
  while (used.has(`вариант ${n}`)) n += 1;
  return `Вариант ${n}`;
}

function TypeIcon({ type }: { type: FieldType }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent"
    >
      {fieldTypeIcon(type)}
    </span>
  );
}

export function FieldCard({
  field,
  index,
  total,
  selected,
  errors,
  onSelect,
  onCollapse,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  requestFocus,
  canDuplicate,
}: {
  field: Field;
  index: number;
  total: number;
  selected: boolean;
  errors?: FieldErrors;
  onSelect: () => void;
  onCollapse: () => void;
  onChange: (patch: Partial<Field>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  requestFocus: (elId: string, select?: boolean) => void;
  canDuplicate: boolean;
}) {
  const invalid = hasFieldErrors(errors);
  const num = index + 1;

  const actions = (
    <div className="flex shrink-0 items-center">
      <IconButton label={`Переместить вопрос ${num} вверх`} disabled={index === 0} onClick={() => onMove(-1)}>
        <IconArrowUp size={16} />
      </IconButton>
      <IconButton label={`Переместить вопрос ${num} вниз`} disabled={index === total - 1} onClick={() => onMove(1)}>
        <IconArrowDown size={16} />
      </IconButton>
      <IconButton label={`Дублировать вопрос ${num}`} disabled={!canDuplicate} onClick={onDuplicate}>
        <IconCopy size={16} />
      </IconButton>
      <IconButton label={`Удалить вопрос ${num}`} tone="danger" onClick={onDelete}>
        <IconTrash size={16} />
      </IconButton>
    </div>
  );

  if (!selected) {
    return (
      <li
        className={
          'flex items-center gap-1 rounded-xl border bg-white py-1.5 pl-2 pr-1 shadow-xs transition-colors ' +
          (invalid ? 'border-red-300 bg-red-50/40' : 'border-slate-200 hover:border-slate-300')
        }
      >
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={false}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <TypeIcon type={field.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">
              <span className="text-slate-400">{num}.</span> {field.label.trim() || 'Вопрос без текста'}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {fieldTypeLabel(field.type)}
              {field.required ? ' · обязательное' : ''}
              {invalid ? <span className="font-medium text-red-700"> · есть ошибки</span> : null}
            </span>
          </span>
        </button>
        {actions}
      </li>
    );
  }

  function changeType(type: FieldType) {
    const patch: Partial<Field> = { type };
    if (isChoiceType(type)) {
      if (field.options.length < 2) {
        const opts = [...field.options];
        while (opts.length < 2) opts.push({ id: generateId(), label: nextOptionLabel(opts) });
        patch.options = opts;
      }
    } else {
      patch.options = [];
    }
    if (!hasPlaceholder(type)) patch.placeholder = '';
    if (type !== 'number') {
      patch.min = null;
      patch.max = null;
    }
    onChange(patch);
  }

  const id = (p: Parameters<typeof fieldElId>[1]) => fieldElId(field.id, p);
  const describe = (p: Parameters<typeof fieldElId>[1]) => (errors?.[p] ? `${id(p)}-error` : undefined);

  return (
    <li className={`rounded-xl border bg-white shadow-sm ring-2 ${invalid ? 'border-red-300 ring-red-100' : 'border-accent/40 ring-accent/10'}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 py-1.5 pl-3 pr-1">
        <TypeIcon type={field.type} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
          Вопрос {num} · {fieldTypeLabel(field.type)}
        </p>
        {actions}
        <IconButton label="Свернуть вопрос" onClick={onCollapse} aria-expanded={true}>
          <IconChevronDown size={16} className="rotate-180" />
        </IconButton>
      </div>

      <div className="grid gap-5 p-4 sm:p-5">
        <div>
          <Label htmlFor={id('label')}>Вопрос</Label>
          <TextInput
            id={id('label')}
            value={field.label}
            maxLength={LIMITS.label}
            invalid={Boolean(errors?.label)}
            aria-describedby={describe('label')}
            placeholder="Например: Почему вы хотите на эту стажировку?"
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <FieldError id={`${id('label')}-error`}>{errors?.label}</FieldError>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor={id('type')}>Тип поля</Label>
            <select
              id={id('type')}
              value={field.type}
              aria-invalid={Boolean(errors?.type) || undefined}
              aria-describedby={describe('type')}
              onChange={(e) => changeType(e.target.value as FieldType)}
              className={inputClasses(Boolean(errors?.type))}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            <FieldError id={`${id('type')}-error`}>{errors?.type}</FieldError>
          </div>
          {hasPlaceholder(field.type) ? (
            <div>
              <Label htmlFor={id('placeholder')} hint="(серый текст внутри поля)">
                Плейсхолдер
              </Label>
              <TextInput
                id={id('placeholder')}
                value={field.placeholder}
                maxLength={LIMITS.placeholder}
                invalid={Boolean(errors?.placeholder)}
                aria-describedby={describe('placeholder')}
                placeholder="Например: Иван Иванов"
                onChange={(e) => onChange({ placeholder: e.target.value })}
              />
              <FieldError id={`${id('placeholder')}-error`}>{errors?.placeholder}</FieldError>
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor={id('hint')} hint="(необязательно)">
            Подсказка
          </Label>
          <TextInput
            id={id('hint')}
            value={field.hint}
            maxLength={LIMITS.hint}
            invalid={Boolean(errors?.hint)}
            aria-describedby={describe('hint')}
            placeholder="Поясните, что именно нужно указать"
            onChange={(e) => onChange({ hint: e.target.value })}
          />
          <FieldError id={`${id('hint')}-error`}>{errors?.hint}</FieldError>
        </div>

        {isChoiceType(field.type) ? (
          <OptionsEditor field={field} errors={errors} onChange={(options) => onChange({ options })} requestFocus={requestFocus} />
        ) : null}

        {field.type === 'number' ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {(['min', 'max'] as const).map((p) => (
              <div key={p}>
                <Label htmlFor={id(p)} hint="(необязательно)">
                  {p === 'min' ? 'Минимум' : 'Максимум'}
                </Label>
                <TextInput
                  id={id(p)}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={field[p] ?? ''}
                  invalid={Boolean(errors?.[p])}
                  aria-describedby={describe(p)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === '' ? null : Number(raw);
                    onChange({ [p]: n === null || Number.isFinite(n) ? n : null });
                  }}
                />
                <FieldError id={`${id(p)}-error`}>{errors?.[p]}</FieldError>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Toggle
            id={`${field.id}-required`}
            checked={field.required}
            onChange={(required) => onChange({ required })}
            label="Обязательное поле"
            description={field.type === 'checkbox' ? 'Студент должен поставить флажок' : 'Без ответа форму не отправить'}
          />
          <Button size="sm" variant="ghost" onClick={onCollapse}>
            Готово
          </Button>
        </div>
      </div>
    </li>
  );
}

function OptionsEditor({
  field,
  errors,
  onChange,
  requestFocus,
}: {
  field: Field;
  errors?: FieldErrors;
  onChange: (options: Option[]) => void;
  requestFocus: (elId: string, select?: boolean) => void;
}) {
  const options = field.options;
  const groupId = `${fieldElId(field.id, 'options')}-label`;

  function addAfter(index: number) {
    if (options.length >= LIMITS.options) return;
    const opt = { id: generateId(), label: nextOptionLabel(options) };
    const next = [...options.slice(0, index + 1), opt, ...options.slice(index + 1)];
    onChange(next);
    requestFocus(optElId(field.id, opt.id), true);
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    if (options.length <= 1) return;
    const next = options.filter((_, i) => i !== index);
    onChange(next);
    const neighbor = next[Math.min(index, next.length - 1)];
    if (neighbor) requestFocus(optElId(field.id, neighbor.id));
  }

  return (
    <div role="group" aria-labelledby={groupId}>
      <p id={groupId} className="mb-1.5 text-sm font-medium text-slate-800">
        Варианты ответа <span className="font-normal text-slate-500">({options.length} из {LIMITS.options})</span>
      </p>
      <ol className="grid gap-2">
        {options.map((opt, i) => {
          const err = errors?.opt?.[opt.id];
          const elId = optElId(field.id, opt.id);
          return (
            <li key={opt.id}>
              <div className="flex items-center gap-1">
                <span aria-hidden="true" className="w-6 shrink-0 text-right text-sm text-slate-400">
                  {i + 1}.
                </span>
                <TextInput
                  id={elId}
                  value={opt.label}
                  maxLength={LIMITS.optionLabel}
                  invalid={Boolean(err)}
                  aria-label={`Вариант ${i + 1}`}
                  aria-describedby={err ? `${elId}-error` : undefined}
                  onChange={(e) => onChange(options.map((o) => (o.id === opt.id ? { ...o, label: e.target.value } : o)))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAfter(i);
                    }
                  }}
                  className="min-w-0 flex-1"
                />
                <IconButton label={`Вариант ${i + 1} выше`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <IconArrowUp size={16} />
                </IconButton>
                <IconButton label={`Вариант ${i + 1} ниже`} disabled={i === options.length - 1} onClick={() => move(i, 1)}>
                  <IconArrowDown size={16} />
                </IconButton>
                <IconButton label={`Удалить вариант ${i + 1}`} tone="danger" disabled={options.length <= 1} onClick={() => remove(i)}>
                  <IconX size={16} />
                </IconButton>
              </div>
              {err ? (
                <p id={`${elId}-error`} className="ml-7 mt-1 text-sm text-red-700">
                  {err}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <FieldError id={`${fieldElId(field.id, 'options')}-error`}>{errors?.options}</FieldError>
      <Button
        id={fieldElId(field.id, 'options')}
        size="sm"
        variant="ghost"
        className="ml-6 mt-2 text-accent hover:text-accent-strong"
        disabled={options.length >= LIMITS.options}
        onClick={() => addAfter(options.length - 1)}
        icon={<IconPlus size={16} />}
      >
        Добавить вариант
      </Button>
      <p className="ml-7 mt-1 text-xs text-slate-500">Подсказка: Enter в поле варианта добавляет следующий.</p>
    </div>
  );
}
