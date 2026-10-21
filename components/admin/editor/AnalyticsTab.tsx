'use client';

import { useEffect, useState } from 'react';
import { api, type Analytics } from '@/lib/api-client';
import { formatPercent, shareOf } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
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
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Неизвестная ошибка' });
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
      <div aria-busy="true" aria-label="Загрузка аналитики" className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (state.status === 'error') {
    return <ErrorState title="Не удалось загрузить аналитику" message={state.message} onRetry={refresh} />;
  }

  const { data, refreshing } = state;
  const maxDrop = Math.max(0, ...data.fields.map((f) => f.lastBeforeAbandon));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Как студенты проходят форму — от открытия ссылки до отправки.</p>
        <Button size="sm" onClick={refresh} disabled={refreshing} icon={refreshing ? <Spinner /> : <IconRefresh size={16} />}>
          Обновить
        </Button>
      </div>

      {data.views === 0 ? (
        <EmptyState icon={<IconChart size={22} />} title="Пока нет данных">
          {published
            ? 'Как только студенты откроют ссылку на форму, здесь появятся просмотры, начатые заполнения и места, где студенты бросают форму.'
            : 'Опубликуйте форму и поделитесь ссылкой — здесь появится воронка: просмотры, начатые заполнения, отправки.'}
          {data.submissions > 0 ? ` Сохранённых ответов: ${data.submissions}.` : ''}
        </EmptyState>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Просмотры" value={String(data.views)} sub="сеансов открыли форму" />
            <Tile label="Начали заполнение" value={String(data.starts)} sub={`${formatPercent(data.startRate)} от просмотров`} />
            <Tile label="Отправили" value={String(data.submissions)} sub="сохранённых ответов" />
            <Tile label="Конверсия" value={formatPercent(data.completionRate)} sub="отправили из начавших" accent />
          </dl>

          <section aria-labelledby="funnel-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
            <h2 id="funnel-heading" className="text-base font-semibold text-slate-900">
              Воронка
            </h2>
            <div className="mt-4 space-y-3">
              <FunnelBar label="Просмотры" value={data.views} base={data.views} />
              <FunnelBar label="Начали заполнение" value={data.starts} base={data.views} />
              <FunnelBar label="Отправили" value={data.submissions} base={data.views} />
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Начали, но не отправили: <span className="font-semibold text-slate-900">{data.abandoned}</span>
            </p>
          </section>

          <section aria-labelledby="an-fields-heading" className="rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <h2 id="an-fields-heading" className="text-base font-semibold text-slate-900">
                Вопросы
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Где студенты останавливаются. {maxDrop > 0 ? 'Вопрос, после которого уходят чаще всего, выделен.' : ''}
              </p>
            </div>
            {data.fields.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">В форме нет вопросов.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-y border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 sm:px-5">
                        Вопрос
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Заполнили
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Бросили на этом поле
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.fields.map((f) => {
                      const worst = maxDrop > 0 && f.lastBeforeAbandon === maxDrop;
                      const pct = data.starts > 0 ? Math.min(100, (f.filled / data.starts) * 100) : 0;
                      return (
                        <tr key={f.fieldId} className={worst ? 'bg-amber-50' : ''}>
                          <td className="px-4 py-3 text-slate-800 sm:px-5">
                            <span className="line-clamp-2">{f.label}</span>
                            {worst ? (
                              <span className="mt-1 inline-block rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-medium text-amber-950">
                                Чаще всего бросают здесь
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="w-24 shrink-0 tabular-nums text-slate-800">
                                {f.filled} <span className="text-slate-500">({shareOf(f.filled, data.starts)})</span>
                              </span>
                              <span aria-hidden="true" className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                                <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                              </span>
                            </div>
                          </td>
                          <td className={`px-4 py-3 tabular-nums ${worst ? 'font-semibold text-amber-950' : 'text-slate-800'}`}>
                            {f.lastBeforeAbandon}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="method-heading" className="rounded-xl bg-slate-100/80 p-4 text-sm leading-relaxed text-slate-700 sm:p-5">
        <h2 id="method-heading" className="font-semibold text-slate-900">
          Как считаются показатели
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
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
            <b>Заполнили</b> — сколько сеансов изменили ответ на этот вопрос; процент — от начавших заполнение.
          </li>
          <li>
            <b>Бросили на этом поле</b> — сколько студентов начали, но не отправили форму, и этот вопрос был последним, который они изменили.
            Обычно проблема в следующем за ним вопросе.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-xs ${accent ? 'border-accent/30 bg-accent-soft/60' : 'border-slate-200 bg-white'}`}>
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-accent-strong' : 'text-slate-900'}`}>{value}</dd>
      <dd className="mt-0.5 text-xs text-slate-500">{sub}</dd>
    </div>
  );
}

function FunnelBar({ label, value, base }: { label: string; value: number; base: number }) {
  const pct = base > 0 ? Math.min(100, (value / base) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-900">
          <b>{value}</b> <span className="text-slate-500">· {shareOf(value, base)}</span>
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}
