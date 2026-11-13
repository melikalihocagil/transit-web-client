import { useEffect, useMemo } from 'react';
import { useRoutesQuery } from '../api';
import { useRouteInfoStore, selectEffectiveRouteInfos } from './routeInfoStore';
import type { Route } from '../model';

/**
 * Katalog hatları: `GET /api/routes` (yön, sevk başlığı, taslak bayrağı) + hat bilgisi store'u.
 * Kod, ad ve renkler her zaman hat bilgisinin geçerli halinden (taslak ?? yayındaki) gelir; taslakta
 * silinen hat listede yoktur, yeni hat (seferi olmadığı için) yön 0 ve boş sevk başlığıyla eklenir.
 * Hat bilgisi değiştikçe liste kendiliğinden güncellenir.
 */
export function useCatalogRoutes() {
  const query = useRoutesQuery();
  const published = useRouteInfoStore((state) => state.published);
  const draft = useRouteInfoStore((state) => state.draft);
  const isLoaded = useRouteInfoStore((state) => state.isLoaded);
  const infoError = useRouteInfoStore((state) => state.error);

  // Hat bilgisi ilk kullanımda yüklenir
  useEffect(() => {
    const state = useRouteInfoStore.getState();
    if (!state.isLoaded) void state.loadRouteInfos();
  }, []);

  const data = useMemo<Route[] | undefined>(() => {
    if (!query.data) return undefined;
    if (!isLoaded) return query.data;
    const base = new Map(query.data.map((r) => [r.routeId, r]));
    const known = new Set(published.map((r) => r.routeId));
    const merged: Route[] = selectEffectiveRouteInfos({ draft, published }).map((info) => {
      const route = base.get(info.routeId);
      return {
        routeId: info.routeId,
        routeShortName: info.routeShortName,
        routeLongName: info.routeLongName,
        routeColor: info.routeColor,
        routeTextColor: info.routeTextColor,
        directionId: route?.directionId ?? 0,
        tripHeadsign: route?.tripHeadsign ?? '',
        hasDraft: route?.hasDraft ?? false,
      };
    });
    // Hat bilgisi listesinde hiç olmayan katalog hatları olduğu gibi kalır
    for (const route of query.data) if (!known.has(route.routeId)) merged.push(route);
    return merged;
  }, [query.data, published, draft, isLoaded]);

  return {
    ...query,
    data,
    isInfoLoaded: isLoaded,
    // Hat bilgisi yüklenene kadar katalog bekler (silinen hat bir an görünmesin)
    isLoading: query.isLoading || (!isLoaded && infoError === null),
  };
}
