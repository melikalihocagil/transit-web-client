import React from 'react';
import { AlertTriangle, ArrowRight, X, Trash2, Compass } from 'lucide-react';
import type { Route } from '../../model';
import { useRouteStore } from '../../store';

interface AffectedRoutesDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  affectedRouteIds: string[];
  routes: Route[];
  onClear: () => void;
}

export const AffectedRoutesDropdown: React.FC<AffectedRoutesDropdownProps> = ({
  isOpen,
  onClose,
  affectedRouteIds,
  routes,
  onClear,
}) => {
  const selectRouteIntent = useRouteStore((state) => state.selectRouteIntent);
  const activeRouteId = useRouteStore((state) => state.routeId);

  if (!isOpen) return null;

  const affectedRoutes = affectedRouteIds.map((id) => {
    const found = routes.find((r) => r.routeId === id);
    return {
      routeId: id,
      route: found ?? null,
    };
  });

  const handleSelectRoute = (routeId: string) => {
    void selectRouteIntent(routeId);
    onClose();
  };

  return (
    <>
      {/* Arka plan karartma / tıklama dışı kapatma */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Açılır Panel */}
      <div className="fixed top-14 right-4 z-50 w-96 max-h-[80vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
        {/* Başlık */}
        <div className="p-3.5 bg-amber-950/30 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                Etkilenen Hatlar
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {affectedRouteIds.length}
                </span>
              </h2>
              <p className="text-[10px] text-slate-400">Durak taşıma simülasyonu sonucu</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Açıklama */}
        <div className="px-3.5 py-2 bg-slate-950/60 border-b border-slate-800 text-[11px] text-slate-400 leading-relaxed">
          Ortak bir durağın konumu değiştirildiğinde OSRM geometrisi güncellenen hatlar aşağıdadır. İncelemek için hatta tıklayın:
        </div>

        {/* Hat Listesi */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-96">
          {affectedRoutes.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Etkilenen aktif bir hat bulunmuyor.
            </div>
          ) : (
            affectedRoutes.map(({ routeId, route }) => {
              const isSelected = activeRouteId === routeId;
              const badgeBg = route?.routeColor
                ? `#${route.routeColor.replace('#', '')}`
                : '#2563eb';
              const badgeText = route?.routeTextColor
                ? `#${route.routeTextColor.replace('#', '')}`
                : '#ffffff';

              return (
                <button
                  key={routeId}
                  type="button"
                  onClick={() => handleSelectRoute(routeId)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between gap-3 group cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950/50 border-blue-500/50 shadow-xs shadow-blue-500/20'
                      : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      style={{ backgroundColor: badgeBg, color: badgeText }}
                      className="px-2 py-0.5 rounded font-mono font-bold text-xs shrink-0 shadow-xs"
                    >
                      {route?.routeShortName ?? routeId}
                    </span>

                    <div className="min-w-0 flex flex-col">
                      <span className="text-xs font-medium text-slate-200 truncate group-hover:text-blue-300 transition-colors">
                        {route?.routeLongName ?? `Hat ${routeId}`}
                      </span>

                      {route && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
                          <span className="flex items-center gap-0.5 font-mono">
                            <Compass className="w-2.5 h-2.5 text-slate-500" />
                            Yön {route.directionId}
                          </span>
                          {route.tripHeadsign && (
                            <>
                              <span>&bull;</span>
                              <span className="truncate">{route.tripHeadsign}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSelected ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        Açık
                      </span>
                    ) : (
                      <span className="text-slate-500 group-hover:text-blue-400 transition-colors">
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Alt Çubuk */}
        <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Etkilenen hatlar uyarısını kapat ve listeyi temizle"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Listeyi Temizle</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </>
  );
};
