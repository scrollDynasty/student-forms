'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from 'react';
import { normalizeFormInput, type Field } from '@/lib/schema';
import { api, errorMessage, isRequestError, type FormDto } from '@/lib/api-client';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, LoadingStatus, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { IconChevronLeft, IconForm } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { GuardedLink, useNavGuard } from '@/components/admin/NavGuard';
import { AnalyticsTab } from './AnalyticsTab';
import { BuilderTab, type Draft } from './BuilderTab';
import { PreviewTab } from './PreviewTab';
import { PublicLinkBox } from './PublicLinkBox';
import { ResponsesTab, type ResponsesState } from './ResponsesTab';
import { contentKey } from './contentKey';
import { NO_ERRORS, countErrors, firstErrorTarget, mapErrors, templateTexts, type EditorErrors } from './errors';

type Tab = 'builder' | 'preview' | 'responses' | 'analytics';
const TAB_IDS: Tab[] = ['builder', 'preview', 'responses', 'analytics'];
const parseTab = (v: string | null): Tab => (TAB_IDS.includes(v as Tab) ? (v as Tab) : 'builder');

type LoadState = { status: 'loading' } | { status: 'not_found' } | { status: 'error'; message: string } | { status: 'ready' };
type Busy = null | 'save' | 'publish' | 'unpublish' | 'reload';

const contentOf = (f: FormDto): Draft => ({ title: f.title, description: f.description, fields: f.fields });

export function FormEditor({ formId }: { formId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tab = parseTab(searchParams.get('tab'));
  const toast = useToast();
  const guard = useNavGuard();

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState<FormDto | null>(null);
  const [responseCount, setResponseCount] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: '', description: '', fields: [] });
  const [errors, setErrors] = useState<EditorErrors>(NO_ERRORS);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<{ elId: string; select: boolean; n: number } | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  /** Placeholder texts the manager is asked about before publishing (null: no question open). */
  const [templateWarning, setTemplateWarning] = useState<string[] | null>(null);
  const [responses, setResponses] = useState<ResponsesState>({ status: 'loading' });
  const responsesLoaded = useRef(false);
  const [respKey, setRespKey] = useState(0);

  // ---- loading -------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    api.getForm(formId).then(
      ({ form, responseCount: count }) => {
        if (cancelled) return;
        setSaved(form);
        setDraft(contentOf(form));
        setResponseCount(count);
        setLoad({ status: 'ready' });
      },
      (e: unknown) => {
        if (cancelled) return;
        if (isRequestError(e) && e.status === 404) setLoad({ status: 'not_found' });
        else setLoad({ status: 'error', message: errorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [formId, reloadKey]);

  // The full response list is downloaded only while the «Ответы» tab is open (the tab label uses
  // responseCount from GET /api/forms/:id); it is re-fetched each time the tab is opened and on «Обновить».
  const onResponsesTab = tab === 'responses';
  useEffect(() => {
    if (!onResponsesTab) return;
    let cancelled = false;
    api.listResponses(formId).then(
      (r) => {
        if (cancelled) return;
        responsesLoaded.current = true;
        setResponses({ status: 'ready', items: r.responses, total: r.total, refreshing: false });
        setResponseCount(r.total);
      },
      (e: unknown) => {
        if (cancelled) return;
        if (responsesLoaded.current) {
          // Keep showing the previous list, but never fail silently.
          setResponses((prev) => (prev.status === 'ready' ? { ...prev, refreshing: false } : prev));
          toast.error(`Не удалось обновить ответы: ${errorMessage(e)}`);
        } else {
          setResponses({ status: 'error', message: errorMessage(e) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [formId, respKey, onResponsesTab, toast]);

  const refreshResponses = useCallback(() => {
    setResponses((s) => (s.status === 'ready' ? { ...s, refreshing: true } : { status: 'loading' }));
    setRespKey((k) => k + 1);
  }, []);

  // ---- dirty tracking, leave protection ------------------------------------------------------
  const savedKey = useMemo(() => (saved ? contentKey(contentOf(saved)) : ''), [saved]);
  const draftKey = useMemo(() => contentKey(draft), [draft]);
  const dirty = saved !== null && savedKey !== draftKey;

  useEffect(() => {
    guard.setDirty(dirty);
  }, [dirty, guard]);
  useEffect(() => () => guard.release(), [guard]);
  // Let the guard know which history entry is "the editor" (tab switches create new entries).
  useEffect(() => {
    guard.syncEntry();
  }, [searchParams, guard]);

  // The page metadata can't know the form, so name the browser tab here (like the public form does).
  const pageTitle = saved
    ? `${saved.title} · Редактор формы`
    : load.status === 'not_found'
      ? 'Форма не найдена'
      : load.status === 'error'
        ? 'Не удалось загрузить форму'
        : null;
  useEffect(() => {
    if (pageTitle) document.title = `${pageTitle} · Формы откликов`;
  }, [pageTitle, searchParams]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // ---- focus management ----------------------------------------------------------------------
  const requestFocus = useCallback((elId: string, select = false) => {
    setFocusReq((r) => ({ elId, select, n: (r?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!focusReq) return;
    // The target may appear a few frames later (e.g. after switching to the builder tab), so retry briefly.
    let raf = 0;
    let attempts = 0;
    const tryFocus = () => {
      const el = document.getElementById(focusReq.elId);
      if (!el) {
        if (++attempts < 30) raf = requestAnimationFrame(tryFocus);
        return;
      }
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
      el.focus({ preventScroll: true });
      if (focusReq.select && el instanceof HTMLInputElement) el.select();
    };
    raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, [focusReq]);

  // Any edit makes form-level server messages that are not tied to a field stale.
  const editDraft = useCallback((update: SetStateAction<Draft>) => {
    setDraft(update);
    setErrors((e) => (e.other.length > 0 ? { ...e, other: [] } : e));
  }, []);

  // ---- tabs (kept in ?tab= so deep links and the back button work) ---------------------------
  const setTab = useCallback(
    (next: Tab, mode: 'push' | 'replace' = 'push') => {
      if (next === tab) return; // no duplicate history entry, no refresh that would never finish
      const qs = new URLSearchParams(searchParams.toString());
      if (next === 'builder') qs.delete('tab');
      else qs.set('tab', next);
      const s = qs.toString();
      const url = s ? `${pathname}?${s}` : pathname;
      // The list re-downloads on every visit: show that the rows on screen may be about to change.
      if (next === 'responses') setResponses((r) => (r.status === 'ready' ? { ...r, refreshing: true } : r));
      // Arrow-key browsing replaces the entry so it doesn't flood the history.
      if (mode === 'replace') window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
    },
    [pathname, searchParams, tab],
  );

  // On a phone the tab strip scrolls sideways: keep the current section in view.
  const tablistRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = tablistRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active) return;
    const a = active.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    if (a.left < l.left) list.scrollLeft -= l.left - a.left;
    else if (a.right > l.right) list.scrollLeft += a.right - l.right;
  }, [tab, load.status]);

  // ---- mutations -----------------------------------------------------------------------------
  function showErrors(next: EditorErrors, fields: Field[]) {
    setErrors(next);
    const target = firstErrorTarget(next, fields);
    if (target?.fieldId) setSelectedId(target.fieldId);
    if (tab !== 'builder') setTab('builder');
    if (target) requestFocus(target.elId);
  }

  function handleMutationError(e: unknown, fields: Field[], action: string) {
    if (isRequestError(e) && e.code === 'VERSION_CONFLICT') {
      setConflict(true);
      return;
    }
    if (isRequestError(e) && e.status === 400 && e.fields) {
      // The error banner (role="alert") announces it; a toast on top would say the same thing twice.
      showErrors(mapErrors(e.fields, fields), fields);
      return;
    }
    if (isRequestError(e) && e.status === 404) {
      setLoad({ status: 'not_found' });
      return;
    }
    toast.error(`Не удалось ${action}: ${errorMessage(e)}`);
  }

  async function save(): Promise<FormDto | null> {
    if (!saved || busyRef.current) return null;
    if (!dirty) return saved;
    if (conflict) {
      toast.error('Форму изменили в другой вкладке. Сначала загрузите актуальную версию.');
      return null;
    }
    const snapshot = draft;
    const check = normalizeFormInput(snapshot);
    if (Object.keys(check.errors).length > 0) {
      showErrors(mapErrors(check.errors, snapshot.fields), snapshot.fields);
      return null;
    }
    busyRef.current = true;
    setBusy('save');
    try {
      const form = await api.updateForm(saved.id, { ...snapshot, version: saved.version });
      setSaved(form);
      // Keep keystrokes typed while the request was in flight.
      setDraft((cur) => (cur === snapshot ? contentOf(form) : cur));
      setErrors(NO_ERRORS);
      toast.success('Сохранено');
      return form;
    } catch (e) {
      handleMutationError(e, snapshot.fields, 'сохранить');
      return null;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function publish(confirmedTemplates = false) {
    if (!saved || busyRef.current) return;
    setTemplateWarning(null);
    if (conflict) {
      toast.error('Форму изменили в другой вкладке. Сначала загрузите актуальную версию.');
      return;
    }
    // Publishing with unsaved changes saves first and stops if saving fails.
    const current = dirty ? await save() : saved;
    if (!current) return;
    // Asked only about a valid, saved form: errors come first, and «Опубликовать как есть» then just publishes.
    const templates = confirmedTemplates ? [] : templateTexts(current.fields);
    if (templates.length > 0) {
      setTemplateWarning(templates);
      return;
    }
    busyRef.current = true;
    setBusy('publish');
    try {
      const form = await api.publishForm(current.id, current.version);
      setSaved(form);
      toast.success('Форма опубликована');
      requestFocus('unpublish-button');
    } catch (e) {
      handleMutationError(e, draft.fields, 'опубликовать форму');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function unpublish() {
    if (!saved || busyRef.current) return;
    busyRef.current = true;
    setBusy('unpublish');
    try {
      const form = await api.unpublishForm(saved.id, saved.version);
      setSaved(form);
      setConfirmUnpublish(false);
      toast.success('Публикация снята');
      requestFocus('publish-button');
    } catch (e) {
      setConfirmUnpublish(false);
      handleMutationError(e, draft.fields, 'снять форму с публикации');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function reloadLatest() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('reload');
    try {
      const { form, responseCount: count } = await api.getForm(formId);
      setSaved(form);
      setDraft(contentOf(form));
      setResponseCount(count);
      setErrors(NO_ERRORS);
      setConflict(false);
      setSelectedId(null);
      toast.info('Загружена актуальная версия формы');
    } catch (e) {
      toast.error(`Не удалось загрузить форму: ${errorMessage(e)}`);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.code !== 'KeyS' && e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    if (!saved) return;
    if (!dirty) toast.info('Все изменения уже сохранены');
    else void save();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ---- render ---------------------------------------------------------------------------------
  if (load.status === 'loading') return <EditorSkeleton />;

  if (load.status === 'not_found') {
    return (
      <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-9 sm:px-7">
        <div className="max-w-xl rounded-[32px] bg-neutral-100 px-6 py-10 sm:px-9">
          <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-accent-2-200 text-accent-2-800">
            <IconForm size={24} />
          </div>
          <h1 className="text-[30px]">Форма не найдена</h1>
          <p className="mt-2 text-[15px] text-neutral-700">Возможно, её удалили или в ссылке ошибка.</p>
          <Link href="/admin" className={buttonClasses('primary', 'md', 'mt-6')}>
            К списку форм
          </Link>
        </div>
      </div>
    );
  }

  if (load.status === 'error' || !saved) {
    return (
      <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-9 sm:px-7">
        <div className="max-w-xl">
          <ErrorState
            title="Не удалось загрузить форму"
            message={load.status === 'error' ? load.message : undefined}
            onRetry={() => {
              setLoad({ status: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        </div>
      </div>
    );
  }

  const published = saved.status === 'published';
  const errorCount = countErrors(errors);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'builder', label: 'Конструктор' },
    { id: 'preview', label: 'Предпросмотр' },
    { id: 'responses', label: responseCount === null ? 'Ответы' : `Ответы · ${responseCount}` },
    { id: 'analytics', label: 'Аналитика' },
  ];

  function onTabKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const i = TAB_IDS.indexOf(tab);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (i + 1) % TAB_IDS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TAB_IDS.length) % TAB_IDS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TAB_IDS.length - 1;
    const target = next === null ? undefined : TAB_IDS[next];
    if (!target) return;
    e.preventDefault();
    setTab(target, 'replace');
    document.getElementById(`tab-${target}`)?.focus();
  }

  const saveState =
    busy === 'save'
      ? { dot: 'bg-neutral-500', text: 'Сохранение…' }
      : dirty
        ? { dot: 'bg-accent', text: 'Есть несохранённые изменения' }
        : { dot: 'bg-accent-2', text: 'Все изменения сохранены' };

  return (
    <div>
      <div className="mx-auto max-w-[1120px] px-4 pt-3 sm:px-7">
        <GuardedLink
          href="/admin"
          className={buttonClasses('ghost', 'sm', '-ml-1 gap-1 py-1.5 pl-1 pr-2.5 text-[15px] text-neutral-700 hover:text-ink')}
        >
          <IconChevronLeft /> Все формы
        </GuardedLink>

        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="m-0 min-w-0 break-words text-[28px] sm:text-[38px]">{draft.title.trim() || 'Без названия'}</h1>
              <StatusBadge status={saved.status} />
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm text-neutral-700" aria-live="polite">
              <span aria-hidden="true" className={`size-2 rounded-full ${saveState.dot}`} />
              {saveState.text}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} aria-disabled={!dirty || busy !== null || undefined} title="Сохранить (Ctrl+S)" className="px-5">
              {busy === 'save' ? 'Сохранение…' : 'Сохранить'}
            </Button>
            {published ? (
              <Button id="unpublish-button" onClick={() => setConfirmUnpublish(true)} aria-disabled={busy !== null || undefined}>
                Снять с публикации
              </Button>
            ) : (
              <Button
                id="publish-button"
                variant="primary"
                onClick={() => void publish()}
                aria-disabled={busy !== null || undefined}
                title={dirty ? 'Сначала сохранит изменения, затем опубликует' : undefined}
                className="px-[22px]"
              >
                {busy === 'publish' ? 'Публикация…' : 'Опубликовать'}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Разделы формы"
            onKeyDown={onTabKeyDown}
            className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-[5px] [scrollbar-width:none]"
          >
            {tabs.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={active ? `panel-${t.id}` : undefined}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={
                    'min-h-10 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-[18px] py-2.5 text-sm font-semibold transition-colors ' +
                    (active ? 'bg-neutral-100 text-ink shadow-sm' : 'text-neutral-700 hover:bg-neutral-100/60 hover:text-ink')
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {published ? <PublicLinkBox publicId={saved.publicId} /> : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] space-y-4 px-4 pb-24 pt-7 sm:px-7">
        {conflict ? (
          <Alert
            tone="warning"
            role="alert"
            title="Форму изменили в другой вкладке"
            actions={
              <Button variant="primary" size="sm" onClick={() => void reloadLatest()} aria-disabled={busy !== null || undefined}>
                {busy === 'reload' ? 'Загрузка…' : 'Загрузить актуальную версию'}
              </Button>
            }
          >
            Пока вы редактировали, эту форму сохранили в другом окне. Чтобы не затереть чужие изменения, сохранение и публикация
            остановлены. Загрузите актуальную версию — ваши несохранённые правки в этой вкладке будут отменены.
          </Alert>
        ) : null}

        {errorCount > 0 ? (
          <Alert
            tone="error"
            role="alert"
            title="Исправьте ошибки в форме"
            actions={
              <Button
                size="sm"
                onClick={() => {
                  const target = firstErrorTarget(errors, draft.fields);
                  if (target?.fieldId) setSelectedId(target.fieldId);
                  if (tab !== 'builder') setTab('builder');
                  if (target) requestFocus(target.elId);
                }}
              >
                Перейти к первой ошибке
              </Button>
            }
          >
            {errorCount === 1 ? 'Найдена 1 ошибка — она отмечена в форме.' : `Найдено ошибок: ${errorCount}. Они отмечены в форме.`}{' '}
            Сохранить и опубликовать форму можно после исправления.
            {errors.other.length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {errors.other.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}

        {!published && tab === 'builder' && draft.fields.length > 0 && errorCount === 0 ? (
          <p className="px-1.5 text-sm text-neutral-700">Форма в черновике: студенты не увидят её, пока вы не нажмёте «Опубликовать».</p>
        ) : null}
        {published && tab === 'builder' && errorCount === 0 && (responseCount ?? 0) === 0 ? (
          <p className="px-1.5 text-sm text-neutral-700">Форма опубликована: сохранённые изменения студенты увидят сразу.</p>
        ) : null}

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'builder' ? (
            <BuilderTab
              draft={draft}
              setDraft={editDraft}
              errors={errors}
              setErrors={setErrors}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              requestFocus={requestFocus}
              showResponsesNote={published && (responseCount ?? 0) > 0}
            />
          ) : null}
          {tab === 'preview' ? <PreviewTab draft={draft} /> : null}
          {tab === 'responses' ? (
            <ResponsesTab
              state={responses}
              onRefresh={refreshResponses}
              csvUrl={api.responsesCsvUrl(saved.id)}
              formVersion={saved.version}
              fields={saved.fields}
              published={published}
            />
          ) : null}
          {tab === 'analytics' ? <AnalyticsTab formId={saved.id} published={published} /> : null}
        </div>
      </div>

      <ConfirmDialog
        open={templateWarning !== null}
        title="Опубликовать с шаблонными текстами?"
        message={
          <>
            В форме остались тексты, которые конструктор подставляет сам. Студенты увидят их как есть:
            <ul className="mb-0 mt-2 list-disc space-y-1 pl-5">
              {templateWarning?.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        }
        confirmLabel="Опубликовать как есть"
        cancelLabel="Вернуться к редактированию"
        onConfirm={() => void publish(true)}
        onCancel={() => setTemplateWarning(null)}
      />
      <ConfirmDialog
        open={confirmUnpublish}
        title="Снять форму с публикации?"
        message="Студенты больше не смогут отправлять ответы по ссылке — они увидят сообщение, что форма не принимает ответы. Полученные ответы сохранятся, форму можно будет опубликовать снова."
        confirmLabel="Снять с публикации"
        busy={busy === 'unpublish'}
        onConfirm={() => void unpublish()}
        onCancel={() => setConfirmUnpublish(false)}
      />
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div aria-busy="true">
      <LoadingStatus label="Загружаем форму…" />
      <div className="mx-auto max-w-[1120px] px-4 pt-3 sm:px-7">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-4 h-10 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-52" />
        <Skeleton className="mt-7 h-[50px] w-[460px] max-w-full" />
      </div>
      <div className="mx-auto max-w-[1120px] space-y-3 px-4 pt-7 sm:px-7">
        <div className="h-40 animate-pulse rounded-[32px] bg-neutral-200 motion-reduce:animate-none" aria-hidden="true" />
        <Skeleton className="h-[60px] w-full" />
        <Skeleton className="h-[60px] w-full" />
      </div>
    </div>
  );
}
