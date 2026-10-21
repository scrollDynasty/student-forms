'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage, type Analytics } from '@/lib/api-client';
import { formatPercent, shareOf } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingStatus, Skeleton, Spinner } from '@/components/ui/feedback';
import { IconChart, IconRefresh } from '@/components/ui/icons';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Analytics; refreshing: boolean };

export function AnalyticsTab({ formId, published }: { formId: string; published: boolean }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.getAnalytics(formId).then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data, refreshing: false });
      },
      (e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [formId, reloadKey]);

  const refresh = () => {
    setState((s) => (s.status === 'ready' ? { ...s, refreshing: true } : { status: 'loading' }));
    setReloadKey((k) => k + 1);
  };

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="grid gap-5">
        <LoadingStatus label="Загружаем аналитику…" />
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[132px] animate-pulse rounded-[32px] bg-neutral-200 motion-reduce:animate-none" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-[32px]" />
      </div>
    );
  }
  if (state.status === 'error') {
    return <ErrorState title="Не удалось загрузить аналитику" message={state.message} onRetry={refresh} />;
  }

  const { data, refreshing } = state;
  const maxDrop = Math.max(0, ...data.fields.map((f) => f.lastBeforeAbandon));
  const tiles = [
    { label: 'Просмотры', value: String(data.views), sub: 'сеансов открыли форму', accent: false },
    { label: 'Начали заполнение', value: String(data.starts), sub: `${formatPercent(data.startRate)} от просмотров`, accent: false },
    { label: 'Отправили', value: String(data.submissions), sub: 'сохранённых ответов', accent: false },
    { label: 'Конверсия', value: formatPercent(data.completionRate), sub: 'отправили из начавших', accent: true },
  ];
  const funnel = [
    { label: 'Просмотры', value: data.views, color: 'bg-accent-2-400' },
    { label: 'Начали заполнение', value: data.starts, color: 'bg-accent-2-500' },
    { label: 'Отправили', value: data.submissions, color: 'bg-accent-2-700' },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1.5">
        <p className="m-0 text-[15px] text-neutral-700">Как студенты проходят форму — от открытия ссылки до отправки.</p>
        <Button size="sm" onClick={refresh} aria-disabled={refreshing || undefined} icon={refreshing ? <Spinner /> : <IconRefresh size={16} />}>
          Обновить
        </Button>
      </div>

      {data.views === 0 ? (
        <EmptyState icon={<IconChart size={24} />} title="Пока нет данных">
          {published
            ? 'Как только студенты откроют ссылку на форму, здесь появятся просмотры, начатые заполнения и места, где студенты бросают форму.'
            : 'Опубликуйте форму и поделитесь ссылкой — здесь появится воронка: просмотры, начатые заполнения, отправки.'}
          {data.submissions > 0 ? ` Сохранённых ответов: ${data.submissions}.` : ''}
        </EmptyState>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <div
                key={t.label}
                className={`rounded-[32px] px-6 py-[22px] ${t.accent ? 'bg-accent-2-700 text-accent-2-100' : 'bg-neutral-100 text-ink'}`}
              >
                <dt className="text-sm font-semibold">{t.label}</dt>
                <dd className="m-0 mt-2.5 font-heading text-[40px] font-semibold leading-[1.1] tracking-[-0.025em] tabular-nums sm:text-[44px]">
                  {t.value}
                </dd>
                <dd className="m-0 mt-1 text-[13px] opacity-85">{t.sub}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="funnel-heading" className="rounded-[32px] bg-neutral-100 px-5 py-6 sm:px-7 sm:py-[26px]">
            <h2 id="funnel-heading" className="mb-5 text-[25px]">
              Воронка
            </h2>
            <div className="grid gap-3.5">
              {funnel.map((b) => {
                const pct = data.views > 0 ? Math.min(100, (b.value / data.views) * 100) : 0;
                return (
                  <div key={b.label} className="grid grid-cols-[minmax(96px,180px)_minmax(0,1fr)_56px] items-center gap-3 sm:gap-4">
                    <span className="text-sm font-semibold">{b.label}</span>
                    <span className="h-5 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
                      <span className={`block h-full rounded-full ${b.color}`} style={{ width: `${Math.max(pct, b.value > 0 ? 3 : 0)}%` }} />
                    </span>
                    <span className="text-right font-heading text-lg font-semibold tabular-nums">
                      {b.value}
                      <span className="sr-only"> ({shareOf(b.value, data.views)} от просмотров)</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mb-0 mt-5 text-sm text-neutral-700">
              Начали, но пока не отправили: <b className="text-ink">{data.abandoned}</b>
            </p>
          </section>

          <section aria-labelledby="stops-heading" className="rounded-[32px] bg-neutral-100 px-5 py-6 sm:px-7 sm:py-[26px]">
            <h2 id="stops-heading" className="mb-1 text-[25px]">
              Где студенты останавливаются
            </h2>
            <p className="mb-[18px] text-sm text-neutral-700">
              Заполнили — доля от начавших. Бросили — вопрос был последним перед уходом; обычно проблема в следующем за ним.
            </p>
            {data.fields.length === 0 ? (
              <p className="text-sm text-neutral-700">В форме нет вопросов.</p>
            ) : (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {data.fields.map((f) => {
                  const worst = maxDrop > 0 && f.lastBeforeAbandon === maxDrop;
                  const pct = data.starts > 0 ? Math.min(100, (f.filled / data.starts) * 100) : 0;
                  return (
                    <li
                      key={f.fieldId}
                      className={
                        'grid grid-cols-1 items-center gap-x-[18px] gap-y-2 rounded-[22px] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,200px)_90px] ' +
                        (worst ? 'bg-accent-100' : '')
                      }
                    >
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold">{f.label}</div>
                        {worst ? (
                          <span className="mt-1.5 inline-flex rounded-xl bg-accent-300 px-2.5 py-[3px] text-[11px] text-accent-900">
                            Чаще всего бросают здесь
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="sr-only">Заполнили: {f.filled},</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-300" aria-hidden="true">
                          <span className="block h-full bg-accent-2" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-10 text-right text-[13px] tabular-nums">{shareOf(f.filled, data.starts)}</span>
                      </div>
                      <div className="text-sm sm:text-right">
                        <span className="sr-only">Бросили на этом поле: </span>
                        <span className="font-heading text-lg font-semibold tabular-nums">{f.lastBeforeAbandon}</span>{' '}
                        <span className="text-neutral-700" aria-hidden="true">
                          ушли
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="method-heading" className="rounded-[32px] bg-surface px-5 py-6 text-sm leading-relaxed sm:px-7">
        <h2 id="method-heading" className="mb-2 text-xl">
          Как считаются показатели
        </h2>
        <ul className="m-0 grid list-disc gap-1 pl-5">
          <li>
            <b>Просмотр</b> — форма загрузилась у студента. Один сеанс — одна вкладка браузера: перезагрузка страницы не считается новым
            просмотром.
          </li>
          <li>
            <b>Начали заполнение</b> — студент впервые изменил ответ на любой вопрос (просто открыть форму или кликнуть в поле — не считается).
          </li>
          <li>
            <b>Отправили</b> — все сохранённые ответы.
          </li>
          <li>
            <b>Конверсия</b> — доля начавших заполнение, которые отправили форму.
          </li>
          <li>
            <b>Начали, но пока не отправили</b> — сеансы, где ответ ещё не отправлен; студент мог вернуться к форме позже.
          </li>
          <li>
            <b>Заполнили</b> — сколько сеансов изменили ответ на этот вопрос; процент — от начавших заполнение.
          </li>
          <li>
            <b>Бросили на этом поле</b> — сколько студентов начали, но не отправили форму, и этот вопрос был последним, который они изменили.
          </li>
        </ul>
      </section>
    </div>
  );
}
