'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/Dialog';

/**
 * Lets a screen with unsaved changes (the form editor) intercept in-app links.
 * GuardedLink asks for confirmation while a guard is active; beforeunload is handled by the editor itself.
 */
interface NavGuardApi {
  setDirty: (dirty: boolean) => void;
  requestNavigation: (href: string) => boolean;
}

const NavGuardContext = createContext<NavGuardApi | null>(null);

export function NavGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dirtyRef = useRef(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  /** Returns true when navigation may proceed right away. */
  const requestNavigation = useCallback((href: string) => {
    if (!dirtyRef.current) return true;
    setPendingHref(href);
    return false;
  }, []);

  const api = useMemo(() => ({ setDirty, requestNavigation }), [setDirty, requestNavigation]);

  return (
    <NavGuardContext.Provider value={api}>
      {children}
      <ConfirmDialog
        open={pendingHref !== null}
        title="Уйти без сохранения?"
        message="В форме есть несохранённые изменения. Если уйти со страницы, они пропадут."
        confirmLabel="Уйти без сохранения"
        cancelLabel="Остаться"
        tone="danger"
        onCancel={() => setPendingHref(null)}
        onConfirm={() => {
          const href = pendingHref;
          dirtyRef.current = false;
          setPendingHref(null);
          if (href) router.push(href);
        }}
      />
    </NavGuardContext.Provider>
  );
}

export function useNavGuard(): NavGuardApi {
  const ctx = useContext(NavGuardContext);
  if (!ctx) throw new Error('useNavGuard must be used inside <NavGuardProvider>');
  return ctx;
}

export function GuardedLink({ href, onNavigate, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const { requestNavigation } = useNavGuard();
  return (
    <Link
      href={href}
      onNavigate={(e) => {
        onNavigate?.(e);
        if (!requestNavigation(href)) e.preventDefault();
      }}
      {...rest}
    />
  );
}
