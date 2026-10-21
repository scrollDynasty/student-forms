'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ConfirmDialog } from '@/components/ui/Dialog';

/**
 * Lets a screen with unsaved changes (the form editor) intercept leaving it:
 * - GuardedLink asks for confirmation on in-app links;
 * - browser Back that would leave the page shows the same confirmation (see the sentinel note below);
 *   Back between ?tab= entries of the page still works.
 * Reload / tab close are handled by the editor's beforeunload listener.
 */
interface NavGuardApi {
  setDirty: (dirty: boolean) => void;
  /** Remember the current history entry as the guarded page (call after each URL change on it). */
  syncEntry: () => void;
  requestNavigation: (href: string) => boolean;
}

const NavGuardContext = createContext<NavGuardApi | null>(null);

const SENTINEL_KEY = '__sfGuard';

type NavigationLike = { currentEntry?: { index: number } | null; entries?: () => { url: string | null }[] };
const navigationApi = () => (window as Window & { navigation?: NavigationLike }).navigation;

const isSentinel = (state: unknown) =>
  typeof state === 'object' && state !== null && (state as Record<string, unknown>)[SENTINEL_KEY] === true;

/** Pathname of the history entry right before the current one, if the Navigation API can tell. */
function previousEntryPath(): string | null | undefined {
  const nav = navigationApi();
  const index = nav?.currentEntry?.index;
  if (!nav?.entries || typeof index !== 'number') return undefined; // unknown
  const prev = index > 0 ? nav.entries()[index - 1]?.url : null;
  if (!prev) return null; // nothing before (or another document)
  try {
    return new URL(prev).pathname;
  } catch {
    return null;
  }
}

/**
 * While the editor has unsaved changes, a "sentinel" copy of the current editor entry sits on top of the
 * session history (same URL, same router state, plus a marker). Back then only pops the sentinel, which
 * the router sees as a no-op, and the guard decides: a Back within the editor (previous ?tab=) is replayed,
 * a Back that would leave the editor asks for confirmation first.
 */
export function NavGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dirtyRef = useRef(false);
  const pathRef = useRef<string | null>(null);
  const skipPopRef = useRef(false);
  const [pending, setPending] = useState<{ href: string; viaHistory: boolean } | null>(null);

  const ensureSentinel = useCallback(() => {
    if (isSentinel(window.history.state)) return;
    // The state carries the router's own fields, so the router treats this push as its own entry.
    window.history.pushState({ ...(window.history.state ?? {}), [SENTINEL_KEY]: true }, '', window.location.href);
  }, []);

  const syncEntry = useCallback(() => {
    pathRef.current = window.location.pathname;
    if (dirtyRef.current) ensureSentinel(); // e.g. after a ?tab= switch pushed a new entry
  }, [ensureSentinel]);

  const setDirty = useCallback(
    (dirty: boolean) => {
      const was = dirtyRef.current;
      dirtyRef.current = dirty;
      if (dirty && pathRef.current === window.location.pathname) ensureSentinel();
      else if (!dirty && was && isSentinel(window.history.state)) {
        // Saved: drop the sentinel so Back does not need an extra press.
        skipPopRef.current = true;
        window.history.back();
      }
    },
    [ensureSentinel],
  );

  /** Returns true when navigation may proceed right away. */
  const requestNavigation = useCallback((href: string) => {
    if (!dirtyRef.current) return true;
    setPending({ href, viaHistory: false });
    return false;
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (skipPopRef.current) {
        skipPopRef.current = false;
        if (dirtyRef.current) ensureSentinel();
        return;
      }
      if (!dirtyRef.current || isSentinel(window.history.state)) return;
      if (window.location.pathname !== pathRef.current) return; // already elsewhere (multi-step jump): nothing to undo
      // The sentinel was just popped by Back.
      const prevPath = previousEntryPath();
      if (prevPath === pathRef.current) {
        // Back within the editor (previous tab): replay it, the sentinel is re-added when we land.
        skipPopRef.current = true;
        window.history.back();
        return;
      }
      setPending({ href: prevPath ?? '/admin', viaHistory: true });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [ensureSentinel]);

  const api = useMemo(() => ({ setDirty, syncEntry, requestNavigation }), [setDirty, syncEntry, requestNavigation]);

  return (
    <NavGuardContext.Provider value={api}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title="Уйти без сохранения?"
        message="В форме есть несохранённые изменения. Если уйти со страницы, они пропадут."
        confirmLabel="Уйти без сохранения"
        cancelLabel="Остаться"
        tone="danger"
        onCancel={() => {
          if (pending?.viaHistory) ensureSentinel(); // stay protected against the next Back
          setPending(null);
        }}
        onConfirm={() => {
          const p = pending;
          dirtyRef.current = false;
          setPending(null);
          if (!p) return;
          if (p.viaHistory) window.history.back(); // repeat the Back the user pressed
          else router.push(p.href);
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
