import React from 'react';
import { ArrowRight, Compass, AlertTriangle } from 'lucide-react';
import type { Route } from '../../../model';

interface RouteCardProps {
  route: Route;
  isSelected: boolean;
  isAffected?: boolean;
  /** Bu tarayıcıda kaydedilmemiş yerel taslağı var mı? */
  hasLocalDraft?: boolean;
  onSelect: (routeId: string) => void;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  route,
  isSelected,
  isAffected = false,
  hasLocalDraft = false,
  onSelect,
}) => {
  const badgeBg = route.routeColor ? `#${route.routeColor.replace('#', '')}` : '#2563eb';
  const badgeText = route.routeTextColor ? `#${route.routeTextColor.replace('#', '')}` : '#ffffff';

  return (
    <button
      type="button"
      onClick={() => onSelect(route.routeId)}
      className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-2 group cursor-pointer ${
        isSelected
          ? 'bg-blue-950/40 border-blue-500/60 shadow-sm shadow-blue-500/20'
          : isAffected
            ? 'bg-amber-950/25 border-amber-500/40 hover:bg-amber-950/40 hover:border-amber-500/60'
            : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
      }`}
    >
      {/* Üst Kısım: Hat Kodu Rozeti, Yön ve Etiketler */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            style={{ backgroundColor: badgeBg, color: badgeText }}
            className="px-2 py-0.5 rounded font-mono font-bold text-sm shadow-xs tracking-wide"
          >
            {route.routeShortName}
          </span>
          <span className="text-[13px] font-mono text-slate-400 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-slate-500" />
            Yön {route.directionId}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isAffected && (
            <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              Etkilendi
            </span>
          )}

          {hasLocalDraft && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
              Yerel Taslak
            </span>
          )}

          {route.hasDraft && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Taslak Var
            </span>
          )}
        </div>
      </div>

      {/* Orta Kısım: Hat Adı */}
      <div className="text-sm font-medium text-slate-200 line-clamp-1 group-hover:text-blue-300 transition-colors">
        {route.routeLongName}
      </div>

      {/* Alt Kısım: Varış Sevk Başlığı */}
      {route.tripHeadsign && (
        <div className="text-[13px] text-slate-500 flex items-center gap-1 truncate font-sans">
          <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-600" />
          <span className="truncate">{route.tripHeadsign}</span>
        </div>
      )}
    </button>
  );
};
