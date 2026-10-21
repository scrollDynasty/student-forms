'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { FIELD_TYPES, LIMITS, createField, generateId, type Field, type FieldType } from '@/lib/schema';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { FieldError, Label, TextArea, TextInput } from '@/components/ui/inputs';
import { IconForm, IconPlus } from '@/components/ui/icons';
import { FieldCard } from './FieldCard';
import { swapped } from '@/lib/list';
import { PALETTE_ID, clearFieldErrors, fieldElId, moveElId, omit, summaryElId, type EditorErrors } from './errors';

export interface Draft {
  title: string;
  description: string;
  fields: Field[];
}

/** A ready-made starter set for typical internship applications. */
function starterFields(): Field[] {
  const name = { ...createField('short_text'), label: 'Имя и фамилия', placeholder: 'Иван Иванов', required: true };
  const email = { ...createField('email'), label: 'Email', placeholder: 'name@example.com', required: true };
  const phone = { ...createField('phone'), label: 'Телефон', placeholder: '+7 999 123-45-67' };
  const consent = { ...createField('checkbox'), required: true };
  return [name, email, phone, consent];
}

export function BuilderTab({
  draft,
  setDraft,
  errors,
  setErrors,
  selectedId,
  setSelectedId,
  requestFocus,
  showResponsesNote,
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  errors: EditorErrors;
  setErrors: Dispatch<SetStateAction<EditorErrors>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  requestFocus: (elId: string, select?: boolean) => void;
  showResponsesNote: boolean;
}) {
  const { fields } = draft;
  const full = fields.length >= LIMITS.fields;
  const toast = useToast();
  const [announcement, setAnnouncement] = useState('');

  const setFields = (fn: (fields: Field[]) => Field[]) => setDraft((d) => ({ ...d, fields: fn(d.fields) }));

  function update(id: string, patch: Partial<Field>) {
    setFields((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setErrors((e) => clearFieldErrors(e, id, Object.keys(patch)));
  }

  function add(type: FieldType) {
    if (full) return;
    const f = createField(type);
    setFields((list) => [...list, f]);
    setErrors((e) => ({ ...e, fields: undefined }));
    setSelectedId(f.id);
    requestFocus(fieldElId(f.id, 'label'), true);
  }

  function addStarter() {
    const list = starterFields();
    setFields((cur) => [...cur, ...list].slice(0, LIMITS.fields));
    setErrors((e) => ({ ...e, fields: undefined }));
    setSelectedId(null);
  }

  function select(id: string) {
    setSelectedId(id);
    requestFocus(fieldElId(id, 'label'));
  }

  function collapse(id: string) {
    setSelectedId(null);
    requestFocus(summaryElId(id));
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    const field = fields[index];
    if (!field || j < 0 || j >= fields.length) return;
    setFields((list) => swapped(list, index, j));
    // Keep focus on the same card's button; at the edge that button is inert, so use the opposite one.
    const atEdge = (dir === -1 && j === 0) || (dir === 1 && j === fields.length - 1);
    const button = dir === -1 ? (atEdge ? 'down' : 'up') : atEdge ? 'up' : 'down';
    requestFocus(moveElId(field.id, button));
    setAnnouncement(`Вопрос «${field.label.trim() || 'без текста'}» перемещён на позицию ${j + 1} из ${fields.length}`);
  }

  function duplicate(index: number) {
    const src = fields[index];
    if (full || !src) return;
    const copy: Field = {
      ...src,
      id: generateId(),
      label: src.label.length + 9 <= LIMITS.label ? `${src.label} (копия)` : src.label,
      options: src.options.map((o) => ({ ...o, id: generateId() })),
    };
    setFields((list) => [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]);
    setSelectedId(copy.id);
    requestFocus(fieldElId(copy.id, 'label'), true);
  }

  function remove(index: number) {
    const removed = fields[index];
    if (!removed) return;
    setFields((list) => list.filter((f) => f.id !== removed.id));
    setErrors((e) => ({ ...e, byField: omit(e.byField, removed.id) }));
    if (selectedId === removed.id) setSelectedId(null);

    // Keep keyboard focus in the list: the next question, else the previous one, else the palette.
    const rest = fields.filter((f) => f.id !== removed.id);
    const neighbor = rest[index] ?? rest[index - 1];
    if (!neighbor) requestFocus(PALETTE_ID);
    else if (neighbor.id === selectedId) requestFocus(fieldElId(neighbor.id, 'label'));
    else requestFocus(summaryElId(neighbor.id));

    const title = removed.label.trim() ? `«${removed.label.trim()}»` : 'без текста';
    toast.info(`Вопрос ${title} удалён`, {
      label: 'Отменить',
      onClick: () => {
        setFields((list) => {
          if (list.some((f) => f.id === removed.id) || list.length >= LIMITS.fields) return list;
          const at = Math.min(index, list.length);
          return [...list.slice(0, at), removed, ...list.slice(at)];
        });
        setSelectedId(removed.id);
        requestFocus(fieldElId(removed.id, 'label'));
      },
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-7">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="grid min-w-0 flex-[999_1_560px] grid-cols-[minmax(0,1fr)] gap-7">
        {showResponsesNote ? (
          <Alert tone="info" title="У формы уже есть ответы">
            Изменения применятся к новым ответам. Уже полученные ответы сохранят те вопросы, на которые отвечали студенты.
          </Alert>
        ) : null}

        <section aria-labelledby="settings-heading" className="grid gap-[18px] rounded-[32px] bg-neutral-100 px-5 py-6 sm:px-7 sm:py-[26px]">
          <h2 id="settings-heading" className="sr-only">
            Название и описание
          </h2>
          <div>
            <Label htmlFor="form-title">Название формы</Label>
            <TextInput
              id="form-title"
              value={draft.title}
              maxLength={LIMITS.title}
              invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'form-title-error' : undefined}
              placeholder="Например: Стажировка в отделе аналитики"
              onChange={(e) => {
                const title = e.target.value;
                setDraft((d) => ({ ...d, title }));
                setErrors((er) => ({ ...er, title: undefined }));
              }}
              className="min-h-12 text-[17px] font-semibold"
            />
            <FieldError id="form-title-error">{errors.title}</FieldError>
          </div>
          <div>
            <Label htmlFor="form-description" hint="видно студенту под названием">
              Описание
            </Label>
            <TextArea
              id="form-description"
              rows={3}
              value={draft.description}
              maxLength={LIMITS.description}
              invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'form-description-error' : 'form-description-count'}
              placeholder="Кратко расскажите о стажировке или мероприятии и сроках"
              onChange={(e) => {
                const description = e.target.value;
                setDraft((d) => ({ ...d, description }));
                setErrors((er) => ({ ...er, description: undefined }));
              }}
              className="text-[15px] leading-normal"
            />
            <FieldError id="form-description-error">{errors.description}</FieldError>
            <p id="form-description-count" className="mt-1 px-3 text-right text-xs text-neutral-700">
              {draft.description.length} / {LIMITS.description}
            </p>
          </div>
        </section>

        <section aria-labelledby="fields-heading">
          <div className="mb-3.5 flex items-baseline justify-between gap-3 px-1.5">
            <h2 id="fields-heading" className="m-0 text-[26px]">
              Вопросы
            </h2>
            <span className="text-sm text-neutral-700">
              {fields.length} из {LIMITS.fields}
            </span>
          </div>

          {errors.fields ? (
            <Alert tone="error" className="mb-3">
              <span id="fields-error">{errors.fields}</span>
            </Alert>
          ) : null}

          {fields.length === 0 ? (
            <EmptyState
              headingLevel="h3"
              icon={<IconForm size={24} />}
              title="В форме пока нет вопросов"
              action={
                <Button onClick={addStarter} icon={<IconPlus size={16} />}>
                  Добавить базовые поля
                </Button>
              }
            >
              Выберите тип вопроса в блоке «Добавить поле» или начните с базового набора: имя, email, телефон и согласие на обработку
              данных.
            </EmptyState>
          ) : (
            <ol className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
              {fields.map((f, i) => (
                <FieldCard
                  key={f.id}
                  field={f}
                  index={i}
                  total={fields.length}
                  selected={selectedId === f.id}
                  errors={errors.byField[f.id]}
                  onSelect={() => select(f.id)}
                  onCollapse={() => collapse(f.id)}
                  onChange={(patch) => update(f.id, patch)}
                  onMove={(dir) => move(i, dir)}
                  onDuplicate={() => duplicate(i)}
                  onDelete={() => remove(i)}
                  requestFocus={requestFocus}
                  canDuplicate={!full}
                />
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside
        aria-labelledby="palette-heading"
        className="max-w-full flex-[1_1_240px] rounded-[32px] bg-surface p-[22px] lg:sticky lg:top-6"
      >
        <h2 id="palette-heading" className="mb-1 ml-1 text-xl">
          Добавить поле
        </h2>
        <p className="mb-3.5 ml-1 text-[13px] text-neutral-700">Появится в конце списка</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1">
          {FIELD_TYPES.map((t, i) => (
            <button
              key={t.type}
              id={i === 0 ? PALETTE_ID : undefined}
              type="button"
              aria-disabled={full || undefined}
              onClick={() => add(t.type)}
              className={
                'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 text-left text-sm transition-colors ' +
                'hover:bg-neutral-100 active:bg-neutral-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-45'
              }
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-100 font-heading text-[13px] font-semibold text-accent-800"
              >
                {t.icon}
              </span>
              <span className="min-w-0 leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
        {full ? <p className="mt-3 ml-1 text-[13px] text-accent-800">Достигнут предел — {LIMITS.fields} полей.</p> : null}
      </aside>
    </div>
  );
}
