'use client';

import { useState } from 'react';
import type { Field } from '@/lib/schema';
import type { ResponseView } from '@/lib/api-client';
import { countLabel, formatDateTime, truncate } from '@/lib/format';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, LoadingStatus, Skeleton, Spinner } from '@/components/ui/feedback';
import { IconDownload, IconInbox, IconRefresh } from '@/components/ui/icons';

const PAGE_SIZE = 50;

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
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (state.status === 'loading') {
    return (
      <div className="space-y-2" aria-busy="true">
        <LoadingStatus label="Загружаем ответы…" />
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
  const newest = openIndex <= 0;
  const oldest = openIndex >= items.length - 1;

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1.5">
      <p className="m-0 text-[15px] text-neutral-700" aria-live="polite">
        {total > 0 ? `${countLabel(total, ['ответ', 'ответа', 'ответов'])}, новые сверху` : 'Ответов пока нет'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onRefresh}
          aria-disabled={state.refreshing || undefined}
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
        <EmptyState icon={<IconInbox size={24} />} title="Пока нет ответов">
          {published
            ? 'Поделитесь ссылкой на форму со студентами — их ответы появятся здесь. Нажмите «Обновить», чтобы проверить новые.'
            : 'Опубликуйте форму и отправьте ссылку студентам — их ответы появятся здесь.'}
        </EmptyState>
      </div>
    );
  }

  const th = 'px-3 py-3.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-700 border-b border-divider';
  return (
    <div>
      {toolbar}
      <div className="relative overflow-x-auto rounded-[32px] bg-neutral-100 px-3.5 py-2.5">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${th} w-14`}>
                №
              </th>
              <th scope="col" className={th}>
                Отправлен
              </th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className={`${th} max-w-[14rem]`}>
                  <span className="line-clamp-2">{c.label}</span>
                </th>
              ))}
              <th scope="col" className={th}>
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, visible).map((r, i) => {
              const num = total - i;
              return (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-ink/4">
                  <td className="border-b border-ink/8 px-3 py-3.5 tabular-nums text-neutral-700">{num}</td>
                  <td className="whitespace-nowrap border-b border-ink/8 px-3 py-3.5 tabular-nums">{formatDateTime(r.submittedAt)}</td>
                  {columns.map((c, ci) => {
                    const item = r.items.find((it) => it.fieldId === c.id);
                    const choice = item && (item.type === 'select' || item.type === 'radio') && item.display !== '—';
                    return (
                      <td key={c.id} className="max-w-[14rem] border-b border-ink/8 px-3 py-3.5">
                        {choice ? (
                          <span className="inline-block max-w-full truncate rounded-xl bg-accent-100 px-2.5 py-[3px] text-xs text-accent-800">
                            {item.display}
                          </span>
                        ) : (
                          <span className={`block truncate ${ci === 0 ? 'font-semibold' : 'text-neutral-800'}`} title={item?.display}>
                            {item ? truncate(item.display, 48) : '—'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b border-ink/8 px-3 py-2 text-right">
                    <Button
                      id={`resp-open-${i}`}
                      size="sm"
                      variant="ghost"
                      className="min-h-9 px-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(r.id);
                      }}
                      aria-label={`Открыть ответ №${num}`}
                    >
                      Открыть
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {items.length > visible ? (
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <p className="text-sm text-neutral-700">
            Показано {visible} из {items.length}
          </p>
          <Button
            size="sm"
            onClick={() => {
              const firstNew = visible;
              setVisible((v) => v + PAGE_SIZE);
              // Move focus to the first newly shown row so keyboard users continue from there.
              requestAnimationFrame(() => document.getElementById(`resp-open-${firstNew}`)?.focus());
            }}
          >
            Показать ещё {Math.min(PAGE_SIZE, items.length - visible)}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={open !== null}
        onClose={() => setOpenId(null)}
        variant="drawer"
        title={open ? `Ответ №${total - openIndex}` : 'Ответ'}
        description={open ? `Отправлен ${formatDateTime(open.submittedAt)}` : undefined}
        footer={
          open ? (
            <>
              <Button className="flex-[1_1_auto] sm:flex-none" aria-disabled={oldest || undefined} onClick={() => setOpenId(items[openIndex + 1]?.id ?? null)}>
                Более старый ответ
              </Button>
              <Button className="flex-[1_1_auto] sm:flex-none" aria-disabled={newest || undefined} onClick={() => setOpenId(items[openIndex - 1]?.id ?? null)}>
                Более новый ответ
              </Button>
            </>
          ) : null
        }
      >
        {open ? (
          <div className="grid gap-1.5">
            {open.formVersion !== formVersion ? (
              <Alert tone="info" className="mb-1.5">
                Отправлен в предыдущей версии формы (v{open.formVersion}). Вопросы показаны так, как их видел студент.
              </Alert>
            ) : null}
            <dl className="m-0 grid gap-1.5">
              {open.items.map((it) => (
                <div key={it.fieldId} className="rounded-[22px] bg-bg px-[18px] py-3.5">
                  <dt className="text-[13px] text-neutral-700">{it.label}</dt>
                  <dd className="m-0 mt-1 whitespace-pre-wrap break-words text-base">{it.display}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
