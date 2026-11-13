import React, { useMemo, useState } from 'react';
import { Route as RouteIcon, Loader2, AlertTriangle, Info } from 'lucide-react';
import {
  useRouteStore,
  useStopDraftStore,
  useActiveRoute,
  selectIsRouteDirty,
  selectAffectedRouteIds,
  useCatalogRoutes,
  useRouteInfoStore,
  selectIsNewRoute,
} from '../../store';
import { RouteSearchBar } from './catalog/RouteSearchBar';
import { RouteCatalogList } from './catalog/RouteCatalogList';
import { RouteEditorHeader } from './editor/RouteEditorHeader';
import { SortableStopList } from './editor/SortableStopList';
import { focusMapCoordinate } from '../map/mapEvents';
import type { Stop, Via } from '../../model';
import { sumLegsByStopPair } from '../../model';

export const RouteCatalogPanel: React.FC = () => {
  // 1. Sunucu Durumu: Hat Kataloğu (TanStack Query)
  const {
    data: routes = [],
    isLoading: isCatalogLoading,
    error: catalogError,
    refetch: refetchRoutes,
  } = useCatalogRoutes();

  // 2. Operatör Çalışma Tezgahı Durumu (Zustand Store)
  const routeId = useRouteStore((state) => state.routeId);
  const drafts = useRouteStore((state) => state.drafts);
  // Seçili hat: sıra (taslak ?? yayındaki) + durak store'undan çözümlenmiş konumlar
  const activeRoute = useActiveRoute();
  const isRouting = useRouteStore((state) => state.isRouting);
  const isLoadingRoute = useRouteStore((state) => state.isLoading);
  const isDirty = useRouteStore(selectIsRouteDirty);
  const affectedRouteIds = useStopDraftStore(selectAffectedRouteIds);

  // UDF Niyetleri (Actions)
  const selectRouteIntent = useRouteStore((state) => state.selectRouteIntent);
  const reorderStopsIntent = useRouteStore((state) => state.reorderStopsIntent);
  const removeStopIntent = useRouteStore((state) => state.removeStopIntent);
  const removeViaIntent = useRouteStore((state) => state.removeViaIntent);
  const clearRoute = useRouteStore((state) => state.clearRoute);

  // 3. Lokal UI Durumu
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAffectedOnly, setFilterAffectedOnly] = useState(false);

  // Yeni hat: yalnızca hat bilgisi kaydı (durak sırası sefer üzerinden tutulduğu için bu aşamada yok)
  const isNewRoute = useRouteInfoStore((state) => (routeId === null ? false : selectIsNewRoute(state, routeId)));

  // Aktif hat künyesi
  const activeRouteInfo = routes.find((r) => r.routeId === routeId) ?? null;

  // Yerel (kaydedilmemiş) taslağı olan hatlar
  const localDraftRouteIds = useMemo(() => Object.keys(drafts), [drafts]);

  // Duraklar arası toplam mesafe/süre (hesap sürerken ya da bacaklar tutarsızken gösterilmez)
  const segmentTotals = useMemo(
    () =>
      activeRoute && !isRouting
        ? sumLegsByStopPair(activeRoute.stops, activeRoute.vias, activeRoute.navigation)
        : null,
    [activeRoute, isRouting]
  );

  // Filtrelenmiş hat listesi (etkilenen hat filtresi aktifse uygula)
  const baseRoutes = filterAffectedOnly
    ? routes.filter((r) => affectedRouteIds.includes(r.routeId))
    : routes;

  // Haritada durağa odaklanma olayı
  const handleFocusStop = (stop: Stop) => {
    focusMapCoordinate(stop.lat, stop.lon, 18);
  };

  const handleRemoveVia = (via: Via) => {
    removeViaIntent(via);
  };

  return (
    <aside className="w-96 lg:w-[440px] h-full bg-slate-900/95 border-r border-slate-800 flex flex-col z-10 shrink-0">
      {routeId === null ? (
        // ==========================================
        // MOD A: HAT KATALOĞU GÖRÜNÜMÜ
        // ==========================================
        <>
          {/* Panel Başlığı */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RouteIcon className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Hat Kataloğu
              </span>
            </div>
            <span className="text-[13px] text-slate-500 font-mono">
              {routes.length} hat
            </span>
          </div>

          {/* Arama Çubuğu */}
          <RouteSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            resultCount={
              baseRoutes.filter(
                (r) =>
                  r.routeShortName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                  r.routeLongName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                  r.tripHeadsign.toLowerCase().includes(searchQuery.toLowerCase().trim())
              ).length
            }
            totalCount={baseRoutes.length}
          />

          {/* Etkilenen Hatlar Uyarı Rozeti / Filtreleme Çubuğu */}
          {affectedRouteIds.length > 0 && (
            <div className="mx-3 mt-2 p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>{affectedRouteIds.length} hat</strong> etkilendi
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFilterAffectedOnly((prev) => !prev)}
                className={`px-2 py-0.5 rounded text-[13px] font-medium transition-colors cursor-pointer border ${
                  filterAffectedOnly
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                }`}
              >
                {filterAffectedOnly ? 'Tümünü Göster' : 'Sadece Etkilenenler'}
              </button>
            </div>
          )}

          {/* Hat Kartları Listesi */}
          <RouteCatalogList
            routes={baseRoutes}
            searchQuery={searchQuery}
            selectedRouteId={routeId}
            affectedRouteIds={affectedRouteIds}
            localDraftRouteIds={localDraftRouteIds}
            onSelectRoute={(id) => selectRouteIntent(id)}
            isLoading={isCatalogLoading}
            error={catalogError}
            onRetry={() => refetchRoutes()}
          />
        </>
      ) : (
        // ==========================================
        // MOD B: SEÇİLİ HAT DÜZENLEME ÇALIŞMA ALANI
        // ==========================================
        <>
          {/* Düzenleyici Üst Başlığı */}
          <RouteEditorHeader
            routeId={routeId}
            routeInfo={activeRouteInfo}
            activeRoute={activeRoute}
            isDirty={isDirty}
            isAffected={affectedRouteIds.includes(routeId)}
            isRouting={isRouting}
            isLoading={isLoadingRoute}
            onBack={clearRoute}
          />

          {/* Durak ve Via Sıralama Listesi */}
          {isLoadingRoute ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              <span className="text-sm text-slate-400">Hat durakları yükleniyor...</span>
            </div>
          ) : isNewRoute ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
              <Info className="w-7 h-7 text-slate-600" />
              <p className="text-sm text-slate-300">Bu hat yalnızca hat bilgisi olarak oluşturuldu.</p>
              <p className="text-[13px] text-slate-500 max-w-xs">
                Durak sırası hattın seferleri üzerinden tutulur; yeni hatta sefer olmadığı için duraklar bu aşamada
                eklenemez.
              </p>
            </div>
          ) : activeRoute ? (
            <SortableStopList
              stops={activeRoute.stops}
              vias={activeRoute.vias}
              segmentTotals={segmentTotals}
              canRemove={activeRoute.stops.length > 2}
              onReorder={reorderStopsIntent}
              onRemoveStop={removeStopIntent}
              onRemoveVia={handleRemoveVia}
              onFocusStop={handleFocusStop}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-500 text-sm">
              Hat verisi bulunamadı.
            </div>
          )}
        </>
      )}
    </aside>
  );
};
