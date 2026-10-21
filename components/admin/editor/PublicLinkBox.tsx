'use client';

import { useRef } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { IconExternal, IconLink } from '@/components/ui/icons';
import { copyText, publicFormPath, useOrigin } from '@/components/ui/clipboard';
import { useToast } from '@/components/ui/Toast';

/** The published form's public link as a pill: link, «Копировать», open in a new tab. */
export function PublicLinkBox({ publicId }: { publicId: string }) {
  const origin = useOrigin();
  const toast = useToast();
  const textRef = useRef<HTMLSpanElement>(null);
  const path = publicFormPath(publicId);
  const url = `${origin}${path}`;
  const shown = url.replace(/^https?:\/\//, '');

  async function copy() {
    if (await copyText(url)) {
      toast.success('Ссылка скопирована');
      return;
    }
    // Fallback: select the link text so it can be copied with Ctrl+C.
    const el = textRef.current;
    const selection = window.getSelection();
    if (el && selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.error('Не удалось скопировать автоматически — ссылка выделена, нажмите Ctrl+C');
  }

  return (
    <div className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-neutral-100 py-[5px] pl-[18px] pr-[5px]">
      <IconLink size={16} className="shrink-0 text-accent-2-700" />
      <span className="sr-only">Публичная ссылка на форму:</span>
      <span ref={textRef} className="min-w-0 truncate text-sm" title={url}>
        {shown}
      </span>
      <button type="button" onClick={copy} className={buttonClasses('ghost', 'sm', 'min-h-9 shrink-0 px-3')}>
        Копировать
      </button>
      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Открыть форму в новой вкладке"
        title="Открыть форму в новой вкладке"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-neutral-400 text-ink hover:bg-ink/7 hover:text-ink"
      >
        <IconExternal size={16} />
      </a>
    </div>
  );
}
