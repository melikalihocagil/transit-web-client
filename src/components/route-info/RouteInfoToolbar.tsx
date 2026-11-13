import React from 'react';
import { Undo2, Redo2, Save, Loader2, Palette } from 'lucide-react';
import {
  useRouteInfoStore,
  selectRouteInfoChangeCount,
  selectHasUnsavedRouteInfos,
  selectCanUndoRouteInfo,
  selectCanRedoRouteInfo,
} from '../../store';

const iconButton =
  'p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer';

/**
 * Hat bilgisi (kod, ad, tür, renk) araç çubuğu: durak ve hat sırası düzenlemelerinden ayrı geçmiş ve ayrı Kaydet.
 */
export const RouteInfoToolbar: React.FC = () => {
  const changeCount = useRouteInfoStore(selectRouteInfoChangeCount);
  const hasUnsaved = useRouteInfoStore(selectHasUnsavedRouteInfos);
  const canUndo = useRouteInfoStore(selectCanUndoRouteInfo);
  const canRedo = useRouteInfoStore(selectCanRedoRouteInfo);
  const status = useRouteInfoStore((state) => state.status);
  const error = useRouteInfoStore((state) => state.error);
  const { undo, redo, save } = useRouteInfoStore.getState();

  const isSaving = status === 'saving';

  return (
    <div className="flex items-center gap-2 text-sm">
      {error && (
        <span className="text-rose-400 max-w-64 truncate" title={error}>
          {error}
        </span>
      )}

      <span className="flex items-center gap-1.5 text-slate-400">
        <Palette className="w-4 h-4 text-violet-400" />
        {changeCount > 0 ? (
          <>
            <strong className="text-violet-300">{changeCount}</strong> hat bilgisi
          </>
        ) : (
          'Hat bilgisi değişmedi'
        )}
      </span>

      <div className="flex items-center bg-slate-800/80 rounded border border-slate-700/60 p-0.5">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo || isSaving}
          className={iconButton}
          title="Hat bilgisi değişikliğini geri al"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo || isSaving}
          className={iconButton}
          title="Hat bilgisi değişikliğini ileri al"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!hasUnsaved || status !== 'idle'}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-30 disabled:hover:bg-violet-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
        title="Hat bilgilerini (kod, ad, tür, renk; yeni ve silinen hatlar) sunucuya kaydet"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Hat bilgilerini kaydet
      </button>
    </div>
  );
};

