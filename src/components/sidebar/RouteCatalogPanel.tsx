import React, { useState } from 'react';
import { Route as RouteIcon, Loader2, AlertTriangle } from 'lucide-react';
import { useRouteStore, useStopDraftStore, selectIsRouteDirty, selectAffectedRouteIds } from '../../store';
import { useRoutesQuery } from '../../api';
import { RouteSearchBar } from './catalog/RouteSearchBar';
import { RouteCatalogList } from './catalog/RouteCatalogList';
import { RouteEditorHeader } from './editor/RouteEditorHeader';
import { SortableStopList } from './editor/SortableStopList';
import { focusMapCoordinate } from '../map/mapEvents';
import type { Stop, Via } from '../../model';

export const RouteCatalogPanel: React.FC = () => {
  // 1. Sunucu Durumu: Hat Kataloğu (TanStack Query)
  const {
    data: routes = [],
    isLoading: isCatalogLoading,
    error: catalogError,
    refetch: refetchRoutes,
  } = useRoutesQuery();

  // 2. Operatör Çalışma Tezgahı Durumu (Zustand Store)
  const routeId = useRouteStore((state) => state.routeId);
  const draft = useRouteStore((state) => state.draft);
  const published = useRouteStore((state) => state.published);
  const isRouting = useRouteStore((state) => state.isRouting);
  const isLoadingRoute = useRouteStore((state) => state.isLoading);
  const isDirty = useRouteStore(selectIsRouteDirty);
  const affectedRouteIds = useStopDraftStore(selectAffectedRouteIds);

  // UDF Niyetleri (Actions)
  const selectRouteIntent = useRouteStore((state) => state.selectRouteIntent);
  const reorderStopsIntent = useRouteStore((state) => state.reorderStopsIntent);
  const removeStopIntent = useRouteStore((state) => state.removeStopIntent);
  const removeViaIntent = useRouteStore((state) => state.removeViaIntent);
  const resetToPublishedIntent = useRouteStore((state) => state.resetToPublishedIntent);
  const clearRoute = useRouteStore((state) => state.clearRoute);

  // 3. Lokal UI Durumu
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAffectedOnly, setFilterAffectedOnly] = useState(false);

  // Aktif hat verisi ve künyesi
  const activeRoute = draft ?? published;
  const activeRouteInfo = routes.find((r) => r.routeId === routeId) ?? null;

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
    <aside className="w-80 lg:w-96 h-full bg-slate-900/95 border-r border-slate-800 flex flex-col z-10 shrink-0">
      {routeId === null ? (
        // ==========================================
        // MOD A: HAT KATALOĞU GÖRÜNÜMÜ
        // ==========================================
        <>
          {/* Panel Başlığı */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RouteIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Hat Kataloğu
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
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
            <div className="mx-3 mt-2 p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  <strong>{affectedRouteIds.length} hat</strong> etkilendi
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFilterAffectedOnly((prev) => !prev)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer border ${
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
            onResetToPublished={resetToPublishedIntent}
          />

          {/* Durak ve Via Sıralama Listesi */}
          {isLoadingRoute ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs text-slate-400">Hat durakları yükleniyor...</span>
            </div>
          ) : activeRoute ? (
            <SortableStopList
              stops={activeRoute.stops}
              vias={activeRoute.vias}
              canRemove={activeRoute.stops.length > 2}
              onReorder={reorderStopsIntent}
              onRemoveStop={removeStopIntent}
              onRemoveVia={handleRemoveVia}
              onFocusStop={handleFocusStop}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-500 text-xs">
              Hat verisi bulunamadı.
            </div>
          )}
        </>
      )}
    </aside>
  );
};
