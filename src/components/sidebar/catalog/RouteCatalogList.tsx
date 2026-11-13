import React, { useMemo } from 'react';
import { RouteCard } from './RouteCard';
import { Route as RouteIcon, AlertCircle, RefreshCw } from 'lucide-react';
import type { Route } from '../../../model';

const ROUTE_CODE_COLLATOR = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

interface RouteCatalogListProps {
  routes: Route[] | undefined;
  searchQuery: string;
  selectedRouteId: string | null;
  affectedRouteIds?: string[];
  /** Yerel (kaydedilmemiş) taslağı olan hatlar */
  localDraftRouteIds?: string[];
  onSelectRoute: (routeId: string) => void;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
}

export const RouteCatalogList: React.FC<RouteCatalogListProps> = ({
  routes = [],
  searchQuery,
  selectedRouteId,
  affectedRouteIds = [],
  localDraftRouteIds = [],
  onSelectRoute,
  isLoading,
  error,
  onRetry,
}) => {
  const filteredRoutes = useMemo(() => {
    if (!routes || routes.length === 0) return [];

    const q = searchQuery.toLowerCase().trim();
    const matches = q
      ? routes.filter(
          (r) =>
            r.routeShortName.toLowerCase().includes(q) ||
            r.routeLongName.toLowerCase().includes(q) ||
            r.tripHeadsign.toLowerCase().includes(q)
        )
      : routes;

    // Hat koduna göre artan: Türkçe harf sırası, sayılar doğal sırada (B2 < B10); eşitse yön, sonra id
    return [...matches].sort(
      (a, b) =>
        ROUTE_CODE_COLLATOR.compare(a.routeShortName, b.routeShortName) ||
        a.directionId - b.directionId ||
        ROUTE_CODE_COLLATOR.compare(a.routeId, b.routeId)
    );
  }, [routes, searchQuery]);

  // 1. Yükleme Durumu (Skeleton)
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60 animate-pulse space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="h-6 w-14 bg-slate-800 rounded" />
              <div className="h-5 w-20 bg-slate-800/80 rounded" />
            </div>
            <div className="h-4 w-3/4 bg-slate-800 rounded" />
            <div className="h-3.5 w-1/2 bg-slate-800/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // 2. Hata Durumu
  if (error) {
    return (
      <div className="flex-1 p-4 flex flex-col items-center justify-center text-center text-rose-400 gap-3">
        <AlertCircle className="w-10 h-10 text-rose-500/80 stroke-1" />
        <div className="text-sm font-medium text-slate-300">
          Hat kataloğu yüklenemedi
        </div>
        <p className="text-[13px] text-slate-500 max-w-xs">{error.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tekrar Dene
          </button>
        )}
      </div>
    );
  }

  // 3. Arama Sonucu Boş Durumu
  if (filteredRoutes.length === 0) {
    return (
      <div className="flex-1 p-4 flex flex-col items-center justify-center text-center text-slate-500">
        <RouteIcon className="w-10 h-10 mb-2 stroke-1 text-slate-600" />
        <p className="text-sm font-medium text-slate-400">
          {searchQuery ? 'Eşleşen hat bulunamadı' : 'Katalogda hat bulunamadı'}
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          {searchQuery
            ? 'Farklı bir hat kodu veya güzergah adı deneyebilirsiniz'
            : 'Sunucuda kayıtlı hat verisi mevcut değil'}
        </p>
      </div>
    );
  }

  // 4. Hat Kartları Listesi
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
      {filteredRoutes.map((route) => (
        <RouteCard
          key={route.routeId}
          route={route}
          isSelected={route.routeId === selectedRouteId}
          isAffected={affectedRouteIds.includes(route.routeId)}
          hasLocalDraft={localDraftRouteIds.includes(route.routeId)}
          onSelect={onSelectRoute}
        />
      ))}
    </div>
  );
};
