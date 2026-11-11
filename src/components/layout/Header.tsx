import React, { useState } from 'react';
import { Layers, User, AlertTriangle } from 'lucide-react';
import { useStopStore, selectAffectedRouteIds } from '../../store';
import { useRoutesQuery } from '../../api';
import { AffectedRoutesDropdown } from './AffectedRoutesDropdown';

interface HeaderProps {
  operatorId?: string;
}

export const Header: React.FC<HeaderProps> = ({ operatorId = 'operator-1' }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const affectedRouteIds = useStopStore(selectAffectedRouteIds);
  const clearAffectedRoutesIntent = useStopStore((state) => state.clearAffectedRoutesIntent);
  const { data: routes = [] } = useRoutesQuery();

  const hasAffectedRoutes = affectedRouteIds.length > 0;

  return (
    <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-20 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <Layers className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-white">Transit Route Studio</h1>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20">
          Admin Client
        </span>
      </div>

      {/* Sağ Taraf: Etkilenen Hatlar Rozeti + Operatör Bilgisi */}
      <div className="flex items-center gap-3">
        {hasAffectedRoutes && (
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs text-amber-300 transition-all cursor-pointer shadow-xs shadow-amber-500/10 group"
            title="Durak taşıma nedeniyle geometrisi etkilenen hatları incele"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">Etkilenen Hatlar ({affectedRouteIds.length})</span>
          </button>
        )}

        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
          <User className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">Operatör:</span>
          <span className="font-medium text-slate-200">{operatorId}</span>
        </div>
      </div>

      {/* Açılır Etkilenen Hatlar Paneli */}
      <AffectedRoutesDropdown
        isOpen={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        affectedRouteIds={affectedRouteIds}
        routes={routes}
        onClear={() => {
          clearAffectedRoutesIntent();
          setIsDropdownOpen(false);
        }}
      />
    </header>
  );
};
