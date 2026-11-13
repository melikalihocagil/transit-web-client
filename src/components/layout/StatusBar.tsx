import React, { useSyncExternalStore } from 'react';
import { Loader2, AlertCircle, CheckCircle2, GitBranch, MapPin, AlertTriangle } from 'lucide-react';
import {
  useRouteStore,
  useStopDraftStore,
  selectIsRouteDirty,
  useActiveRoute,
  selectAffectedRouteIds,
} from '../../store';
import { basemapLabelStore } from '../map/basemap';

interface StatusBarProps {
  statusText?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  statusText = 'Sistem Hazır',
}) => {
  // Etkin altlık (yerel OSM ya da Esri); altlık seçicisiyle değişir
  const tileLabel = useSyncExternalStore(basemapLabelStore.subscribe, basemapLabelStore.getSnapshot);
  const isRouting = useRouteStore((state) => state.isRouting);
  const isLoading = useRouteStore((state) => state.isLoading);
  const error = useRouteStore((state) => state.error);
  const routeId = useRouteStore((state) => state.routeId);
  const isDirty = useRouteStore(selectIsRouteDirty);
  const activeRoute = useActiveRoute();
  const affectedRouteIds = useStopDraftStore(selectAffectedRouteIds);

  // Durum Metni ve Göstergesinin Dinamik Belirlenmesi
  const renderStatus = () => {
    if (isRouting) {
      return (
        <span className="flex items-center gap-1.5 text-blue-400 font-medium animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
          OSRM Güzergah Optimize Ediliyor...
        </span>
      );
    }

    if (isLoading) {
      return (
        <span className="flex items-center gap-1.5 text-blue-400 font-medium animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
          Hat Verisi Alınıyor...
        </span>
      );
    }

    if (error) {
      return (
        <span className="flex items-center gap-1.5 text-rose-400 font-medium">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          {error}
        </span>
      );
    }

    if (isDirty) {
      return (
        <span className="flex items-center gap-1.5 text-amber-400 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          Taslak Düzenleniyor (Staged)
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5 text-slate-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        {statusText}
      </span>
    );
  };

  return (
    <footer className="h-8 bg-slate-900/90 border-t border-slate-800/80 px-4 flex items-center justify-between text-[13px] text-slate-500 shrink-0">
      <div className="flex items-center gap-4">
        {renderStatus()}

        {routeId && (
          <span className="flex items-center gap-1 text-slate-400 font-mono text-xs pl-3 border-l border-slate-800">
            <GitBranch className="w-3.5 h-3.5 text-slate-500" />
            Hat: <strong className="text-slate-200">{routeId}</strong>
          </span>
        )}

        {affectedRouteIds.length > 0 && (
          <span className="flex items-center gap-1 text-amber-400 font-mono text-xs pl-3 border-l border-slate-800 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>{affectedRouteIds.length} hat etkilendi</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 font-mono text-xs">
        {activeRoute && (
          <span className="flex items-center gap-2 text-slate-400">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              {activeRoute.stops.length} durak
            </span>
            {activeRoute.vias.length > 0 && (
              <span className="text-amber-400">
                ({activeRoute.vias.length} via)
              </span>
            )}
          </span>
        )}
        <span>{tileLabel}</span>
      </div>
    </footer>
  );
};
