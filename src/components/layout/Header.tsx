import React, { useEffect } from 'react';
import { Layers, User, Undo2, Redo2, Save, RotateCcw, Loader2 } from 'lucide-react';
import {
  useStopDraftStore,
  useRouteStore,
  useEditHistoryStore,
  saveAll,
  selectHasUnsavedRoutes,
  selectCanUndo,
  selectCanRedo,
  selectStopChangeCount,
} from '../../store';
import { AffectedRoutesDropdown } from './AffectedRoutesDropdown';
import { HOME_PATH, linkClickHandler } from '../../routing/location';

interface HeaderProps {
  operatorId?: string;
}

const iconButton =
  'p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer';

/** Durak taslağı araç çubuğu: değişiklik sayısı, geri al / ileri al, sıfırla; durak ve hat taslaklarını kaydet. */
const StopDraftToolbar: React.FC = () => {
  const changeCount = useStopDraftStore(selectStopChangeCount);
  const hasUnsavedRoutes = useRouteStore(selectHasUnsavedRoutes);
  // Ortak geçmiş (durak + hat): adım varsa sunucuya yazılmamış düzenleme vardır
  const canUndo = useEditHistoryStore(selectCanUndo);
  const canRedo = useEditHistoryStore(selectCanRedo);
  const status = useStopDraftStore((state) => state.status);
  const error = useStopDraftStore((state) => state.error);
  const undo = useEditHistoryStore((state) => state.undo);
  const redo = useEditHistoryStore((state) => state.redo);
  const resetDraft = useStopDraftStore((state) => state.resetDraft);

  // Etkilenen hat listesi duraklardan ayrı yüklenir
  useEffect(() => {
    void useStopDraftStore.getState().loadAffectedRoutes();
  }, []);

  const isSaving = status === 'saving';
  const canSave = status === 'idle' && (canUndo || hasUnsavedRoutes);

  return (
    <div className="flex items-center gap-2 text-sm">
      {error && (
        <span className="text-rose-400 max-w-80 truncate" title={error}>
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
          <Undo2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo || isSaving} className={iconButton} title="İleri Al (Ctrl+Y / Ctrl+Shift+Z)">
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={resetDraft}
          disabled={changeCount === 0 || isSaving}
          className={iconButton}
          title="Tüm durak değişikliklerini geri al (Ctrl+Z ile geri getirilebilir)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => void saveAll()}
        disabled={!canSave}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-30 disabled:hover:bg-blue-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
        title="Durak ve hat taslaklarını sunucuya kaydet"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Kaydet
      </button>

      <AffectedRoutesDropdown />
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({ operatorId = 'operator-1' }) => {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-20 shrink-0">
      <div className="flex items-center gap-3">
        {/* Logo ve başlık ana sayfaya döner */}
        <a
          href={HOME_PATH}
          onClick={linkClickHandler(HOME_PATH)}
          title="Ana sayfa"
          className="flex items-center gap-3 rounded-lg -m-1 p-1 hover:bg-slate-800/60 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-white">Transit Route Studio</h1>
        </a>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20">
          Admin Client
        </span>
      </div>

      <div className="flex items-center gap-3">
        <StopDraftToolbar />

        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-sm text-slate-300">
          <User className="w-4 h-4 text-blue-400" />
          <span className="text-slate-400">Operatör:</span>
          <span className="font-medium text-slate-200">{operatorId}</span>
        </div>
      </div>

    </header>
  );
};
