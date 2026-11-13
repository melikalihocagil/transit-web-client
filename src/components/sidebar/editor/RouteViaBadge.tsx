import React from 'react';
import { Trash2, Crosshair } from 'lucide-react';
import type { Via } from '../../../model';
import { focusMapCoordinate } from '../../map/mapEvents';

interface RouteViaBadgeProps {
  via: Via;
  onRemove: (via: Via) => void;
}

export const RouteViaBadge: React.FC<RouteViaBadgeProps> = ({ via, onRemove }) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1 my-0.5 ml-4 pl-4 border-l-2 border-dashed border-amber-500/40 text-[13px] text-slate-400">
      <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-xs shadow-amber-400/50" />

      <button
        type="button"
        onClick={() => focusMapCoordinate(via.lat, via.lon, 17)}
        className="flex items-center gap-1.5 text-slate-300 hover:text-amber-300 transition-colors font-mono cursor-pointer truncate"
        title="Haritada bu ara noktaya odaklan"
      >
        <span className="font-semibold text-amber-400">Via #{via.viaSequence}</span>
        <span className="text-xs text-slate-500">
          ({via.lat.toFixed(4)}, {via.lon.toFixed(4)})
        </span>
        <Crosshair className="w-3.5 h-3.5 text-slate-500 hover:text-amber-400 ml-0.5 shrink-0" />
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => onRemove(via)}
        className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
        title="Bu ara noktayı (via) sil"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
