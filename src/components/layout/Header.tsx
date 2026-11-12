import React, { useState } from 'react';
import { Layers, User, AlertTriangle, Undo2, Redo2, Save, RotateCcw, Loader2 } from 'lucide-react';
import {
  useStopDraftStore,
  selectAffectedRouteIds,
  selectCanSaveStops,
  selectCanUndoStops,
  selectCanRedoStops,
  selectStopChangeCount,
} from '../../store';
import { useRoutesQuery } from '../../api';
import { AffectedRoutesDropdown } from './AffectedRoutesDropdown';

interface HeaderProps {
  operatorId?: string;
}

const iconButton =
  'p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer';

/** Durak taslağı araç çubuğu: değişiklik sayısı, geri al / ileri al, sıfırla, kaydet. */
const StopDraftToolbar: React.FC = () => {
  const changeCount = useStopDraftStore(selectStopChangeCount);
  const canSave = useStopDraftStore(selectCanSaveStops);
  const canUndo = useStopDraftStore(selectCanUndoStops);
  const canRedo = useStopDraftStore(selectCanRedoStops);
  const status = useStopDraftStore((state) => state.status);
  const error = useStopDraftStore((state) => state.error);
  const undo = useStopDraftStore((state) => state.undo);
  const redo = useStopDraftStore((state) => state.redo);
  const resetDraft = useStopDraftStore((state) => state.resetDraft);
  const saveStops = useStopDraftStore((state) => state.saveStops);

  const isSaving = status === 'saving';

  return (
    <div className="flex items-center gap-2 text-xs">
      {error && (
        <span className="text-rose-400 max-w-64 truncate" title={error}>
          {error}
        </span>
      )}

      <span className="text-slate-400">
        {changeCount > 0 ? (
          <>
            <strong className="text-amber-300">{changeCount}</strong> durak değişikliği
          </>
        ) : (
          'Durak değişikliği yok'
        )}
      </span>

      <div className="flex items-center bg-slate-800/80 rounded border border-slate-700/60 p-0.5">
        <button type="button" onClick={undo} disabled={!canUndo || isSaving} className={iconButton} title="Geri Al (Ctrl+Z)">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo || isSaving} className={iconButton} title="İleri Al (Ctrl+Y / Ctrl+Shift+Z)">
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={resetDraft}
          disabled={changeCount === 0 || isSaving}
          className={iconButton}
          title="Tüm durak değişikliklerini geri al (Ctrl+Z ile geri getirilebilir)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => void saveStops()}
        disabled={!canSave}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-30 disabled:hover:bg-blue-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
        title="Durak taslağını sunucuya kaydet"
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Kaydet
      </button>
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({ operatorId = 'operator-1' }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const affectedRouteIds = useStopDraftStore(selectAffectedRouteIds);
  const clearAffectedRoutes = useStopDraftStore((state) => state.clearAffectedRoutes);
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

      <div className="flex items-center gap-3">
        <StopDraftToolbar />

        {hasAffectedRoutes && (
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs text-amber-300 transition-all cursor-pointer shadow-xs shadow-amber-500/10 group"
            title="Durak taşıma nedeniyle geometrisi etkilenen hatları incele"
          >
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

      <AffectedRoutesDropdown
        isOpen={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        affectedRouteIds={affectedRouteIds}
        routes={routes}
        onClear={() => {
          clearAffectedRoutes();
          setIsDropdownOpen(false);
        }}
      />
    </header>
  );
};
