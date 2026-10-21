'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, type FormSummary } from '@/lib/api-client';
import { countLabel, formatDate, plural } from '@/lib/format';
import { Button, IconButton, buttonClasses } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, LoadingStatus, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { IconForm, IconLink, IconPlus, IconTrash } from '@/components/ui/icons';
import { copyText, publicFormPath } from '@/components/ui/clipboard';
import { useToast } from '@/components/ui/Toast';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; forms: FormSummary[]; recoveredFrom: string | null };

const FLOW = ['Соберите форму', 'Опубликуйте', 'Поделитесь ссылкой', 'Смотрите ответы'];

export function FormsList() {
  const router = useRouter();
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<FormSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.listForms().then(
      (r) => {
        if (!cancelled) setState({ status: 'ready', forms: r.forms, recoveredFrom: r.storage?.recoveredFrom ?? null });
      },
      (e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(e) });
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
      toast.error(`Не удалось создать форму: ${errorMessage(e)}`);
    }
  }

  async function copyLink(form: FormSummary) {
    const url = `${window.location.origin}${publicFormPath(form.publicId)}`;
    if (await copyText(url)) toast.success('Ссылка скопирована');
    else toast.error(`Не удалось скопировать. Ссылка: ${url}`);
  }

  function askDelete(form: FormSummary) {
    setDeleteError(null);
    setToDelete(form);
  }

  async function confirmDelete() {
    if (!toDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteForm(toDelete.id);
      const removedId = toDelete.id;
      setState((s) => (s.status === 'ready' ? { ...s, forms: s.forms.filter((f) => f.id !== removedId) } : s));
      setToDelete(null);
      toast.success('Форма удалена');
      // The row (and the button that opened the dialog) is gone: continue from the page heading.
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (e) {
      setDeleteError(`Не удалось удалить форму: ${errorMessage(e)}`);
    } finally {
      setDeleting(false);
    }
  }

  const createButton = (
    <Button variant="primary" onClick={create} aria-disabled={creating || undefined} icon={<IconPlus size={18} />} className="px-[22px] py-[13px]">
      {creating ? 'Создаём…' : 'Создать форму'}
    </Button>
  );

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-9 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[34px] outline-none sm:text-[46px]">
            Ваши формы
          </h1>
          <p className="mt-2.5 max-w-[480px] text-base text-pretty text-neutral-700">
            Создавайте формы для стажировок и мероприятий без помощи разработчиков.
          </p>
        </div>
        {state.status === 'ready' && state.forms.length > 0 ? createButton : null}
      </div>

      {state.status === 'ready' && state.recoveredFrom ? (
        <Alert tone="warning" role="alert" title="Файл данных был повреждён" className="mt-8">
          Он сохранён как «{state.recoveredFrom}», сервис запущен с пустой базой. Передайте этот файл разработчикам, чтобы восстановить
          формы и ответы.
        </Alert>
      ) : null}

      <div className="mt-10">
        {state.status === 'loading' ? <ListSkeleton /> : null}

        {state.status === 'error' ? <ErrorState title="Не удалось загрузить формы" message={state.message} onRetry={retry} /> : null}

        {state.status === 'ready' && state.forms.length === 0 ? (
          <EmptyState icon={<IconForm size={24} />} title="Здесь появятся ваши формы" action={createButton}>
            <ol className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-2">
              {FLOW.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-800">
                    {i + 1}
                  </span>
                  {step}
                  {i < FLOW.length - 1 ? (
                    <span aria-hidden="true" className="text-neutral-600">
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </EmptyState>
        ) : null}

        {state.status === 'ready' && state.forms.length > 0 ? (
          <ul className="m-0 grid list-none gap-3 p-0">
            {state.forms.map((form) => {
              const href = `/admin/forms/${encodeURIComponent(form.id)}`;
              return (
                <li
                  key={form.id}
                  className="flex flex-wrap items-center gap-x-[22px] gap-y-4 rounded-[32px] bg-neutral-100 p-[18px] transition-shadow hover:shadow-md"
                >
                  <div
                    className="grid size-16 shrink-0 place-items-center rounded-full bg-accent-2-200 text-center text-accent-2-800"
                    aria-label={countLabel(form.responseCount, ['ответ', 'ответа', 'ответов'])}
                    role="img"
                  >
                    <div className="leading-none">
                      <div className="font-heading text-[21px] font-semibold">{form.responseCount}</div>
                      <div className="mt-0.5 text-[10px]">{plural(form.responseCount, ['ответ', 'ответа', 'ответов'])}</div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-[1_1_220px]">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        href={href}
                        className="min-w-0 font-heading text-[21px] font-semibold leading-tight tracking-[-0.025em] text-ink no-underline hover:text-accent-700"
                      >
                        {form.title || 'Без названия'}
                      </Link>
                      <StatusBadge status={form.status} />
                    </div>
                    <p className="mt-1.5 text-sm text-neutral-700">
                      {countLabel(form.fieldCount, ['поле', 'поля', 'полей'])} · изменена {formatDate(form.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 sm:pr-1.5">
                    {form.status === 'published' ? (
                      <IconButton size="md" outlined label={`Копировать ссылку на форму «${form.title}»`} onClick={() => copyLink(form)}>
                        <IconLink />
                      </IconButton>
                    ) : null}
                    <IconButton size="md" outlined tone="danger" label={`Удалить форму «${form.title}»`} onClick={() => askDelete(form)}>
                      <IconTrash />
                    </IconButton>
                    <Link href={href} className={buttonClasses('primary', 'md', 'px-5')} aria-label={`Открыть форму «${form.title}»`}>
                      Открыть
                    </Link>
                  </div>
                </li>
              );
            })}
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
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <LoadingStatus label="Загружаем формы…" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-5 rounded-[32px] bg-neutral-100 p-[18px]">
          <Skeleton className="size-16 shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
