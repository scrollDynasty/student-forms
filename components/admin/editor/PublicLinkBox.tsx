'use client';

import { useRef } from 'react';
import { Button, buttonClasses } from '@/components/ui/Button';
import { IconCopy, IconExternal, IconLink } from '@/components/ui/icons';
import { copyText, publicFormPath, useOrigin } from '@/components/ui/clipboard';
import { useToast } from '@/components/ui/Toast';

export function PublicLinkBox({ publicId }: { publicId: string }) {
  const origin = useOrigin();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const path = publicFormPath(publicId);
  const url = `${origin}${path}`;

  async function copy() {
    if (await copyText(url)) {
      toast.success('Ссылка скопирована');
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
      toast.error('Не удалось скопировать автоматически — ссылка выделена, нажмите Ctrl+C');
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
      <label htmlFor="public-link" className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
        <IconLink size={16} />
        Форма опубликована — отправьте эту ссылку студентам
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          id="public-link"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 font-mono text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:min-h-10"
        />
        <div className="flex gap-2">
          <Button variant="primary" onClick={copy} icon={<IconCopy size={16} />} className="flex-1 sm:flex-none">
            Копировать
          </Button>
          <a href={path} target="_blank" rel="noopener noreferrer" className={buttonClasses('secondary', 'md', 'flex-1 sm:flex-none')}>
            <IconExternal size={16} />
            Открыть
            <span className="sr-only">(в новой вкладке)</span>
          </a>
        </div>
      </div>
    </div>
  );
}
