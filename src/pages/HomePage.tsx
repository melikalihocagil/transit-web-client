import React, { useEffect } from 'react';
import { Layers, User, Route as RouteIcon, MapPin, ArrowRight, AlertTriangle, PencilLine, Tags, Palette } from 'lucide-react';
import {
  useStopDraftStore,
  useRouteStore,
  useEditHistoryStore,
  selectCanUndo,
  selectHasUnsavedRoutes,
  selectStopChangeCount,
  selectAffectedRouteIds,
  useCatalogRoutes,
  useRouteInfoStore,
  selectHasUnsavedRouteInfos,
  selectEffectiveRouteInfos,
  selectRouteInfoChangeCount,
} from '../store';
import { ROUTES_PATH, ROUTE_INFO_PATH, linkClickHandler } from '../routing/location';
import { ROUTE_COLOR_GROUP_ORDER, routeColorGroup, toCssColor, DEFAULT_ROUTE_COLOR } from '../model';

const APP_TITLE = 'Transit Route Studio';

/** Hat düzenleyici kartının üst kısmındaki küçük güzergâh çizimi (dekoratif). */
const RoutePreview: React.FC = () => (
  <svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice" className="block w-full h-28" aria-hidden="true">
    <defs>
      <pattern id="home-grid" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M16 0H0V16" fill="none" stroke="#1e293b" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="320" height="96" fill="url(#home-grid)" />
    <path d="M28 68 C 70 68, 76 32, 120 34 S 190 72, 230 58 S 276 30, 292 30" fill="none" stroke="#334155" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 10" />
    <path d="M28 68 C 70 68, 76 32, 120 34 S 190 72, 230 58 S 276 30, 292 30" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" className="transit-home-route" />
    {[
      [28, 68],
      [120, 34],
      [230, 58],
      [292, 30],
    ].map(([x, y], i) => (
      <g key={i}>
        <circle cx={x} cy={y} r="8" fill="#1d4ed8" stroke="#ffffff" strokeWidth="2" />
        <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#ffffff" fontFamily="sans-serif">
          {i + 1}
        </text>
      </g>
    ))}
    {[
      [60, 58],
      [170, 52],
      [270, 40],
      [200, 20],
      [80, 22],
    ].map(([x, y], i) => (
      <circle key={`c${i}`} cx={x} cy={y} r="3.5" fill="#94a3b8" stroke="#334155" strokeWidth="1.5" />
    ))}
  </svg>
);

/** Hat bilgileri kartının üst kısmı: her kod grubunun hatları, güncel renkleriyle (canlı). */
const RouteColorPreview: React.FC = () => {
  const routes = useRouteInfoStore((state) => selectEffectiveRouteInfos(state));
  const groups = ROUTE_COLOR_GROUP_ORDER
    .map((key) => ({ key, routes: routes.filter((r) => routeColorGroup(r.routeShortName) === key) }))
    .filter((g) => g.routes.length > 0);

  return (
    <div className="h-28 px-4 py-3 flex items-end gap-2 bg-[length:16px_16px] bg-[linear-gradient(#1e293b_1px,transparent_1px),linear-gradient(90deg,#1e293b_1px,transparent_1px)]" aria-hidden="true">
      {groups.map((g) => (
        <div key={g.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex flex-col-reverse gap-px rounded overflow-hidden">
            {g.routes.slice(0, 12).map((r) => (
              <div key={r.routeId} className="h-1" style={{ backgroundColor: toCssColor(r.routeColor, DEFAULT_ROUTE_COLOR) }} />
            ))}
          </div>
          <span className="text-[11px] font-mono text-slate-500">{g.key}</span>
        </div>
      ))}
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; value: React.ReactNode; label: string }> = ({ icon, value, label }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800">
    <span className="text-slate-500">{icon}</span>
    <span className="font-mono font-semibold text-slate-100">{value}</span>
    <span className="text-slate-500 text-sm">{label}</span>
  </div>
);

/** Ana sayfa (/): çalışma alanlarına kartlarla giriş. */
export const HomePage: React.FC = () => {
  const { data: routes, isLoading: isRoutesLoading } = useCatalogRoutes();
  const stopCount = useStopDraftStore((state) => Object.keys(state.published).length);
  const stopChangeCount = useStopDraftStore(selectStopChangeCount);
  const affectedCount = useStopDraftStore((state) => selectAffectedRouteIds(state).length);
  const hasUndo = useEditHistoryStore(selectCanUndo);
  const hasUnsavedRoutes = useRouteStore(selectHasUnsavedRoutes);
  const hasUnsaved = hasUndo || hasUnsavedRoutes;
  const hasUnsavedRouteInfos = useRouteInfoStore(selectHasUnsavedRouteInfos);
  const routeInfoChangeCount = useRouteInfoStore(selectRouteInfoChangeCount);
  const routeInfoCount = useRouteInfoStore((state) => (state.isLoaded ? selectEffectiveRouteInfos(state).length : null));
  const groupCount = useRouteInfoStore(
    (state) => new Set(selectEffectiveRouteInfos(state).map((r) => routeColorGroup(r.routeShortName)).filter(Boolean)).size
  );

  useEffect(() => {
    document.title = APP_TITLE;
    // Kart istatistiği için duraklar (düzenleyicide de aynı veri kullanılır; tekrar yüklenmez)
    if (Object.keys(useStopDraftStore.getState().published).length === 0) {
      void useStopDraftStore.getState().loadStops();
    }
    if (!useRouteInfoStore.getState().isLoaded) void useRouteInfoStore.getState().loadRouteInfos();
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-950 font-sans text-slate-100">
      {/* Üst bar (düzenleyicideki başlıkla aynı görünüm) */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-white">{APP_TITLE}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20">
            Admin Client
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-sm text-slate-300">
          <User className="w-4 h-4 text-blue-400" />
          <span className="text-slate-400">Operatör:</span>
          <span className="font-medium text-slate-200">operator-1</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Çalışma alanları</h2>
        <p className="mt-1 text-slate-400">Düzenlemek istediğiniz alanı seçin.</p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <a
            href={ROUTES_PATH}
            onClick={linkClickHandler(ROUTES_PATH)}
            className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden transition-all hover:border-blue-500/60 hover:shadow-[0_0_0_4px_rgba(59,130,246,0.12)] focus-visible:outline-none focus-visible:border-blue-500 focus-visible:shadow-[0_0_0_4px_rgba(59,130,246,0.25)]"
          >
            <div className="border-b border-slate-800 bg-slate-900">
              <RoutePreview />
            </div>

            <div className="flex flex-col gap-4 p-5 flex-1">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <RouteIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Hat ve Durak Düzenleyici</h3>
                  <p className="mt-0.5 text-sm text-slate-400">
                    Hatların durak sırasını ve güzergâhını, şehir duraklarının konumunu harita üzerinde düzenleyin.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Stat
                  icon={<RouteIcon className="w-4 h-4" />}
                  value={isRoutesLoading ? '…' : (routes?.length ?? '—')}
                  label="hat"
                />
                <Stat icon={<MapPin className="w-4 h-4" />} value={stopCount || '…'} label="durak" />
              </div>

              {(hasUnsaved || affectedCount > 0) && (
                <div className="flex flex-wrap gap-2 text-sm">
                  {hasUnsaved && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300">
                      <PencilLine className="w-4 h-4" />
                      Kaydedilmemiş değişiklik var
                      {stopChangeCount > 0 && <span className="text-amber-400/80">· {stopChangeCount} durak</span>}
                    </span>
                  )}
                  {affectedCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300">
                      <AlertTriangle className="w-4 h-4" />
                      {affectedCount} hat etkilendi
                    </span>
                  )}
                </div>
              )}

              <div className="mt-auto flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="font-mono text-xs text-slate-500">{ROUTES_PATH}</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-400 group-hover:text-blue-300">
                  Düzenleyiciyi aç
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </a>

          <a
            href={ROUTE_INFO_PATH}
            onClick={linkClickHandler(ROUTE_INFO_PATH)}
            className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden transition-all hover:border-violet-500/60 hover:shadow-[0_0_0_4px_rgba(139,92,246,0.12)] focus-visible:outline-none focus-visible:border-violet-500 focus-visible:shadow-[0_0_0_4px_rgba(139,92,246,0.25)]"
          >
            <div className="border-b border-slate-800 bg-slate-900">
              <RouteColorPreview />
            </div>

            <div className="flex flex-col gap-4 p-5 flex-1">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                  <Tags className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Hat Bilgileri</h3>
                  <p className="mt-0.5 text-sm text-slate-400">
                    Hatların kodunu, adını, türünü ve renklerini düzenleyin; yeni hat ekleyin ya da hat silin.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Stat icon={<RouteIcon className="w-4 h-4" />} value={routeInfoCount ?? '…'} label="hat" />
                <Stat icon={<Palette className="w-4 h-4" />} value={routeInfoCount === null ? '…' : groupCount} label="renk grubu" />
              </div>

              {hasUnsavedRouteInfos && (
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-300">
                    <PencilLine className="w-4 h-4" />
                    Kaydedilmemiş değişiklik var
                    {routeInfoChangeCount > 0 && <span className="text-violet-400/80">· {routeInfoChangeCount} hat</span>}
                  </span>
                </div>
              )}

              <div className="mt-auto flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="font-mono text-xs text-slate-500">{ROUTE_INFO_PATH}</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 group-hover:text-violet-200">
                  Hat bilgilerini aç
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </a>
        </div>
      </main>
    </div>
  );
};
