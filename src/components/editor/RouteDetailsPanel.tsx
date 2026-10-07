import React, { useState } from 'react';
import {
  Navigation,
  MapPin,
  RefreshCw,
  Sparkles,
  Loader2,
  Route as RouteIcon,
  Plus,
  X,
  Palette,
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

const COLOR_PRESETS = [
  '#2563eb', // Mavi
  '#10b981', // Zümrüt Yeşili
  '#ef4444', // Kırmızı
  '#f59e0b', // Kehribar Sarısı
  '#8b5cf6', // Mor
  '#ec4899', // Pembe
  '#06b6d4', // Camgöbeği
  '#059669', // Koyu Yeşil
  '#d97706', // Turuncu
];

export const RouteDetailsPanel: React.FC = () => {
  const {
    routes,
    selectedRouteId,
    selectRoute,
    createNewRoute,
    isLoadingRoutes,
    isLoadingRouteDetail,
    route,
    liveShapes,
    draftShapes,
    draftStops,
    viaPoints,
    activeTool,
    setActiveTool,
    routingMode,
    setRoutingMode,
    isRouting,
    syncRouteFromStops,
    updateDraftShapes,
  } = useWorkspaceStore();



  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newShortName, setNewShortName] = useState('');
  const [newLongName, setNewLongName] = useState('');
  const [newColor, setNewColor] = useState('#2563eb');
  const [newAgency, setNewAgency] = useState('EBB');

  const liveDistanceKm =
    liveShapes.length > 0 ? (liveShapes[liveShapes.length - 1].distTraveled / 1000).toFixed(2) : '0';
  const draftDistanceKm =
    draftShapes.length > 0 ? (draftShapes[draftShapes.length - 1].distTraveled / 1000).toFixed(2) : '0';
  const distanceDelta = (Number(draftDistanceKm) - Number(liveDistanceKm)).toFixed(2);

  const resetToLive = () => {
    if (window.confirm('Taslak güzergahı canlıdaki orijinal haline sıfırlamak istediğinize emin misiniz?')) {
      updateDraftShapes([...liveShapes]);
    }
  };

  const handleCreateRouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortName.trim() || !newLongName.trim()) return;

    await createNewRoute({
      routeShortName: newShortName.trim(),
      routeLongName: newLongName.trim(),
      routeColor: newColor,
      routeTextColor: '#ffffff',
      agencyId: newAgency,
    });

    setCreateModalOpen(false);
    setNewShortName('');
    setNewLongName('');
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 p-3.5 space-y-3 shrink-0">
      {/* Hat Seçimi ve Yeni Hat Butonu */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <RouteIcon className="w-3 h-3 text-blue-400" />
            <span>Aktif Hat ({routes.length})</span>
          </label>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/25 hover:bg-blue-600/40 text-blue-400 border border-blue-500/40 rounded text-[11px] font-bold transition cursor-pointer shadow-sm"
            title="Sıfırdan Yeni Hat Tanımla ve Çiz"
          >
            <Plus className="w-3 h-3" />
            <span>+ Yeni Hat</span>
          </button>
        </div>

        <select
          value={selectedRouteId || ''}
          onChange={(e) => selectRoute(e.target.value)}
          disabled={isLoadingRoutes || routes.length === 0}
          className="w-full bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg px-2.5 py-2 border border-slate-700 hover:border-slate-600 focus:outline-none focus:border-blue-500 cursor-pointer transition disabled:opacity-50"
        >
          {routes.length === 0 ? (
            <option value="">Hatlar yükleniyor...</option>
          ) : (
            routes.map((r) => (
              <option key={r.routeId} value={r.routeId}>
                {r.routeShortName} - {r.routeLongName}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Yükleniyor Göstergesi */}
      {isLoadingRouteDetail ? (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span>Hat detayları ve duraklar yükleniyor...</span>
        </div>
      ) : route ? (
        <>
          {/* Hat Kimliği */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm shadow-sm shrink-0"
                style={{ backgroundColor: route.routeColor, color: route.routeTextColor }}
              >
                {route.routeShortName}
              </div>
              <div className="min-w-0">
                <h2 className="text-white text-xs font-bold leading-tight truncate max-w-[190px]">
                  {route.routeLongName}
                </h2>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span>{route.agencyId}</span>
                  <span>•</span>
                  <span className="text-blue-400 font-semibold">{draftShapes.length} Shape Noktası</span>
                </div>
              </div>
            </div>

            {/* Tam Tur Güzergah Rozeti (SSoT: Yapay Gidiş/Dönüş Ayrımı Bulunmaz) */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 text-slate-300 rounded-md text-[11px] font-semibold border border-slate-700 shrink-0"
              title="Bu hat 1. duraktan son durağa kadar tekil sıralı tam tur (ring) güzergahıdır"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Tam Tur (1..{draftStops.length})</span>
            </div>
          </div>

          {/* Yeni Hat Başlatma İpucu (Durak henüz yoksa) */}
          {draftStops.length === 0 && (
            <div className="p-2.5 bg-blue-950/40 border border-blue-800/60 rounded-lg text-blue-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-blue-300">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Yeni Hat Çizimi Aktif</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Haritada 1. başlangıç durağının yerine tıklayın. Sonraki duraklara tıkladıkça OSRM cadde güzergahını (shape) otomatik çizecektir.
              </p>
            </div>
          )}

          {/* Görsel Fark ve İstatistik Kartı */}
          <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] block">Mesafe (Taslak / Canlı)</span>
              <div className="font-bold text-slate-200 mt-0.5 flex items-baseline gap-1">
                <span>{draftDistanceKm} km</span>
                {liveShapes.length > 0 && Number(distanceDelta) !== 0 && (
                  <span
                    className={`text-[10px] font-semibold ${
                      Number(distanceDelta) > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    ({Number(distanceDelta) > 0 ? `+${distanceDelta}` : distanceDelta} km)
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-slate-400 text-[10px] block">Durak & Kilit</span>
              <div className="font-bold text-slate-200 mt-0.5 flex items-baseline gap-1">
                <span>{draftStops.length} Durak</span>
                {viaPoints.length > 0 && (
                  <span className="text-[10px] text-amber-400 font-semibold">
                    (+{viaPoints.length} Via)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* OSRM Durum Bildirimi */}
          {isRouting && (
            <div className="flex items-center justify-center gap-2 p-2 bg-blue-950/50 border border-blue-800/60 rounded-lg text-blue-300 text-xs font-medium animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span>OSRM güzergahı sokaklara otomatik oturtuyor...</span>
            </div>
          )}

          {/* GIS Araç Çubuğu */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">
                Harita Eylemi
              </span>
              {draftStops.length >= 2 && (
                <button
                  onClick={() => syncRouteFromStops(draftStops)}
                  disabled={isRouting}
                  className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer hover:underline disabled:opacity-50"
                  title="Mevcut durakların üzerinden OSRM ile rotayı baştan oturt"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Rotayı Yeniden Oturt</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTool('pan')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                  activeTool === 'pan'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Haritada gezin ve çizgiyi sürükleyerek düzenle"
              >
                <Navigation className="w-4 h-4" />
                <span>Gezin / Düzenle</span>
              </button>

              <button
                onClick={() => setActiveTool('add_stop')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                  activeTool === 'add_stop'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Haritaya tıklayarak yeni yolcu durağı ekle"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>+ Durak Ekle</span>
              </button>
            </div>

            {/* Çizim / Düzenleme Modu Seçici (Otomatik OSRM vs Manuel Serbest) */}
            <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 space-y-1.5 mt-2">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">
                Güzergah Çizim Yöntemi
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setRoutingMode('auto')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-semibold transition cursor-pointer border ${
                    routingMode === 'auto'
                      ? 'bg-blue-600/30 text-blue-300 border-blue-500 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="OSRM ile yola otomatik oturtma. Sadece is_via_point=true olan kilit noktalar gösterilir."
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Otomatik (OSRM)</span>
                </button>

                <button
                  onClick={() => setRoutingMode('manual')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-semibold transition cursor-pointer border ${
                    routingMode === 'manual'
                      ? 'bg-amber-600/30 text-amber-300 border-amber-500 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Serbest / nokta bazlı manuel Geoman çizimi."
                >
                  <Navigation className="w-3.5 h-3.5 text-amber-400" />
                  <span>Manuel Çizim</span>
                </button>
              </div>
            </div>
          </div>



          {/* Hızlı Eylemler & Katman Bilgisi */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              {liveShapes.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-1 bg-red-500 rounded inline-block" />
                  <span>Canlı</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-1 bg-blue-500 rounded inline-block" />
                <span>Taslak</span>
              </span>
            </div>

            {liveShapes.length > 0 && (
              <button
                onClick={resetToLive}
                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 hover:underline cursor-pointer"
                title="Tüm düzenlemeleri sıfırla"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sıfırla</span>
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-6 text-slate-500 text-xs">
          Lütfen listeden bir hat seçin veya yeni hat oluşturun.
        </div>
      )}

      {/* Yeni Hat Oluşturma Modalı */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRouteSubmit}
            className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-sm w-full shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm"
                  style={{ backgroundColor: newColor }}
                >
                  {newShortName.toUpperCase() || 'H1'}
                </div>
                <h3 className="font-bold text-white text-sm">Yeni Hat Tanımla</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-slate-300 text-xs font-semibold block mb-1">
                Hat Kodu (Kısa Ad) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="Örn: K2, B4, M1"
                value={newShortName}
                onChange={(e) => setNewShortName(e.target.value.toUpperCase())}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-blue-500 uppercase"
              />
            </div>

            <div>
              <label className="text-slate-300 text-xs font-semibold block mb-1">
                Hat Adı / Güzergah <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Örn: Hilalkent - Şehir Hastanesi - Üniversite"
                value={newLongName}
                onChange={(e) => setNewLongName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-300 text-xs font-semibold flex items-center gap-1 mb-2">
                <Palette className="w-3.5 h-3.5 text-blue-400" />
                <span>Hat Rengi</span>
              </label>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full cursor-pointer transition ${
                      newColor === color ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer p-0.5"
                  title="Özel Renk Seç"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 text-xs font-semibold block mb-1">Kurum / Agency</label>
              <input
                type="text"
                value={newAgency}
                onChange={(e) => setNewAgency(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-xs focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs rounded-lg cursor-pointer"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow-md"
              >
                Hattı Oluştur & Çizmeye Başla
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
