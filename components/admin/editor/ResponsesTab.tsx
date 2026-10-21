'use client';

import { useState } from 'react';
import type { Field } from '@/lib/schema';
import type { ResponseView } from '@/lib/api-client';
import { countLabel, formatDateTime, truncate } from '@/lib/format';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { IconDownload, IconInbox, IconRefresh } from '@/components/ui/icons';

export type ResponsesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ResponseView[]; total: number; refreshing: boolean };

export function ResponsesTab({
  state,
  onRefresh,
  csvUrl,
  formVersion,
  fields,
  published,
}: {
  state: ResponsesState;
  onRefresh: () => void;
  csvUrl: string;
  formVersion: number;
  fields: Field[];
  published: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Загрузка ответов">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (state.status === 'error') {
    return <ErrorState title="Не удалось загрузить ответы" message={state.message} onRetry={onRefresh} />;
  }

  const { items, total } = state;
  const columns = fields.slice(0, 3);
  const openIndex = items.findIndex((r) => r.id === openId);
  const open = openIndex >= 0 ? items[openIndex] : null;

  const toolbar = (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600" aria-live="polite">
        {total > 0 ? `${countLabel(total, ['ответ', 'ответа', 'ответов'])}, новые сверху` : 'Ответов пока нет'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onRefresh}
          disabled={state.refreshing}
          icon={state.refreshing ? <Spinner /> : <IconRefresh size={16} />}
        >
          Обновить
        </Button>
        {total > 0 ? (
          <a href={csvUrl} download className={buttonClasses('secondary', 'sm')}>
            <IconDownload size={16} />
            Экспорт CSV
          </a>
        ) : null}
      </div>
    </div>
  );

  if (items.length === 0) {
    return (
      <div>
        {toolbar}
        <EmptyState icon={<IconInbox size={22} />} title="Пока нет ответов">
          {published
            ? 'Поделитесь ссылкой на форму со студентами — их ответы появятся здесь. Нажмите «Обновить», чтобы проверить новые.'
            : 'Опубликуйте форму и отправьте ссылку студентам — их ответы появятся здесь.'}
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="w-14 px-4 py-3">
                №
              </th>
              <th scope="col" className="px-4 py-3 whitespace-nowrap">
                Дата и время отправки
              </th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="max-w-[14rem] px-4 py-3">
                  <span className="line-clamp-2 normal-case tracking-normal">{c.label}</span>
                </th>
              ))}
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((r, i) => {
              const num = total - i;
              return (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 tabular-nums text-slate-500">{num}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-800">{formatDateTime(r.submittedAt)}</td>
                  {columns.map((c) => {
                    const item = r.items.find((it) => it.fieldId === c.id);
                    return (
                      <td key={c.id} className="max-w-[14rem] px-4 py-3 text-slate-700">
                        <span className="block truncate" title={item?.display}>
                          {item ? truncate(item.display, 48) : '—'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" className="text-accent" onClick={() => setOpenId(r.id)} aria-label={`Открыть ответ №${num}`}>
                      Открыть
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpenId(null)}
        variant="drawer"
        title={open ? `Ответ №${total - openIndex}` : 'Ответ'}
        description={open ? `Отправлен ${formatDateTime(open.submittedAt)}` : undefined}
        footer={
          open ? (
            <>
              <Button disabled={openIndex >= items.length - 1} onClick={() => setOpenId(items[openIndex + 1]?.id ?? null)}>
                Предыдущий
              </Button>
              <Button disabled={openIndex <= 0} onClick={() => setOpenId(items[openIndex - 1]?.id ?? null)}>
                Следующий
              </Button>
            </>
          ) : null
        }
      >
        {open ? (
          <div className="space-y-4">
            {open.formVersion !== formVersion ? (
              <Alert tone="info">Отправлен в предыдущей версии формы (v{open.formVersion}). Вопросы показаны так, как их видел студент.</Alert>
            ) : null}
            <dl className="divide-y divide-slate-100">
              {open.items.map((it) => (
                <div key={it.fieldId} className="py-3">
                  <dt className="text-sm font-medium text-slate-500">{it.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-base text-slate-900">{it.display}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
