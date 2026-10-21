'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type FormSummary } from '@/lib/api-client';
import { countLabel, formatDate } from '@/lib/format';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { IconForm, IconLink, IconPlus, IconTrash } from '@/components/ui/icons';
import { copyText, publicFormPath } from '@/components/ui/clipboard';
import { useToast } from '@/components/ui/Toast';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; forms: FormSummary[] };

const FLOW = ['Соберите форму', 'Опубликуйте', 'Поделитесь ссылкой', 'Смотрите ответы'];

export function FormsList() {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<FormSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listForms().then(
      (forms) => {
        if (!cancelled) setState({ status: 'ready', forms });
      },
      (e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Неизвестная ошибка' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setState({ status: 'loading' });
    setReloadKey((k) => k + 1);
  };

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      const form = await api.createForm({ title: 'Новая форма' });
      router.push(`/admin/forms/${encodeURIComponent(form.id)}`);
    } catch (e) {
      setCreating(false);
      toast.error(`Не удалось создать форму: ${e instanceof Error ? e.message : 'ошибка'}`);
    }
  }

  async function copyLink(form: FormSummary) {
    const url = `${window.location.origin}${publicFormPath(form.publicId)}`;
    if (await copyText(url)) toast.success('Ссылка скопирована');
    else toast.error(`Не удалось скопировать. Ссылка: ${url}`);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteForm(toDelete.id);
      setState((s) => (s.status === 'ready' ? { status: 'ready', forms: s.forms.filter((f) => f.id !== toDelete.id) } : s));
      toast.success('Форма удалена');
      setToDelete(null);
    } catch (e) {
      toast.error(`Не удалось удалить форму: ${e instanceof Error ? e.message : 'ошибка'}`);
    } finally {
      setDeleting(false);
    }
  }

  const createButton = (
    <Button variant="primary" onClick={create} disabled={creating} icon={<IconPlus size={16} />}>
      {creating ? 'Создаём…' : 'Создать форму'}
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Формы откликов</h1>
          <p className="mt-1 text-sm text-slate-600">Создавайте формы для стажировок и мероприятий без помощи разработчиков.</p>
        </div>
        {state.status === 'ready' && state.forms.length > 0 ? createButton : null}
      </div>

      <div className="mt-8">
        {state.status === 'loading' ? <ListSkeleton /> : null}

        {state.status === 'error' ? <ErrorState title="Не удалось загрузить формы" message={state.message} onRetry={retry} /> : null}

        {state.status === 'ready' && state.forms.length === 0 ? (
          <EmptyState icon={<IconForm size={22} />} title="Здесь появятся ваши формы" action={createButton}>
            <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              {FLOW.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  {step}
                  {i < FLOW.length - 1 ? (
                    <span aria-hidden="true" className="text-slate-400">
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </EmptyState>
        ) : null}

        {state.status === 'ready' && state.forms.length > 0 ? (
          <ul className="grid gap-3">
            {state.forms.map((form) => (
              <li
                key={form.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/forms/${encodeURIComponent(form.id)}`}
                        className="min-w-0 truncate text-base font-semibold text-slate-900 hover:text-accent focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {form.title || 'Без названия'}
                      </Link>
                      <StatusBadge status={form.status} />
                    </div>
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span>{countLabel(form.fieldCount, ['поле', 'поля', 'полей'])}</span>
                      <span>{countLabel(form.responseCount, ['ответ', 'ответа', 'ответов'])}</span>
                      <span>Изменена {formatDate(form.updatedAt)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/forms/${encodeURIComponent(form.id)}`} className={buttonClasses('secondary', 'sm')}>
                      Открыть
                    </Link>
                    {form.status === 'published' ? (
                      <Button size="sm" variant="ghost" onClick={() => copyLink(form)} icon={<IconLink size={16} />}>
                        Копировать ссылку
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={() => setToDelete(form)}
                      icon={<IconTrash size={16} />}
                      aria-label={`Удалить форму «${form.title}»`}
                    >
                      Удалить
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Удалить форму?"
        message={
          toDelete ? (
            <>
              Форма «{toDelete.title}» будет удалена безвозвратно
              {toDelete.responseCount > 0
                ? ` вместе со всеми ответами (${countLabel(toDelete.responseCount, ['ответ', 'ответа', 'ответов'])}) и аналитикой.`
                : ' вместе с её ответами и аналитикой.'}{' '}
              Ссылка на форму перестанет работать.
            </>
          ) : null
        }
        confirmLabel="Удалить форму"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Загрузка форм">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-3 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
