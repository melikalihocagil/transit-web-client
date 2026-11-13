import { useSyncExternalStore } from 'react';

/**
 * Küçük adres katmanı (router kütüphanesi yok): React bileşenleri `usePathname` ile adresi okur,
 * sayfa değiştiren her şey `navigate` çağırır. Tarayıcının geri/ileri tuşları (popstate) da dinlenir.
 *
 * Sayfalar:
 *   /                 -> ana sayfa
 *   /routes[/{kod}]   -> haritalı hat düzenleyici (seçili hat adresle eşlenir: useRouteUrlSync)
 */

export const HOME_PATH = '/';
export const ROUTES_PATH = '/routes';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

window.addEventListener('popstate', emit);

/** Yeni adrese gider; `replace` ise geçmişe yeni kayıt eklemez. */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (path === window.location.pathname) return;
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  emit();
}

export function isRoutesPath(pathname: string): boolean {
  return pathname === ROUTES_PATH || pathname.startsWith(`${ROUTES_PATH}/`);
}

export function usePathname(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => window.location.pathname
  );
}

/**
 * `<a href>` için tıklama işleyicisi: normal tıklamada sayfayı yenilemeden geçer; Ctrl/Cmd/Shift/orta
 * tık ile tarayıcının kendi davranışı (yeni sekme vb.) korunur.
 */
export function linkClickHandler(path: string) {
  return (e: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  };
}
