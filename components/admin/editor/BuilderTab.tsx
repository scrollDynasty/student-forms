'use client';

import type { Dispatch, SetStateAction } from 'react';
import { FIELD_TYPES, LIMITS, createField, generateId, type Field, type FieldType } from '@/lib/schema';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Alert } from '@/components/ui/feedback';
import { FieldError, Label, TextArea, TextInput } from '@/components/ui/inputs';
import { IconForm, IconPlus } from '@/components/ui/icons';
import { FieldCard } from './FieldCard';
import { PALETTE_ID, clearFieldErrors, fieldElId, omit, summaryElId, type EditorErrors } from './errors';

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

  function move(index: number, dir: -1 | 1) {
    setFields((list) => {
      const j = index + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function duplicate(index: number) {
    if (full) return;
    const src = fields[index];
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-6">
        {showResponsesNote ? (
          <Alert tone="info" title="У формы уже есть ответы">
            Изменения применятся к новым ответам. Уже полученные ответы сохранят те вопросы, на которые отвечали студенты.
          </Alert>
        ) : null}

        <section aria-labelledby="settings-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
          <h2 id="settings-heading" className="sr-only">
            Название и описание
          </h2>
          <div className="grid gap-5">
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
                className="text-lg font-medium sm:text-base"
              />
              <FieldError id="form-title-error">{errors.title}</FieldError>
            </div>
            <div>
              <Label htmlFor="form-description" hint="(необязательно — видно студенту под названием)">
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
              />
              <FieldError id="form-description-error">{errors.description}</FieldError>
              <p id="form-description-count" className="mt-1 text-right text-xs text-slate-500">
                {draft.description.length} / {LIMITS.description}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="fields-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="fields-heading" className="text-base font-semibold text-slate-900">
              Вопросы
            </h2>
            <span className="text-sm text-slate-500">
              {fields.length} из {LIMITS.fields}
            </span>
          </div>

          {errors.fields ? (
            <p id="fields-error" role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
              {errors.fields}
            </p>
          ) : null}

          {fields.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <IconForm size={22} />
              </div>
              <h3 className="text-base font-semibold text-slate-900">В форме пока нет вопросов</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                Выберите тип вопроса в блоке «Добавить поле» или начните с базового набора: имя, email, телефон и согласие на обработку
                данных.
              </p>
              <Button className="mt-5" onClick={addStarter} icon={<IconPlus size={16} />}>
                Добавить базовые поля
              </Button>
            </div>
          ) : (
            <ol className="grid gap-2">
              {fields.map((f, i) => (
                <FieldCard
                  key={f.id}
                  field={f}
                  index={i}
                  total={fields.length}
                  selected={selectedId === f.id}
                  errors={errors.byField[f.id]}
                  onSelect={() => setSelectedId(f.id)}
                  onCollapse={() => setSelectedId(null)}
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

      <aside aria-labelledby="palette-heading" className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <h2 id="palette-heading" className="text-sm font-semibold text-slate-900">
            Добавить поле
          </h2>
          <p className="mt-1 text-xs text-slate-500">Новое поле появится в конце списка.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {FIELD_TYPES.map((t, i) => (
              <button
                key={t.type}
                id={i === 0 ? PALETTE_ID : undefined}
                type="button"
                disabled={full}
                onClick={() => add(t.type)}
                className={
                  'flex min-h-11 items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 text-left text-sm text-slate-800 transition-colors ' +
                  'hover:border-accent/50 hover:bg-accent-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
                  'disabled:cursor-not-allowed disabled:opacity-50'
                }
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700"
                >
                  {t.icon}
                </span>
                <span className="min-w-0 leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
          {full ? <p className="mt-3 text-xs text-amber-800">Достигнут предел — {LIMITS.fields} полей.</p> : null}
        </div>
      </aside>
    </div>
  );
}
