import React from 'react';
import {
  ArrowLeft,
  RotateCcw,
  Loader2,
  MapPin,
  Navigation,
  Clock,
  Compass,
  AlertTriangle,
  Undo2,
  Redo2,
} from 'lucide-react';
import type { Route, RouteDetail } from '../../../model';
import { formatDistance, formatDuration } from '../../../model';
import { useEditHistoryStore, selectCanUndo, selectCanRedo } from '../../../store';

interface RouteEditorHeaderProps {
  routeId: string;
  routeInfo: Route | null;
  activeRoute: RouteDetail | null;
  isDirty: boolean;
  isAffected?: boolean;
  isRouting: boolean;
  isLoading: boolean;
  onBack: () => void;
  onResetToPublished: () => void;
}

export const RouteEditorHeader: React.FC<RouteEditorHeaderProps> = ({
  routeId,
  routeInfo,
  activeRoute,
  isDirty,
  isAffected = false,
  isRouting,
  isLoading,
  onBack,
  onResetToPublished,
}) => {
  // Ortak geçmiş (durak + hat düzenlemeleri)
  const canUndo = useEditHistoryStore(selectCanUndo);
  const canRedo = useEditHistoryStore(selectCanRedo);
  const undoIntent = useEditHistoryStore((state) => state.undo);
  const redoIntent = useEditHistoryStore((state) => state.redo);

  const badgeBg = routeInfo?.routeColor
    ? `#${routeInfo.routeColor.replace('#', '')}`
    : '#2563eb';
  const badgeText = routeInfo?.routeTextColor
    ? `#${routeInfo.routeTextColor.replace('#', '')}`
    : '#ffffff';

  const stopCount = activeRoute?.stops.length ?? 0;
  const viaCount = activeRoute?.vias.length ?? 0;
  const navigation = activeRoute?.navigation;

  return (
    <div className="p-3 border-b border-slate-800 bg-slate-900/90 flex flex-col gap-2.5">
      {/* 1. Üst Kontrol Satırı: Geri Dön Butonu, Undo/Redo ve Durum */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors cursor-pointer py-1 px-1.5 rounded hover:bg-slate-800"
          title="Hat kataloğuna geri dön"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">Katalog</span>
        </button>

        {/* Durum Göstergesi & Undo/Redo Butonları */}
        <div className="flex items-center gap-2">
          {/* Geri Al (Undo) ve Yinele (Redo) Buton Grubu */}
          <div className="flex items-center bg-slate-800/80 rounded border border-slate-700/60 p-0.5">
            <button
              type="button"
              onClick={undoIntent}
              disabled={!canUndo}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Geri Al (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={redoIntent}
              disabled={!canRedo}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Yinele (Ctrl+Y / Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {isRouting ? (
            <span className="flex items-center gap-1 text-[13px] text-blue-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              OSRM
            </span>
          ) : isDirty ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Taslak
              </span>
              <button
                type="button"
                onClick={onResetToPublished}
                className="flex items-center gap-1 text-[13px] text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                title="Tüm değişiklikleri geri al ve yayınlanan sürüme dön"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Sıfırla</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Yayınlanan
            </span>
          )}
        </div>
      </div>

      {/* 2. Hat Künyesi */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            style={{ backgroundColor: badgeBg, color: badgeText }}
            className="px-2 py-0.5 rounded font-mono font-bold text-sm shadow-xs"
          >
            {routeInfo?.routeShortName ?? routeId}
          </span>
          <span className="text-sm font-semibold text-slate-100 truncate">
            {routeInfo?.routeLongName ?? `Hat ${routeId}`}
          </span>
        </div>

        {routeInfo?.tripHeadsign && (
          <div className="text-[13px] text-slate-400 flex items-center gap-1 font-mono">
            <Compass className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{routeInfo.tripHeadsign}</span>
          </div>
        )}
      </div>

      {/* 2.1. Etkilenen Hat Bilgilendirme Rozeti / Uyarısı */}
      {isAffected && (
        <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/40 flex items-start gap-2 text-[13px] text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-tight">
            <strong className="text-amber-300">Etkilenen Hat:</strong> Taşınan bir ortak durak nedeniyle bu hattın OSRM güzergahı etkilendi. Değişiklikleri inceleyip taslağınızı kaydedebilirsiniz.
          </div>
        </div>
      )}

      {/* 3. İstatistik Şeridi: Durak Sayısı, Via Sayısı, Mesafe ve Süre */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[13px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1" title="Toplam Durak Sayısı">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <strong className="text-slate-200">{stopCount}</strong> durak
          </span>

          {viaCount > 0 && (
            <span className="text-amber-400 font-semibold" title="Aktif Kılavuz Noktaları (Via)">
              +{viaCount} via
            </span>
          )}
        </div>

        {navigation && !isLoading && (
          <div className="flex items-center gap-2 text-slate-400">
            <span className="flex items-center gap-1" title="Güzergah Mesafesi">
              <Navigation className="w-3.5 h-3.5 text-slate-500" />
              {formatDistance(navigation.distance)}
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1" title="Tahmini Seyahat Süresi">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {formatDuration(navigation.duration)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
