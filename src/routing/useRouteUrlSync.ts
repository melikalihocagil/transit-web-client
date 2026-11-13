import { useEffect, useRef } from 'react';
import { useRouteStore, useCatalogRoutes } from '../store';
import type { Route } from '../model';
import { ROUTES_PATH, isRoutesPath, parseCodePath, pathWithCode } from './location';

/**
 * Hat düzenleyici sayfasında adres ↔ seçili hat senkronu (yalnızca /routes altında çalışır;
 * sayfa seçimi `location.ts` ve App'tedir).
 *
 *   /routes          -> katalog (seçili hat yok)
 *   /routes/{kod}    -> o hat açık; kod `routeShortName`
 *
 * Kodda `/` olabilir (B2/A, 16/A); adres biçimi için bkz. `location.ts`.
 *
 * Seçili hattın tek kaynağı adrestir: sayfa açılışında ve geri/ileri tuşlarında adres store'a,
 * hat seçimi ve "Katalog"a dönüş store'dan adrese yazılır (pushState). Kod → routeId eşlemesi
 * katalogdan (hat bilgisi taslağı dahil) yapılır; katalog yüklenmeden hiçbir şey yazılmaz.
 * Açık hattın kodu değişirse adres yerinde düzeltilir; hat silinirse kataloğa dönülür.
 * Sayfadan çıkınca seçim temizlenir.
 */

const APP_TITLE = 'Transit Route Studio';

/** /routes altındaki adresi çözer; /routes dışındaki adresler için null (bu sayfanın işi değil). */
const parsePath = (pathname: string) => parseCodePath(ROUTES_PATH, pathname);

export function routePath(code: string): string {
  return pathWithCode(ROUTES_PATH, code);
}

function updateTitle(routeId: string | null, routes: Route[]): void {
  const route = routeId === null ? undefined : routes.find((r) => r.routeId === routeId);
  document.title = route ? `${route.routeShortName} · ${APP_TITLE}` : `Hat Kataloğu · ${APP_TITLE}`;
}

export function useRouteUrlSync(): void {
  const { data: routes, isInfoLoaded } = useCatalogRoutes();
  // Katalog gelene kadar adres store'a uygulanmaz; store → adres yazımı da bekler
  const isReadyRef = useRef(false);
  // Dinleyiciler her zaman güncel kataloğu okur (ilk efekt: sonraki efektlerden önce çalışır)
  const routesRef = useRef<Route[]>([]);
  useEffect(() => {
    routesRef.current = routes ?? [];
  });

  // Adresi store'a uygular (açılış ve geri/ileri). Bilinmeyen hat kodunda katalog açılır.
  const applyUrl = () => {
    const parsed = parsePath(window.location.pathname);
    if (parsed === null) return; // Başka sayfaya geçiliyor (ör. ana sayfa)
    const routes = routesRef.current;
    const { routeId, selectRouteIntent, clearRoute } = useRouteStore.getState();

    if (parsed.kind === 'code') {
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

  /**
   * Seçili hattı adrese yazar. `push`: yeni geçmiş kaydı (hat seçimi / kataloğa dönüş);
   * aksi halde yerinde düzeltme (kod değişikliği). Hat katalogda yoksa dokunulmaz.
   */
  const writeUrl = (routeId: string | null, push: boolean) => {
    if (!isRoutesPath(window.location.pathname)) return; // Sayfadan çıkılıyor
    const routes = routesRef.current;
    updateTitle(routeId, routes);
    const route = routeId === null ? undefined : routes.find((r) => r.routeId === routeId);
    if (routeId !== null && !route) return;
    const path = route ? routePath(route.routeShortName) : ROUTES_PATH;
    if (path === window.location.pathname) return;
    if (push) window.history.pushState(null, '', path);
    else window.history.replaceState(null, '', path);
  };

  // Katalog (ve hat bilgisi) hazır olunca adres bir kez uygulanır; dinleyiciler kurulur
  const isCatalogReady = routes !== undefined && isInfoLoaded;
  useEffect(() => {
    if (!isCatalogReady) return;
    applyUrl();
    isReadyRef.current = true;
    updateTitle(useRouteStore.getState().routeId, routesRef.current);

    window.addEventListener('popstate', applyUrl);
    const unsubscribe = useRouteStore.subscribe((state, prev) => {
      if (state.routeId === prev.routeId || !isReadyRef.current) return;
      writeUrl(state.routeId, true);
    });

    return () => {
      window.removeEventListener('popstate', applyUrl);
      unsubscribe();
    };
  }, [isCatalogReady]);

  // Katalog değişince (kod düzenlendi, hat eklendi / silindi) açık hattın adresi düzeltilir
  useEffect(() => {
    if (!isReadyRef.current || !routes) return;
    const { routeId, clearRoute } = useRouteStore.getState();
    if (routeId !== null && !routes.some((r) => r.routeId === routeId)) {
      // Açık hat silindi (ya da eklenmesi geri alındı)
      clearRoute();
      return;
    }
    // Katalogdayken açılan yeni hat, eklendiği anda katalogda henüz yoktu: geçmiş kaydı olarak yazılır
    writeUrl(routeId, window.location.pathname === ROUTES_PATH);
  }, [routes]);

  // Sayfadan çıkınca (ör. ana sayfaya dönüş) seçili hat temizlenir; taslaklar korunur
  useEffect(() => {
    return () => {
      isReadyRef.current = false;
      useRouteStore.getState().clearRoute();
    };
  }, []);
}
