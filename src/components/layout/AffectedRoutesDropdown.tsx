import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Compass, MapPin } from 'lucide-react';
import { isDeletedStop } from '../../model';
import { useRouteStore, useStopDraftStore, selectAffectedRoutes } from '../../store';
import { useRoutesQuery } from '../../api';

const toHex = (color: string | undefined, fallback: string) =>
  color ? `#${color.replace('#', '')}` : fallback;

/**
 * Kaydet'in yanındaki "Etkilenen Hatlar" uyarısı. Yalnızca etkilenen hat varken görünür;
 * tıklanınca her hattı ve onu etkileyen durakları kart olarak listeler.
 */
export const AffectedRoutesDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const affectedRoutes = useStopDraftStore(selectAffectedRoutes);
  const draft = useStopDraftStore((state) => state.draft);
  const published = useStopDraftStore((state) => state.published);
  const selectRouteIntent = useRouteStore((state) => state.selectRouteIntent);
  const activeRouteId = useRouteStore((state) => state.routeId);
  const { data: routes = [] } = useRoutesQuery();

  const routeIds = Object.keys(affectedRoutes);

  // Dışarı tıklayınca veya Esc ile kapanır
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (routeIds.length === 0) return null;

  const stopName = (stopId: string) => {
    const entry = draft[stopId];
    const stop = entry && !isDeletedStop(entry) ? entry : published[stopId];
    return stop?.stopName ?? stopId;
  };

  const handleSelectRoute = (routeId: string) => {
    void selectRouteIntent(routeId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-semibold transition-colors cursor-pointer"
        title="Durak değişikliklerinden etkilenen hatları göster"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        {routeIds.length} hat etkilendi
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-3.5 py-2.5 bg-amber-950/30 border-b border-amber-500/20 text-xs font-semibold text-slate-100">
            Etkilenen Hatlar
            <span className="ml-1.5 px-1.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {routeIds.length}
            </span>
          </div>

          <div className="overflow-y-auto max-h-[60vh] p-2 space-y-1.5">
            {routeIds.map((routeId) => {
              const route = routes.find((r) => r.routeId === routeId);
              const isSelected = activeRouteId === routeId;

              return (
                <button
                  key={routeId}
                  type="button"
                  onClick={() => handleSelectRoute(routeId)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors group cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950/50 border-blue-500/50'
                      : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        style={{
                          backgroundColor: toHex(route?.routeColor, '#2563eb'),
                          color: toHex(route?.routeTextColor, '#ffffff'),
                        }}
                        className="px-2 py-0.5 rounded font-mono font-bold text-xs shrink-0"
                      >
                        {route?.routeShortName ?? routeId}
                      </span>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-xs font-medium text-slate-200 truncate group-hover:text-blue-300 transition-colors">
                          {route?.routeLongName ?? `Hat ${routeId}`}
                        </span>
                        {route && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                            <Compass className="w-2.5 h-2.5 text-slate-500" />
                            Yön {route.directionId}
                            {route.tripHeadsign && <> &bull; {route.tripHeadsign}</>}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                        Açık
                      </span>
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 shrink-0" />
                    )}
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-700/50">
                    <div className="text-[10px] text-slate-500 mb-1">Etkileyen duraklar</div>
                    <div className="flex flex-wrap gap-1">
                      {affectedRoutes[routeId].stopIds.map((stopId) => (
                        <span
                          key={stopId}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-200"
                          title={stopId}
                        >
                          <MapPin className="w-2.5 h-2.5 text-amber-400" />
                          {stopName(stopId)}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
