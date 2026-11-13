import { useSyncExternalStore } from 'react';

/**
 * Küçük adres katmanı (router kütüphanesi yok): React bileşenleri `usePathname` ile adresi okur,
 * sayfa değiştiren her şey `navigate` çağırır. Tarayıcının geri/ileri tuşları (popstate) da dinlenir.
 *
 * Sayfalar:
 *   /                 -> ana sayfa
 *   /routes[/{kod}]       -> haritalı hat düzenleyici (seçili hat adresle eşlenir: useRouteUrlSync)
 *   /route-info[/{kod}]   -> hat bilgileri (kod, ad, tür, renk; yeni / silinen hatlar)
 *
 * Hat kodunda `/` olabilir (B2/A, 16/A): taban adresten sonraki yolun tamamı hat kodudur, adres
 * `/routes/B2/A` olarak okunur görünür. Kod parçaları ayrı ayrı kodlanır, `/` korunur.
 */

export const HOME_PATH = '/';
export const ROUTES_PATH = '/routes';
export const ROUTE_INFO_PATH = '/route-info';

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

/** Adres `base` ya da altında mı. */
export function isUnderPath(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isRoutesPath(pathname: string): boolean {
  return isUnderPath(ROUTES_PATH, pathname);
}

export function isRouteInfoPath(pathname: string): boolean {
  return isUnderPath(ROUTE_INFO_PATH, pathname);
}

/** `base` altındaki hat adresi: `/routes/B2/A`. */
export function pathWithCode(base: string, code: string): string {
  return `${base}/${code.split('/').map(encodeURIComponent).join('/')}`;
}

export type ParsedCodePath = { kind: 'list' } | { kind: 'code'; code: string } | { kind: 'invalid' };

/** `base` altındaki adresi çözer; `base` dışındaki adresler için null. */
export function parseCodePath(base: string, pathname: string): ParsedCodePath | null {
  if (!isUnderPath(base, pathname)) return null;
  let path = pathname;
  while (path.endsWith('/')) path = path.slice(0, -1);
  if (path === base) return { kind: 'list' };
  try {
    const code = path.slice(base.length + 1).split('/').map(decodeURIComponent).join('/');
    if (code) return { kind: 'code', code };
  } catch {
    // Bozuk kodlama
  }
  return { kind: 'invalid' };
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
