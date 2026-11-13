import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Layers,
  User,
  Plus,
  Search,
  Palette,
  History,
  Trash2,
  Map as MapIcon,
  Loader2,
  Tags,
  X,
} from 'lucide-react';
import {
  ROUTE_COLOR_GROUPS,
  ROUTE_COLOR_GROUP_ORDER,
  routeColorGroup,
  routeTypeLabel,
  toCssColor,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_ROUTE_TEXT_COLOR,
  type RouteInfo,
} from '../model';
import {
  useRouteInfoStore,
  selectEffectiveRouteInfos,
  selectIsRouteInfoChanged,
  selectIsNewRoute,
  type RouteInfoInput,
} from '../store';
import {
  HOME_PATH,
  ROUTES_PATH,
  ROUTE_INFO_PATH,
  linkClickHandler,
  navigate,
  parseCodePath,
  pathWithCode,
  usePathname,
} from '../routing/location';
import { RouteInfoForm } from '../components/route-info/RouteInfoForm';
import { RouteInfoToolbar } from '../components/route-info/RouteInfoToolbar';

const APP_TITLE = 'Transit Route Studio';
const CODE_COLLATOR = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
const OTHER_GROUP = 'Diğer';

/** Yeni hat formunun başlangıç değerleri (ajans: mevcut hatların tamamı 2). */
const NEW_ROUTE_DEFAULTS: RouteInfoInput = {
  agencyId: '2',
  routeShortName: '',
  routeLongName: '',
  routeType: 3,
  routeColor: '1F6FD1',
  routeTextColor: 'FFFFFF',
};

const Badge: React.FC<{ route: Pick<RouteInfo, 'routeShortName' | 'routeColor' | 'routeTextColor'> }> = ({ route }) => (
  <span
    style={{
      backgroundColor: toCssColor(route.routeColor, DEFAULT_ROUTE_COLOR),
      color: toCssColor(route.routeTextColor, DEFAULT_ROUTE_TEXT_COLOR),
    }}
    className="px-2 py-0.5 rounded font-mono font-bold text-sm shadow-xs shrink-0 min-w-12 text-center"
  >
    {route.routeShortName}
  </span>
);

/** Listede hattın taslak durumu. */
const StatusChip: React.FC<{ routeId: string }> = ({ routeId }) => {
  const isNew = useRouteInfoStore((state) => selectIsNewRoute(state, routeId));
  const isChanged = useRouteInfoStore((state) => selectIsRouteInfoChanged(state, routeId));
  if (isNew) {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
        Yeni
      </span>
    );
  }
  if (isChanged) {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30 shrink-0">
        Değişti
      </span>
    );
  }
  return null;
};

/**
 * Seçili adres ↔ hat. Seçim adresteki koddan okunur (/route-info/{kod}). Seçili hattın kodu değişirse
 * (düzenleme, geri al) adres yerinde düzeltilir; hat listeden çıktıysa listeye dönülür.
 */
function useSelectedRoute(routes: RouteInfo[], isLoaded: boolean): RouteInfo | null {
  const pathname = usePathname();
  const parsed = parseCodePath(ROUTE_INFO_PATH, pathname);
  const code = parsed?.kind === 'code' ? parsed.code : null;
  const selected = code === null ? null : (routes.find((r) => r.routeShortName === code) ?? null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const parsed = parseCodePath(ROUTE_INFO_PATH, pathname);
    if (!isLoaded || parsed === null) return;
    if (selected) {
      lastIdRef.current = selected.routeId;
      const canonical = pathWithCode(ROUTE_INFO_PATH, selected.routeShortName);
      if (canonical !== pathname) navigate(canonical, { replace: true }); // ör. %2F -> /
      return;
    }
    if (parsed.kind === 'list') {
      lastIdRef.current = null;
      return;
    }
    // Kod bulunamadı: son seçili hat hâlâ listedeyse kodu değişmiştir
    const last = routes.find((r) => r.routeId === lastIdRef.current);
    lastIdRef.current = null;
    navigate(last ? pathWithCode(ROUTE_INFO_PATH, last.routeShortName) : ROUTE_INFO_PATH, { replace: true });
  }, [isLoaded, routes, selected, pathname]);

  return selected;
}

/** Hat bilgileri sayfası (/route-info): gruplara ayrılmış hat listesi + seçili hattın formu. */
export const RouteInfoPage: React.FC = () => {
  const routes = useRouteInfoStore((state) => selectEffectiveRouteInfos(state));
  const isLoaded = useRouteInfoStore((state) => state.isLoaded);
  const status = useRouteInfoStore((state) => state.status);
  const loadError = useRouteInfoStore((state) => (state.isLoaded ? null : state.error));
  const isSaving = status === 'saving';

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setCreating] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const [isConfirmingDelete, setConfirmingDelete] = useState(false);

  const selected = useSelectedRoute(routes, isLoaded);
  const selectedId = selected?.routeId ?? null;
  const isSelectedChanged = useRouteInfoStore((state) =>
    selectedId === null ? false : selectIsRouteInfoChanged(state, selectedId)
  );
  const isSelectedNew = useRouteInfoStore((state) =>
    selectedId === null ? false : selectIsNewRoute(state, selectedId)
  );

  useEffect(() => {
    const state = useRouteInfoStore.getState();
    if (!state.isLoaded) void state.loadRouteInfos();
  }, []);

  useEffect(() => {
    document.title = selected ? `${selected.routeShortName} · Hat Bilgileri · ${APP_TITLE}` : `Hat Bilgileri · ${APP_TITLE}`;
  }, [selected]);

  // Seçim değişince silme onayı kapanır
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  if (confirmFor !== selectedId) {
    setConfirmFor(selectedId);
    setConfirmingDelete(false);
  }

  // Gruplar: tablo sırası, sonra "Diğer"; grup içinde kod sırası
  const groups = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr');
    const matches = q
      ? routes.filter(
          (r) =>
            r.routeShortName.toLocaleLowerCase('tr').includes(q) || r.routeLongName.toLocaleLowerCase('tr').includes(q)
        )
      : routes;
    const byGroup = new Map<string, RouteInfo[]>();
    for (const r of matches) {
      const key = routeColorGroup(r.routeShortName) ?? OTHER_GROUP;
      byGroup.set(key, [...(byGroup.get(key) ?? []), r]);
    }
    const order = [...ROUTE_COLOR_GROUP_ORDER, OTHER_GROUP];
    return order
      .filter((key) => byGroup.has(key))
      .map((key) => ({
        key,
        routes: byGroup.get(key)!.sort((a, b) => CODE_COLLATOR.compare(a.routeShortName, b.routeShortName)),
        // Yeniden renklendirme tüm grup için (aramadan bağımsız)
        total: routes.filter((r) => (routeColorGroup(r.routeShortName) ?? OTHER_GROUP) === key).length,
      }));
  }, [routes, searchQuery]);

  const openRoute = (route: RouteInfo) => {
    setCreating(false);
    navigate(pathWithCode(ROUTE_INFO_PATH, route.routeShortName));
  };

  const handleCreate = (input: RouteInfoInput) => {
    useRouteInfoStore.getState().createRoute(input);
    setCreating(false);
    navigate(pathWithCode(ROUTE_INFO_PATH, input.routeShortName));
  };

  const handleUpdate = (route: RouteInfo, input: RouteInfoInput) => {
    useRouteInfoStore.getState().updateRoute(route.routeId, input);
    if (input.routeShortName !== route.routeShortName) {
      navigate(pathWithCode(ROUTE_INFO_PATH, input.routeShortName), { replace: true });
    }
  };

  const handleDelete = (route: RouteInfo) => {
    setConfirmingDelete(false);
    navigate(ROUTE_INFO_PATH);
    useRouteInfoStore.getState().deleteRoute(route.routeId);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Üst bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <a
            href={HOME_PATH}
            onClick={linkClickHandler(HOME_PATH)}
            title="Ana sayfa"
            className="flex items-center gap-3 rounded-lg -m-1 p-1 hover:bg-slate-800/60 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-white">{APP_TITLE}</h1>
          </a>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 font-medium border border-violet-500/20">
            Hat Bilgileri
          </span>
        </div>
        <div className="flex items-center gap-3">
          <RouteInfoToolbar />
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-sm text-slate-300">
            <User className="w-4 h-4 text-blue-400" />
            <span className="text-slate-400">Operatör:</span>
            <span className="font-medium text-slate-200">operator-1</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sol: gruplara ayrılmış hat listesi */}
        <aside className="w-96 lg:w-[440px] h-full bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tags className="w-5 h-5 text-violet-400" />
              <span className="text-sm font-semibold uppercase tracking-wider text-slate-300">Hatlar</span>
              <span className="text-[13px] text-slate-500 font-mono">{routes.length}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                if (selected) navigate(ROUTE_INFO_PATH);
              }}
              disabled={isCreating || isSaving || !isLoaded}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[13px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni hat
            </button>
          </div>

          <div className="p-3 border-b border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kod ya da hat adı ara"
                className="w-full pl-8 pr-8 py-1.5 rounded-md bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                  title="Aramayı temizle"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!isLoaded ? (
              <div className="p-6 flex flex-col items-center gap-2 text-sm text-slate-400">
                {loadError ? (
                  <span className="text-rose-400 text-center">{loadError}</span>
                ) : (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    Hat bilgileri yükleniyor...
                  </>
                )}
              </div>
            ) : groups.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Eşleşen hat bulunamadı</div>
            ) : (
              groups.map((group) => {
                const base = ROUTE_COLOR_GROUPS[group.key];
                return (
                  <section key={group.key} className="border-b border-slate-800/80">
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900">
                      <div className="flex items-center gap-2">
                        {base && (
                          <span
                            className="w-3.5 h-3.5 rounded-sm border border-white/20"
                            style={{ backgroundColor: `#${base}` }}
                          />
                        )}
                        <span className="text-sm font-semibold text-slate-200 font-mono">{group.key}</span>
                        <span className="text-[13px] text-slate-500">{group.total} hat</span>
                      </div>
                      {base && (
                        <button
                          type="button"
                          onClick={() => useRouteInfoStore.getState().recolorGroup(group.key)}
                          disabled={isSaving}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[13px] text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={`${group.key} grubundaki ${group.total} hatta numara sırasıyla ayrı tonlar dağıt (geri alınabilir)`}
                        >
                          <Palette className="w-3.5 h-3.5" />
                          Yeniden renklendir
                        </button>
                      )}
                    </div>
                    <ul className="px-2 pb-2 space-y-0.5">
                      {group.routes.map((route) => (
                        <li key={route.routeId}>
                          <button
                            type="button"
                            onClick={() => openRoute(route)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                              route.routeId === selectedId
                                ? 'bg-blue-950/50 ring-1 ring-blue-500/60'
                                : 'hover:bg-slate-800/60'
                            }`}
                          >
                            <Badge route={route} />
                            <span className="text-sm text-slate-200 truncate flex-1 min-w-0">{route.routeLongName}</span>
                            <StatusChip routeId={route.routeId} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </aside>

        {/* Sağ: seçili hattın formu / yeni hat */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {isCreating ? (
              <>
                <h2 className="text-lg font-semibold text-white mb-3">Yeni hat</h2>
                <RouteInfoForm
                  mode="create"
                  initial={NEW_ROUTE_DEFAULTS}
                  onCancel={() => setCreating(false)}
                  onSubmit={handleCreate}
                />
                <p className="mt-3 text-[13px] text-slate-500">
                  Yeni hat yalnızca hat bilgisi olarak oluşur; durak sırası hattın seferleri üzerinden tutulduğu için
                  duraklar bu aşamada eklenemez.
                </p>
              </>
            ) : selected ? (
              <>
                <div className="flex items-center gap-3 mb-3 min-w-0">
                  <Badge route={selected} />
                  <h2 className="text-lg font-semibold text-white truncate flex-1 min-w-0">{selected.routeLongName}</h2>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={pathWithCode(ROUTES_PATH, selected.routeShortName)}
                      onClick={linkClickHandler(pathWithCode(ROUTES_PATH, selected.routeShortName))}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-sm text-slate-300 hover:text-white hover:bg-slate-800"
                      title="Hattı haritalı düzenleyicide aç (durak sırası, güzergâh)"
                    >
                      <MapIcon className="w-4 h-4" />
                      Haritada aç
                    </a>
                    {isSelectedChanged && !isSelectedNew && (
                      <button
                        type="button"
                        onClick={() => useRouteInfoStore.getState().revertRoute(selected.routeId)}
                        disabled={isSaving}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-sm text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer disabled:opacity-30"
                        title="Bu hattın bilgilerini yayındakine döndür"
                      >
                        <History className="w-4 h-4" />
                        Yayındakine döndür
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      disabled={isSaving}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-sm text-slate-300 hover:text-rose-300 hover:bg-rose-950/40 cursor-pointer disabled:opacity-30"
                      title="Hattı sil"
                    >
                      <Trash2 className="w-4 h-4" />
                      Sil
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-2 text-[13px] text-slate-500 font-mono">
                  <span>{routeTypeLabel(selected.routeType)}</span>
                  <span>&bull;</span>
                  <span>Ajans {selected.agencyId}</span>
                  <span>&bull;</span>
                  <span>{isSelectedNew ? 'kaydedilmemiş yeni hat' : `routeId ${selected.routeId}`}</span>
                  <StatusChip routeId={selected.routeId} />
                </div>

                {isConfirmingDelete && (
                  <div className="mb-3 p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 flex items-center justify-between gap-3 text-sm text-rose-200">
                    <span>
                      <strong className="text-rose-300">{selected.routeShortName}</strong> hattı silinsin mi? "Hat
                      bilgilerini kaydet"e basılana kadar geri alınabilir.
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="px-2.5 py-1 rounded-md text-slate-300 hover:bg-slate-800 cursor-pointer"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selected)}
                        className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                )}

                {/* key: hat değişince ya da bilgisi dışarıdan değişince (geri al, renklendir) form tazelenir */}
                <RouteInfoForm
                  key={`${formResetKey}:${JSON.stringify(selected)}`}
                  mode="edit"
                  routeId={selected.routeId}
                  initial={toInput(selected)}
                  onCancel={() => setFormResetKey((k) => k + 1)}
                  onSubmit={(input) => handleUpdate(selected, input)}
                />
              </>
            ) : (
              <div className="mt-24 flex flex-col items-center gap-2 text-center text-slate-500">
                <Tags className="w-10 h-10 stroke-1 text-slate-600" />
                <p className="text-sm text-slate-400">Soldan bir hat seçin ya da yeni hat ekleyin.</p>
                <p className="text-[13px] max-w-sm">
                  Hat bilgisi değişiklikleri ayrı bir taslakta tutulur; sunucuya "Hat bilgilerini kaydet" ile gider.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

function toInput(route: RouteInfo): RouteInfoInput {
  const { routeId: _routeId, ...input } = route;
  return input;
}
