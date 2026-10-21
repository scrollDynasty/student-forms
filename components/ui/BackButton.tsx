'use client';

import { Button } from './Button';
import { IconChevronLeft } from './icons';

/** Goes one step back in the browser history (used where there is no single sensible link target). */
export function BackButton({ label = 'Вернуться назад' }: { label?: string }) {
  return (
    <Button onClick={() => window.history.back()} icon={<IconChevronLeft />} className="pl-3.5">
      {label}
    </Button>
  );
}
