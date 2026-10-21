'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { UUID_RE, generateUuid, type Answers } from '@/lib/schema';
import { api, changedFormFrom, errorMessage, isApiError, type PublicForm } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Alert, LoadingStatus, Skeleton } from '@/components/ui/feedback';
import { IconAlert, IconForm, IconRefresh } from '@/components/ui/icons';
import { FormRenderer, sanitizeAnswers, type DraftAnswers, type SubmitOutcome } from './FormRenderer';
import { SubmitSuccess } from './SubmitSuccess';

type PageState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'closed' }
  | { status: 'error'; message: string }
  | { status: 'ready'; form: PublicForm; draft: DraftAnswers };

const sessionKey = (publicId: string) => `sf-session-${publicId}`;
/** Answers typed so far, kept per form in this tab so a reload doesn't lose them. */
const draftKey = (publicId: string) => `sf-draft-${publicId}`;

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
    // storage unavailable (private mode / blocked / full): keep working without it
  }
}

function readDraft(publicId: string, form: PublicForm): DraftAnswers {
  const raw = readStored(draftKey(publicId));
  if (!raw) return {};
  try {
    return sanitizeAnswers(JSON.parse(raw), form.fields);
  } catch {
    return {};
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
        if (!cancelled) setState({ status: 'ready', form, draft: readDraft(publicId, form) });
      },
      (e: unknown) => {
        if (cancelled) return;
        if (isApiError(e) && e.status === 404) setState({ status: 'not_found' });
        else if (isApiError(e) && e.status === 403) setState({ status: 'closed' });
        else setState({ status: 'error', message: errorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [publicId, reloadKey]);

  const ready = state.status === 'ready';
  const formTitle = state.status === 'ready' ? state.form.title : null;
  const restoredDraft = state.status === 'ready' && round === 0 && Object.keys(state.draft).length > 0;

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

  const saveDraft = useCallback((answers: DraftAnswers) => writeStored(draftKey(publicId), JSON.stringify(answers)), [publicId]);

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
      writeStored(draftKey(publicId), null);
      sessionRef.current = null;
      setFormChanged(0);
      setSuccess(res.submittedAt);
      return { ok: true };
    } catch (e) {
      if (!isApiError(e)) return { ok: false, message: 'Не удалось отправить ответ. Попробуйте ещё раз.' };
      if (e.code === 'NETWORK') {
        return { ok: false, message: `${e.message.replace(/\.$/, '')}. Ваши ответы остались на странице — проверьте интернет и нажмите «Отправить» ещё раз.` };
      }
      // Never replace the page here: the student's typed answers must stay visible (and in the draft).
      if (e.status === 403) {
        return {
          ok: false,
          message:
            'Форма сейчас не принимает ответы — организатор закрыл приём. Ваши ответы сохранены в этой вкладке: попробуйте отправить позже или свяжитесь с организатором.',
        };
      }
      if (e.status === 404) {
        return { ok: false, message: 'Эта форма больше не существует — ответ отправить не получится. Свяжитесь с организатором.' };
      }
      if (e.status === 409 && e.code === 'FORM_CHANGED') {
        const fresh = changedFormFrom(e);
        if (fresh) {
          setState((s) => (s.status === 'ready' ? { ...s, form: fresh } : s));
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
    <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-[72px] pt-7 sm:px-5 sm:pt-12">
      {state.status === 'loading' ? <LoadingCard /> : null}

      {state.status === 'not_found' ? (
        <StateCard
          icon={<IconForm size={26} />}
          title="Форма не найдена"
          text="Возможно, в ссылке опечатка или форму удалили. Проверьте ссылку или попросите организатора прислать её ещё раз."
        />
      ) : null}

      {state.status === 'closed' ? (
        <StateCard
          icon={<IconForm size={26} />}
          title="Форма сейчас не принимает ответы"
          text="Организатор закрыл приём ответов или ещё не открыл его. Попробуйте позже или свяжитесь с организатором."
        />
      ) : null}

      {state.status === 'error' ? (
        <StateCard
          tone="error"
          icon={<IconAlert size={26} />}
          title="Не удалось загрузить форму"
          text={state.message === 'Нет соединения с сервером' ? 'Нет соединения с сервером. Проверьте интернет.' : state.message}
          action={
            <Button
              variant="primary"
              size="lg"
              className="mt-7 px-7"
              onClick={() => {
                setState({ status: 'loading' });
                setReloadKey((k) => k + 1);
              }}
              icon={<IconRefresh />}
            >
              Повторить
            </Button>
          }
        />
      ) : null}

      {state.status === 'ready' && success !== null ? <SubmitSuccess title={state.form.title} submittedAt={success} onAgain={again} /> : null}

      {state.status === 'ready' && success === null ? (
        <FormRenderer
          key={round}
          form={state.form}
          mode="public"
          onSubmit={submit}
          onFieldChange={onFieldChange}
          initialAnswers={round === 0 ? state.draft : undefined}
          onAnswersChange={saveDraft}
          notice={
            formChanged > 0 || restoredDraft ? (
              <div className="grid gap-3">
                {formChanged > 0 ? (
                  <div key={formChanged} id="form-changed-notice" tabIndex={-1} className="rounded-[24px] outline-none">
                    <Alert tone="warning" role="alert" title="Форма была обновлена, проверьте ответы">
                      Организатор изменил вопросы, пока вы заполняли форму. Ваши ответы на сохранившиеся вопросы остались на месте.
                    </Alert>
                  </div>
                ) : null}
                {restoredDraft && formChanged === 0 ? (
                  <Alert tone="info">Мы восстановили ответы, которые вы начали заполнять в этой вкладке.</Alert>
                ) : null}
              </div>
            ) : null
          }
        />
      ) : null}

      <p className="mb-0 mt-7 text-center text-[13px] text-neutral-700">Формы откликов · карьерная платформа для студентов</p>
    </main>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-[36px] bg-neutral-100 px-5 pb-9 pt-8 shadow-sm sm:px-9 sm:pt-10" aria-busy="true">
      <LoadingStatus label="Загружаем форму…" />
      <Skeleton className="mb-6 size-14" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mt-9">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-[50px] w-full" />
        </div>
      ))}
    </div>
  );
}

function StateCard({
  icon,
  title,
  text,
  action,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div className="rounded-[36px] bg-neutral-100 px-6 py-12 shadow-sm sm:px-9 sm:py-14">
      <div
        className={`grid size-[72px] place-items-center rounded-full ${tone === 'error' ? 'bg-accent-200 text-accent-800' : 'bg-accent-2-300 text-accent-2-900'}`}
      >
        {icon}
      </div>
      <h1 className="mb-0 mt-7 text-[30px] sm:text-[36px]">{title}</h1>
      <p className="mb-0 mt-3 max-w-[460px] text-base leading-relaxed text-neutral-800">{text}</p>
      {action}
    </div>
  );
}
