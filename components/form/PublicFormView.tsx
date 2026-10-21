'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { UUID_RE, generateUuid, type Answers } from '@/lib/schema';
import { api, changedFormFrom, isApiError, type PublicForm } from '@/lib/api-client';
import { Alert, Skeleton, Spinner } from '@/components/ui/feedback';
import { IconAlert, IconForm, IconRefresh } from '@/components/ui/icons';
import { FormRenderer, type SubmitOutcome } from './FormRenderer';
import { SubmitSuccess } from './SubmitSuccess';

type PageState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'closed' }
  | { status: 'error'; message: string }
  | { status: 'ready'; form: PublicForm };

const sessionKey = (publicId: string) => `sf-session-${publicId}`;

function readStored(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode / blocked): the in-memory id is used instead
  }
}

export function PublicFormView({ publicId }: { publicId: string }) {
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [success, setSuccess] = useState<string | null>(null);
  const [formChanged, setFormChanged] = useState(0); // number of FORM_CHANGED refreshes, 0 = none
  const [round, setRound] = useState(0);

  // Analytics session (one per form per browser tab, survives reloads via sessionStorage).
  const sessionRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const touchedRef = useRef(new Set<string>());
  const viewSentRound = useRef<number | null>(null);
  // Idempotency key: created on the first submit attempt, reused for retries until success.
  const submissionIdRef = useRef<string | null>(null);

  const getSessionId = useCallback(() => {
    if (sessionRef.current) return sessionRef.current;
    const key = sessionKey(publicId);
    let id = readStored(key);
    if (!id || !UUID_RE.test(id)) {
      id = generateUuid();
      writeStored(key, id);
    }
    sessionRef.current = id;
    return id;
  }, [publicId]);

  useEffect(() => {
    let cancelled = false;
    api.getPublicForm(publicId).then(
      (form) => {
        if (!cancelled) setState({ status: 'ready', form });
      },
      (e: unknown) => {
        if (cancelled) return;
        if (isApiError(e) && e.status === 404) setState({ status: 'not_found' });
        else if (isApiError(e) && e.status === 403) setState({ status: 'closed' });
        else setState({ status: 'error', message: e instanceof Error ? e.message : 'Неизвестная ошибка' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [publicId, reloadKey]);

  const ready = state.status === 'ready';
  const formTitle = state.status === 'ready' ? state.form.title : null;

  useEffect(() => {
    if (formTitle) document.title = formTitle;
  }, [formTitle]);

  // After a 409 FORM_CHANGED the re-rendered form shows a notice: move focus there so it is seen and announced
  // (the counter re-runs this on every repeated change).
  useEffect(() => {
    if (formChanged === 0) return;
    const el = document.getElementById('form-changed-notice');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }, [formChanged]);

  // "view": the form was rendered for this session — once per page load (and once per new response round).
  useEffect(() => {
    if (!ready || success !== null || viewSentRound.current === round) return;
    viewSentRound.current = round;
    api.sendEvent(publicId, { sessionId: getSessionId(), type: 'view' });
  }, [ready, success, round, publicId, getSessionId]);

  const onFieldChange = useCallback(
    (fieldId: string) => {
      const sessionId = getSessionId();
      if (!startedRef.current) {
        startedRef.current = true;
        api.sendEvent(publicId, { sessionId, type: 'start' });
      }
      if (!touchedRef.current.has(fieldId)) {
        touchedRef.current.add(fieldId);
        api.sendEvent(publicId, { sessionId, type: 'field', fieldId });
      }
    },
    [publicId, getSessionId],
  );

  async function submit(values: Answers): Promise<SubmitOutcome> {
    if (state.status !== 'ready') return { ok: false };
    if (!submissionIdRef.current) submissionIdRef.current = generateUuid();
    try {
      const res = await api.submitResponse(publicId, {
        answers: values,
        submissionId: submissionIdRef.current,
        sessionId: getSessionId(),
        formVersion: state.form.version,
      });
      submissionIdRef.current = null;
      writeStored(sessionKey(publicId), null);
      sessionRef.current = null;
      setFormChanged(0);
      setSuccess(res.submittedAt);
      return { ok: true };
    } catch (e) {
      if (!isApiError(e)) return { ok: false, message: 'Не удалось отправить ответ. Попробуйте ещё раз.' };
      if (e.code === 'NETWORK') {
        return {
          ok: false,
          message: 'Нет соединения с сервером. Ваши ответы остались на странице — проверьте интернет и нажмите «Отправить» ещё раз.',
        };
      }
      if (e.status === 403) {
        setState({ status: 'closed' });
        return { ok: false };
      }
      if (e.status === 404) {
        setState({ status: 'not_found' });
        return { ok: false };
      }
      if (e.status === 409 && e.code === 'FORM_CHANGED') {
        const fresh = changedFormFrom(e);
        if (fresh) {
          setState({ status: 'ready', form: fresh });
          setFormChanged((n) => n + 1);
          return { ok: false };
        }
        return { ok: false, message: 'Форма была обновлена. Обновите страницу и проверьте ответы.' };
      }
      if (e.status === 400 && e.fields) {
        return { ok: false, fieldErrors: e.fields, message: 'Исправьте отмеченные ответы и отправьте ещё раз.' };
      }
      return { ok: false, message: `Не удалось отправить ответ: ${e.message}` };
    }
  }

  function again() {
    startedRef.current = false;
    touchedRef.current = new Set();
    submissionIdRef.current = null;
    setSuccess(null);
    setRound((r) => r + 1);
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-indigo-50/80 via-background to-background">
      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-12">
        {state.status === 'loading' ? <LoadingCard /> : null}

        {state.status === 'not_found' ? (
          <StateCard
            icon={<IconForm size={24} />}
            title="Форма не найдена"
            text="Возможно, в ссылке опечатка или форму удалили. Проверьте ссылку или попросите организатора прислать её ещё раз."
          />
        ) : null}

        {state.status === 'closed' ? (
          <StateCard
            icon={<IconForm size={24} />}
            title="Форма сейчас не принимает ответы"
            text="Организатор закрыл приём ответов или ещё не открыл его. Попробуйте позже или свяжитесь с организатором."
          />
        ) : null}

        {state.status === 'error' ? (
          <StateCard
            icon={<IconAlert size={24} />}
            title="Не удалось загрузить форму"
            text={state.message === 'Нет соединения с сервером' ? 'Нет соединения с сервером. Проверьте интернет.' : state.message}
            action={
              <button
                type="button"
                onClick={() => {
                  setState({ status: 'loading' });
                  setReloadKey((k) => k + 1);
                }}
                className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-base font-semibold text-white hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <IconRefresh size={18} /> Повторить
              </button>
            }
          />
        ) : null}

        {state.status === 'ready' && success !== null ? (
          <SubmitSuccess title={state.form.title} submittedAt={success} onAgain={again} />
        ) : null}

        {state.status === 'ready' && success === null ? (
          <FormRenderer
            key={round}
            form={state.form}
            mode="public"
            onSubmit={submit}
            onFieldChange={onFieldChange}
            notice={
              formChanged > 0 ? (
                <div key={formChanged} id="form-changed-notice" tabIndex={-1} className="rounded-xl focus:outline-none">
                  <Alert tone="warning" role="alert" title="Форма была обновлена, проверьте ответы">
                    Организатор изменил вопросы, пока вы заполняли форму. Ваши ответы на сохранившиеся вопросы остались на месте.
                  </Alert>
                </div>
              ) : null
            }
          />
        ) : null}

        <p className="mt-8 text-center text-xs text-slate-500">Формы откликов · карьерная платформа для студентов</p>
      </main>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-busy="true">
      <p className="sr-only" role="status">
        Загружаем форму…
      </p>
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mt-8">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-12 w-full" />
        </div>
      ))}
      <div className="mt-8 flex items-center gap-2 text-sm text-slate-500" aria-hidden="true">
        <Spinner /> Загружаем форму…
      </div>
    </div>
  );
}

function StateCard({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>
      <h1 className="mt-5 text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-slate-600">{text}</p>
      {action}
    </div>
  );
}
