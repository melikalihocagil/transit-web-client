import { useEffect, useRef } from 'react';
import { useRoutesQuery } from '../api';
import { useRouteStore } from '../store';
import type { Route } from '../model';
import { ROUTES_PATH, isRoutesPath } from './location';

/**
 * Hat düzenleyici sayfasında adres ↔ seçili hat senkronu (yalnızca /routes altında çalışır;
 * sayfa seçimi `location.ts` ve App'tedir).
 *
 *   /routes          -> katalog (seçili hat yok)
 *   /routes/{kod}    -> o hat açık; kod `routeShortName`
 *
 * Kodda `/` olabilir (B2/A, 16/A): `/routes/` sonrasındaki yolun tamamı hat kodudur, bu yüzden
 * adres `/routes/B2/A` olarak okunur görünür. Kod parçaları ayrı ayrı kodlanır, `/` korunur.
 *
 * Seçili hattın tek kaynağı adrestir: sayfa açılışında ve geri/ileri tuşlarında adres store'a,
 * hat seçimi ve "Katalog"a dönüş store'dan adrese yazılır (pushState). Kod → routeId eşlemesi
 * hat kataloğundan yapılır; katalog yüklenmeden hiçbir şey yazılmaz. Sayfadan çıkınca seçim temizlenir.
 */

const APP_TITLE = 'Transit Route Studio';

type ParsedPath = { kind: 'catalog' } | { kind: 'route'; code: string } | { kind: 'invalid' };

/** /routes altındaki adresi çözer; /routes dışındaki adresler için null (bu sayfanın işi değil). */
function parsePath(pathname: string): ParsedPath | null {
  if (!isRoutesPath(pathname)) return null;
  let path = pathname;
  while (path.endsWith('/')) path = path.slice(0, -1);
  if (path === ROUTES_PATH) return { kind: 'catalog' };
  try {
    const code = path.slice(ROUTES_PATH.length + 1).split('/').map(decodeURIComponent).join('/');
    if (code) return { kind: 'route', code };
  } catch {
    // Bozuk kodlama
  }
  return { kind: 'invalid' };
}

export function routePath(code: string): string {
  return `${ROUTES_PATH}/${code.split('/').map(encodeURIComponent).join('/')}`;
}

function pathForRouteId(routeId: string | null, routes: Route[]): string | null {
  if (routeId === null) return ROUTES_PATH;
  const route = routes.find((r) => r.routeId === routeId);
  return route ? routePath(route.routeShortName) : null;
}

function updateTitle(routeId: string | null, routes: Route[]): void {
  const route = routeId === null ? undefined : routes.find((r) => r.routeId === routeId);
  document.title = route ? `${route.routeShortName} · ${APP_TITLE}` : `Hat Kataloğu · ${APP_TITLE}`;
}

export function useRouteUrlSync(): void {
  const { data: routes } = useRoutesQuery();
  // Katalog gelene kadar adres store'a uygulanmaz; store → adres yazımı da bekler
  const isReadyRef = useRef(false);

  useEffect(() => {
    if (!routes) return;

    /** Adresi store'a uygular. Bilinmeyen hat kodunda katalog açılır (adres düzeltilir). */
    const applyUrl = () => {
      const parsed = parsePath(window.location.pathname);
      if (parsed === null) return; // Başka sayfaya geçiliyor (ör. ana sayfa)
      const { routeId, selectRouteIntent, clearRoute } = useRouteStore.getState();

      if (parsed.kind === 'route') {
        const route = routes.find((r) => r.routeShortName === parsed.code);
        if (route) {
          // Adres okunur biçime getirilir (ör. /routes/16%2FA -> /routes/16/A)
          const canonical = routePath(route.routeShortName);
          if (canonical !== window.location.pathname) window.history.replaceState(null, '', canonical);
          if (routeId !== route.routeId) void selectRouteIntent(route.routeId);
          return;
        }
        window.history.replaceState(null, '', ROUTES_PATH);
        if (routeId !== null) clearRoute();
        useRouteStore.setState({ error: `"${parsed.code}" kodlu hat bulunamadı` });
        return;
      }

      if (parsed.kind === 'invalid' || window.location.pathname !== ROUTES_PATH) {
        window.history.replaceState(null, '', ROUTES_PATH);
      }
      if (routeId !== null) clearRoute();
    };

    applyUrl();
    isReadyRef.current = true;
    updateTitle(useRouteStore.getState().routeId, routes);

    window.addEventListener('popstate', applyUrl);

    // Hat seçimi / katalog dönüşü adrese yazılır (geri tuşu için yeni geçmiş kaydı)
    const unsubscribe = useRouteStore.subscribe((state, prev) => {
      if (state.routeId === prev.routeId) return;
      if (!isRoutesPath(window.location.pathname)) return; // Sayfadan çıkılıyor
      updateTitle(state.routeId, routes);
      if (!isReadyRef.current) return;
      const path = pathForRouteId(state.routeId, routes);
      if (path !== null && path !== window.location.pathname) {
        window.history.pushState(null, '', path);
      }
    });

    return () => {
      window.removeEventListener('popstate', applyUrl);
      unsubscribe();
    };
  }, [routes]);

  // Sayfadan çıkınca (ör. ana sayfaya dönüş) seçili hat temizlenir; taslaklar korunur
  useEffect(() => {
    return () => {
      isReadyRef.current = false;
      useRouteStore.getState().clearRoute();
    };
  }, []);
}
