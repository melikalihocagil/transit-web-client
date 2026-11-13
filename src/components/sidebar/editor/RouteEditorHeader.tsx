import React from 'react';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Navigation,
  Clock,
  Compass,
  AlertTriangle,
  Pencil,
} from 'lucide-react';
import type { Route, RouteDetail } from '../../../model';
import {
  formatDistance,
  formatDuration,
  routeTypeLabel,
  toCssColor,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_ROUTE_TEXT_COLOR,
} from '../../../model';
import {
  useRouteInfoStore,
  selectRouteInfo,
  selectIsRouteInfoChanged,
  selectIsNewRoute,
} from '../../../store';
import { ROUTE_INFO_PATH, linkClickHandler, pathWithCode } from '../../../routing/location';

interface RouteEditorHeaderProps {
  routeId: string;
  routeInfo: Route | null;
  activeRoute: RouteDetail | null;
  isDirty: boolean;
  isAffected?: boolean;
  isRouting: boolean;
  isLoading: boolean;
  onBack: () => void;
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
}) => {
  const badgeBg = toCssColor(routeInfo?.routeColor, DEFAULT_ROUTE_COLOR);
  const badgeText = toCssColor(routeInfo?.routeTextColor, DEFAULT_ROUTE_TEXT_COLOR);

  const stopCount = activeRoute?.stops.length ?? 0;
  const viaCount = activeRoute?.vias.length ?? 0;
  const navigation = activeRoute?.navigation;

  return (
    <div className="p-3 border-b border-slate-800 bg-slate-900/90 flex flex-col gap-2.5">
      {/* 1. Üst Kontrol Satırı: Geri Dön Butonu ve Durum (geri al / ileri al / sıfırla üst bardadır) */}
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

        {/* Durum Göstergesi */}
        <div className="flex items-center gap-2">
          {isRouting ? (
            <span className="flex items-center gap-1 text-[13px] text-blue-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              OSRM
            </span>
          ) : isDirty ? (
            <span className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Taslak
            </span>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Yayınlanan
            </span>
          )}
        </div>
      </div>

      {/* 2. Hat Künyesi (hat bilgisi düzenlenebilir) */}
      <RouteInfoSection routeId={routeId} routeInfo={routeInfo} badgeBg={badgeBg} badgeText={badgeText} />

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

/**
 * Künye (salt okunur): rozet + ad, tür / ajans ve taslak etiketi. Hat bilgisi /route-info sayfasında
 * düzenlenir; bağlantı o hattı orada açar.
 */
const RouteInfoSection: React.FC<{
  routeId: string;
  routeInfo: Route | null;
  badgeBg: string;
  badgeText: string;
}> = ({ routeId, routeInfo, badgeBg, badgeText }) => {
  const info = useRouteInfoStore((state) => selectRouteInfo(state, routeId));
  const isChanged = useRouteInfoStore((state) => selectIsRouteInfoChanged(state, routeId));
  const isNew = useRouteInfoStore((state) => selectIsNewRoute(state, routeId));
  const infoPath = info ? pathWithCode(ROUTE_INFO_PATH, info.routeShortName) : ROUTE_INFO_PATH;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 min-w-0">
        <span
          style={{ backgroundColor: badgeBg, color: badgeText }}
          className="px-2 py-0.5 rounded font-mono font-bold text-sm shadow-xs shrink-0"
        >
          {routeInfo?.routeShortName ?? routeId}
        </span>
        <span className="text-sm font-semibold text-slate-100 truncate flex-1 min-w-0" title={routeInfo?.routeLongName}>
          {routeInfo?.routeLongName ?? `Hat ${routeId}`}
        </span>
        <a
          href={infoPath}
          onClick={linkClickHandler(infoPath)}
          className="p-1.5 shrink-0 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Hat bilgilerini düzenle (kod, ad, tür, renk)"
        >
          <Pencil className="w-4 h-4" />
        </a>
      </div>

      {info && (
        <div className="flex items-center gap-2 text-[13px] text-slate-500 font-mono">
          <span>{routeTypeLabel(info.routeType)}</span>
          <span>&bull;</span>
          <span>Ajans {info.agencyId}</span>
          {isNew ? (
            <span className="px-1.5 py-0.5 rounded text-xs font-sans font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Yeni Hat
            </span>
          ) : (
            isChanged && (
              <span className="px-1.5 py-0.5 rounded text-xs font-sans font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">
                Bilgi Değişti
              </span>
            )
          )}
        </div>
      )}

      {routeInfo?.tripHeadsign && (
        <div className="text-[13px] text-slate-400 flex items-center gap-1 font-mono">
          <Compass className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="truncate">{routeInfo.tripHeadsign}</span>
        </div>
      )}
    </div>
  );
};
