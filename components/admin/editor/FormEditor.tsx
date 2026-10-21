'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SetStateAction } from 'react';
import { normalizeFormInput, type Field } from '@/lib/schema';
import { api, isApiError, type FormDto } from '@/lib/api-client';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, Skeleton, Spinner, StatusBadge } from '@/components/ui/feedback';
import { IconAlert, IconCheck, IconChevronLeft, IconForm } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { GuardedLink, useNavGuard } from '@/components/admin/NavGuard';
import { AnalyticsTab } from './AnalyticsTab';
import { BuilderTab, type Draft } from './BuilderTab';
import { PreviewTab } from './PreviewTab';
import { PublicLinkBox } from './PublicLinkBox';
import { ResponsesTab, type ResponsesState } from './ResponsesTab';
import { NO_ERRORS, countErrors, firstErrorTarget, mapErrors, type EditorErrors } from './errors';

type Tab = 'builder' | 'preview' | 'responses' | 'analytics';
const TAB_IDS: Tab[] = ['builder', 'preview', 'responses', 'analytics'];
const parseTab = (v: string | null): Tab => (TAB_IDS.includes(v as Tab) ? (v as Tab) : 'builder');

type LoadState = { status: 'loading' } | { status: 'not_found' } | { status: 'error'; message: string } | { status: 'ready' };
type Busy = null | 'save' | 'publish' | 'unpublish' | 'reload';

const contentOf = (f: FormDto): Draft => ({ title: f.title, description: f.description, fields: f.fields });

/** Order-stable serialization used to detect unsaved changes. */
function serialize(d: Draft): string {
  return JSON.stringify([
    d.title,
    d.description,
    d.fields.map((f: Field) => [f.id, f.type, f.label, f.hint, f.placeholder, f.required, f.options.map((o) => [o.id, o.label]), f.min, f.max]),
  ]);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Неизвестная ошибка');

export function FormEditor({ formId }: { formId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tab = parseTab(searchParams.get('tab'));
  const toast = useToast();
  const guard = useNavGuard();

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState<FormDto | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: '', description: '', fields: [] });
  const [errors, setErrors] = useState<EditorErrors>(NO_ERRORS);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<{ elId: string; select: boolean; n: number } | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [responses, setResponses] = useState<ResponsesState>({ status: 'loading' });
  const [respKey, setRespKey] = useState(0);

  // ---- loading -------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    api.getForm(formId).then(
      (form) => {
        if (cancelled) return;
        setSaved(form);
        setDraft(contentOf(form));
        setLoad({ status: 'ready' });
      },
      (e: unknown) => {
        if (cancelled) return;
        if (isApiError(e) && e.status === 404) setLoad({ status: 'not_found' });
        else setLoad({ status: 'error', message: errorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [formId, reloadKey]);

  // Responses are needed for the tab counter too; re-fetched whenever the "Ответы" tab is opened.
  const onResponsesTab = tab === 'responses';
  useEffect(() => {
    let cancelled = false;
    api.listResponses(formId).then(
      (r) => {
        if (!cancelled) setResponses({ status: 'ready', items: r.responses, total: r.total, refreshing: false });
      },
      (e: unknown) => {
        if (cancelled) return;
        setResponses((prev) => {
          if (prev.status === 'ready') return { ...prev, refreshing: false };
          return { status: 'error', message: errorMessage(e) };
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [formId, respKey, onResponsesTab]);

  const refreshResponses = useCallback(() => {
    setResponses((s) => (s.status === 'ready' ? { ...s, refreshing: true } : { status: 'loading' }));
    setRespKey((k) => k + 1);
  }, []);

  // ---- dirty tracking, leave protection ------------------------------------------------------
  const savedKey = useMemo(() => (saved ? serialize(contentOf(saved)) : ''), [saved]);
  const draftKey = useMemo(() => serialize(draft), [draft]);
  const dirty = saved !== null && savedKey !== draftKey;

  useEffect(() => {
    guard.setDirty(dirty);
  }, [dirty, guard]);
  useEffect(() => () => guard.setDirty(false), [guard]);
  // Let the guard know which history entry is "the editor" (tab switches create new entries).
  useEffect(() => {
    guard.syncEntry();
  }, [searchParams, guard]);

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
      el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
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
    (next: Tab) => {
      const qs = new URLSearchParams(searchParams.toString());
      if (next === 'builder') qs.delete('tab');
      else qs.set('tab', next);
      const s = qs.toString();
      window.history.pushState(null, '', s ? `${pathname}?${s}` : pathname);
    },
    [pathname, searchParams],
  );

  // ---- mutations -----------------------------------------------------------------------------
  function showErrors(next: EditorErrors, fields: Field[]) {
    setErrors(next);
    const target = firstErrorTarget(next, fields);
    if (target?.fieldId) setSelectedId(target.fieldId);
    if (tab !== 'builder') setTab('builder');
    if (target) requestFocus(target.elId);
  }

  function handleMutationError(e: unknown, fields: Field[], action: string) {
    if (isApiError(e) && e.code === 'VERSION_CONFLICT') {
      setConflict(true);
      return;
    }
    if (isApiError(e) && e.status === 400 && e.fields) {
      showErrors(mapErrors(e.fields, fields), fields);
      toast.error(e.fields.fields ?? 'Исправьте ошибки перед сохранением');
      return;
    }
    if (isApiError(e) && e.status === 404) {
      setLoad({ status: 'not_found' });
      return;
    }
    toast.error(`Не удалось ${action}: ${errorMessage(e)}`);
  }

  async function save(): Promise<boolean> {
    if (!saved || busyRef.current) return false;
    if (!dirty) return true;
    if (conflict) {
      toast.error('Форму изменили в другой вкладке. Сначала загрузите актуальную версию.');
      return false;
    }
    const snapshot = draft;
    const check = normalizeFormInput(snapshot);
    if (Object.keys(check.errors).length > 0) {
      showErrors(mapErrors(check.errors, snapshot.fields), snapshot.fields);
      toast.error('Исправьте ошибки перед сохранением');
      return false;
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
      return true;
    } catch (e) {
      handleMutationError(e, snapshot.fields, 'сохранить');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function publish() {
    if (!saved || busyRef.current) return;
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    busyRef.current = true;
    setBusy('publish');
    try {
      const form = await api.publishForm(saved.id);
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
      const form = await api.unpublishForm(saved.id);
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
      const form = await api.getForm(formId);
      setSaved(form);
      setDraft(contentOf(form));
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
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconForm size={22} />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Форма не найдена</h1>
        <p className="mt-2 text-sm text-slate-600">Возможно, её удалили или в ссылке ошибка.</p>
        <Link href="/admin" className={buttonClasses('primary', 'md', 'mt-6')}>
          К списку форм
        </Link>
      </div>
    );
  }

  if (load.status === 'error' || !saved) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <ErrorState
          title="Не удалось загрузить форму"
          message={load.status === 'error' ? load.message : undefined}
          onRetry={() => {
            setLoad({ status: 'loading' });
            setReloadKey((k) => k + 1);
          }}
        />
      </div>
    );
  }

  const published = saved.status === 'published';
  const total = responses.status === 'ready' ? responses.total : null;
  const errorCount = countErrors(errors);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'builder', label: 'Конструктор' },
    { id: 'preview', label: 'Предпросмотр' },
    { id: 'responses', label: total === null ? 'Ответы' : `Ответы (${total})` },
    { id: 'analytics', label: 'Аналитика' },
  ];

  function onTabKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const i = TAB_IDS.indexOf(tab);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (i + 1) % TAB_IDS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TAB_IDS.length) % TAB_IDS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TAB_IDS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(TAB_IDS[next]);
    document.getElementById(`tab-${TAB_IDS[next]}`)?.focus();
  }

  const saveState =
    busy === 'save' ? (
      <span className="inline-flex items-center gap-1.5 text-slate-600">
        <Spinner className="size-3.5" /> Сохранение…
      </span>
    ) : dirty ? (
      <span className="inline-flex items-center gap-1.5 text-amber-800">
        <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" /> Есть несохранённые изменения
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-emerald-800">
        <IconCheck size={14} /> Все изменения сохранены
      </span>
    );

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <GuardedLink
            href="/admin"
            className="inline-flex min-h-9 items-center gap-1 rounded-lg pr-2 text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <IconChevronLeft size={16} /> Все формы
          </GuardedLink>

          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                  {draft.title.trim() || 'Без названия'}
                </h1>
                <StatusBadge status={saved.status} />
              </div>
              <p className="mt-1 text-sm" aria-live="polite">
                {saveState}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={!dirty || busy !== null} title="Сохранить (Ctrl+S)">
                {busy === 'save' ? 'Сохранение…' : 'Сохранить'}
              </Button>
              {published ? (
                <Button id="unpublish-button" onClick={() => setConfirmUnpublish(true)} disabled={busy !== null}>
                  Снять с публикации
                </Button>
              ) : (
                <Button
                  id="publish-button"
                  variant="primary"
                  onClick={() => void publish()}
                  disabled={busy !== null}
                  title={dirty ? 'Сначала сохранит изменения, затем опубликует' : undefined}
                >
                  {busy === 'publish' ? 'Публикация…' : 'Опубликовать'}
                </Button>
              )}
            </div>
          </div>

          <div role="tablist" aria-label="Разделы формы" onKeyDown={onTabKeyDown} className="-mx-4 mt-4 flex overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6">
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
                    'relative min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors sm:px-4 ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ' +
                    (active ? 'border-accent text-accent' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900')
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
        {conflict ? (
          <Alert
            tone="warning"
            role="alert"
            title="Форму изменили в другой вкладке"
            actions={
              <Button variant="primary" size="sm" onClick={() => void reloadLatest()} disabled={busy !== null}>
                {busy === 'reload' ? 'Загрузка…' : 'Загрузить актуальную версию'}
              </Button>
            }
          >
            Пока вы редактировали, эту форму сохранили в другом окне. Чтобы не затереть чужие изменения, сохранение остановлено. Загрузите
            актуальную версию — ваши несохранённые правки в этой вкладке будут отменены.
          </Alert>
        ) : null}

        {errorCount > 0 ? (
          <Alert
            tone="error"
            role="alert"
            title="Исправьте ошибки перед сохранением"
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
            {errorCount === 1 ? 'Найдена 1 ошибка — она отмечена красным.' : `Найдено ошибок: ${errorCount}. Они отмечены красным.`}
            {errors.other.length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {errors.other.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}

        {published ? <PublicLinkBox publicId={saved.publicId} /> : null}

        {!published && tab === 'builder' && draft.fields.length > 0 && errorCount === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <IconAlert size={16} className="shrink-0 text-slate-500" />
            Форма в черновике: студенты не увидят её, пока вы не нажмёте «Опубликовать».
          </p>
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
              showResponsesNote={published && total !== null && total > 0}
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
    <div aria-busy="true" aria-label="Загрузка формы">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-4 sm:px-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-7 w-64 max-w-full" />
          <Skeleton className="mt-2 h-4 w-48" />
          <div className="mt-6 flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-24" />
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
