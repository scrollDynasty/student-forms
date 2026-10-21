'use client';

import { useRef } from 'react';
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
import { IconArrowDown, IconArrowUp, IconChevronUp, IconCopy, IconPlus, IconTrash, IconX } from '@/components/ui/icons';
import { fieldElId, hasFieldErrors, moveElId, optElId, summaryElId, type FieldErrors } from './errors';

export function nextOptionLabel(options: Option[]): string {
  const used = new Set(options.map((o) => o.label.trim().toLowerCase()));
  let n = options.length + 1;
  while (used.has(`вариант ${n}`)) n += 1;
  return `Вариант ${n}`;
}

function TypeIcon({ type, active = false }: { type: FieldType; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        'grid size-11 shrink-0 place-items-center rounded-full font-heading text-base font-semibold ' +
        (active ? 'bg-accent text-bg' : 'bg-accent-100 text-accent-800')
      }
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
  // Settings a type switch would drop, kept so that switching back restores them.
  const stash = useRef<{ options: Option[]; placeholder: string; min: number | null; max: number | null }>({
    options: [],
    placeholder: '',
    min: null,
    max: null,
  });
  const invalid = hasFieldErrors(errors);
  const num = index + 1;

  const first = index === 0;
  const last = index === total - 1;
  const actions = (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        id={moveElId(field.id, 'up')}
        label={`Переместить вопрос ${num} выше`}
        aria-disabled={first || undefined}
        onClick={() => onMove(-1)}
      >
        <IconArrowUp size={17} />
      </IconButton>
      <IconButton
        id={moveElId(field.id, 'down')}
        label={`Переместить вопрос ${num} ниже`}
        aria-disabled={last || undefined}
        onClick={() => onMove(1)}
      >
        <IconArrowDown size={17} />
      </IconButton>
      <IconButton label={`Дублировать вопрос ${num}`} aria-disabled={!canDuplicate || undefined} onClick={onDuplicate}>
        <IconCopy size={17} />
      </IconButton>
      <IconButton label={`Удалить вопрос ${num}`} tone="danger" onClick={onDelete}>
        <IconTrash size={17} />
      </IconButton>
    </div>
  );

  if (!selected) {
    return (
      <li
        className={
          'flex items-center gap-1.5 rounded-full p-2 transition-colors ' +
          (invalid ? 'bg-accent-100 ring-2 ring-inset ring-accent-700' : 'bg-neutral-100 hover:bg-neutral-200')
        }
      >
        <button
          id={summaryElId(field.id)}
          type="button"
          onClick={onSelect}
          aria-expanded={false}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-full text-left"
        >
          <TypeIcon type={field.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">
              <span className="text-neutral-700">{num}.</span> {field.label.trim() || 'Вопрос без текста'}
            </span>
            <span className="block truncate text-[13px] text-neutral-700">
              {fieldTypeLabel(field.type)}
              {field.required ? ' · обязательное' : ''}
              {invalid ? <span className="font-semibold text-accent-800"> · есть ошибки</span> : null}
            </span>
          </span>
        </button>
        <span className="hidden sm:contents">{actions}</span>
      </li>
    );
  }

  function changeType(type: FieldType) {
    const saved = stash.current;
    // Remember what this switch would throw away.
    if (field.options.length > 0) saved.options = field.options;
    if (field.placeholder) saved.placeholder = field.placeholder;
    if (field.min !== null || field.max !== null) {
      saved.min = field.min;
      saved.max = field.max;
    }

    const patch: Partial<Field> = { type };
    if (isChoiceType(type)) {
      if (field.options.length < 2) {
        const opts = field.options.length === 0 ? [...saved.options] : [...field.options];
        while (opts.length < 2) opts.push({ id: generateId(), label: nextOptionLabel(opts) });
        patch.options = opts;
      }
    } else {
      patch.options = [];
    }
    if (!hasPlaceholder(type)) patch.placeholder = '';
    else if (!field.placeholder && saved.placeholder) patch.placeholder = saved.placeholder;
    if (type !== 'number') {
      patch.min = null;
      patch.max = null;
    } else if (field.min === null && field.max === null) {
      patch.min = saved.min;
      patch.max = saved.max;
    }
    onChange(patch);
  }

  const id = (p: Parameters<typeof fieldElId>[1]) => fieldElId(field.id, p);
  const describe = (p: Parameters<typeof fieldElId>[1]) => (errors?.[p] ? `${id(p)}-error` : undefined);

  return (
    <li
      className={
        'my-2 grid gap-5 rounded-[32px] bg-neutral-100 px-3.5 pb-6 pt-3.5 shadow-md ring-2 ' +
        (invalid ? 'ring-accent-700' : 'ring-accent-300')
      }
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <TypeIcon type={field.type} active />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-700">
          Вопрос {num} · {fieldTypeLabel(field.type)}
        </p>
        <div className="flex items-center gap-0.5">
          {actions}
          <IconButton label="Свернуть вопрос" onClick={onCollapse} aria-expanded={true}>
            <IconChevronUp size={17} />
          </IconButton>
        </div>
      </div>

      <div className="grid gap-[18px] px-1 sm:px-2.5">
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

        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[18px]">
          <div>
            <Label htmlFor={id('type')}>Тип поля</Label>
            <select
              id={id('type')}
              value={field.type}
              aria-invalid={Boolean(errors?.type) || undefined}
              aria-describedby={describe('type')}
              onChange={(e) => changeType(e.target.value as FieldType)}
              className={inputClasses(Boolean(errors?.type), 'cursor-pointer text-[15px]')}
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
              <Label htmlFor={id('placeholder')} hint="серый текст внутри поля">
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
                className="text-[15px]"
              />
              <FieldError id={`${id('placeholder')}-error`}>{errors?.placeholder}</FieldError>
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor={id('hint')} hint="необязательно">
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
            className="text-[15px]"
          />
          <FieldError id={`${id('hint')}-error`}>{errors?.hint}</FieldError>
        </div>

        {isChoiceType(field.type) ? (
          <OptionsEditor field={field} errors={errors} onChange={(options) => onChange({ options })} requestFocus={requestFocus} />
        ) : null}

        {field.type === 'number' ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[18px]">
            {(['min', 'max'] as const).map((p) => (
              <div key={p}>
                <Label htmlFor={id(p)} hint="необязательно">
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
                  className="text-[15px]"
                />
                <FieldError id={`${id(p)}-error`}>{errors?.[p]}</FieldError>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <Toggle
            id={`${field.id}-required`}
            checked={field.required}
            onChange={(required) => onChange({ required })}
            label="Обязательное поле"
            description={field.type === 'checkbox' ? 'Студент должен поставить флажок' : 'Без ответа форму не отправить'}
          />
          <Button onClick={onCollapse} className="px-5">
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
    const opt = options[index];
    if (!opt || j < 0 || j >= options.length) return;
    const next = [...options];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
    const atEdge = (dir === -1 && j === 0) || (dir === 1 && j === options.length - 1);
    const button = dir === -1 ? (atEdge ? 'down' : 'up') : atEdge ? 'up' : 'down';
    requestFocus(`${optElId(field.id, opt.id)}-${button}`);
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
      <p id={groupId} className="mb-2 text-[13px] font-medium text-neutral-700">
        Варианты ответа · {options.length} из {LIMITS.options}
      </p>
      <ol className="m-0 grid list-none gap-1.5 p-0">
        {options.map((opt, i) => {
          const err = errors?.opt?.[opt.id];
          const elId = optElId(field.id, opt.id);
          return (
            <li key={opt.id}>
              <div className="flex items-center gap-1 sm:gap-2">
                <span
                  aria-hidden="true"
                  className={`hidden size-[22px] shrink-0 border-2 border-neutral-500 sm:block ${field.type === 'multi_select' ? 'rounded-md' : 'rounded-full'}`}
                />
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
                  className="min-h-[42px] min-w-0 flex-1 text-[15px]"
                />
                <IconButton id={`${elId}-up`} label={`Вариант ${i + 1} выше`} aria-disabled={i === 0 || undefined} onClick={() => move(i, -1)}>
                  <IconArrowUp size={16} />
                </IconButton>
                <IconButton
                  id={`${elId}-down`}
                  label={`Вариант ${i + 1} ниже`}
                  aria-disabled={i === options.length - 1 || undefined}
                  onClick={() => move(i, 1)}
                >
                  <IconArrowDown size={16} />
                </IconButton>
                <IconButton label={`Удалить вариант ${i + 1}`} aria-disabled={options.length <= 1 || undefined} onClick={() => remove(i)}>
                  <IconX size={16} />
                </IconButton>
              </div>
              {err ? (
                <p id={`${elId}-error`} className="mt-1 px-3 text-sm font-medium text-accent-800 sm:ml-[30px]">
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
        className="mt-2 px-3 sm:ml-6"
        aria-disabled={options.length >= LIMITS.options || undefined}
        onClick={() => addAfter(options.length - 1)}
        icon={<IconPlus size={16} />}
      >
        Добавить вариант
      </Button>
      <p className="mt-1 px-3 text-xs text-neutral-700 sm:ml-6">Подсказка: Enter в поле варианта добавляет следующий.</p>
    </div>
  );
}
