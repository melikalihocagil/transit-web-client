import L from 'leaflet';
import {
  leafletLayer,
  exp,
  LineSymbolizer,
  PolygonSymbolizer,
  LineLabelSymbolizer,
  CenteredTextSymbolizer,
  type PaintRule,
  type LabelRule,
  type Feature,
} from 'protomaps-leaflet';
import { ESRI_LIGHT_GRAY_TILE } from './mapConfig';

/**
 * Yerel OSM altlığı: OSRM ile aynı kaynaktan (`erzurum.osm.pbf`) üretilen `public/tiles/erzurum.pmtiles`.
 * Altlık ve rota aynı yol ağını gösterdiği için OSRM çizgisi haritayla uyuşur. Dosya `scripts/rebuild-map.ps1`
 * ile yeniden üretilir (OpenMapTiles şeması, tilemaker). Dosya yoksa Esri gri altlığa düşülür.
 */
export const LOCAL_BASEMAP_URL = '/tiles/erzurum.pmtiles';

/** Karolar z14'e kadar üretilir; daha yakın seviyelerde vektör istemcide keskin biçimde büyütülür. */
const MAX_DATA_ZOOM = 14;

const COLORS = {
  background: '#f2f2f0',
  landcover: '#e6ebe1',
  park: '#e2e9dc',
  residential: '#efefec',
  institution: '#ece8ea',
  water: '#cdd9e0',
  building: '#e3e1dd',
  buildingStroke: '#d5d2cd',
  roadCasing: '#d3d3cf',
  majorCasing: '#c3c3be',
  road: '#ffffff',
  path: '#d6d6d2',
  rail: '#c9c9c9',
  label: '#8b9097',
  placeLabel: '#6b7179',
  halo: '#ffffff',
} as const;

const cls = (f?: Feature): string => String(f?.props.class ?? '');
const isClass = (...classes: string[]) => (_z: number, f: Feature) => classes.includes(cls(f));

const MAJOR = ['motorway', 'trunk', 'primary'];
const MEDIUM = ['secondary', 'tertiary'];
const MINOR = ['minor', 'service', 'track'];

/** Yol genişliği (piksel): yakınlaştıkça üstel büyür. */
const roadWidth = (base: number) =>
  exp(1.55, [
    [10, base * 0.4],
    [14, base * 1.6],
    [18, base * 9],
  ]);

const paintRules: PaintRule[] = [
  { dataLayer: 'landcover', symbolizer: new PolygonSymbolizer({ fill: COLORS.landcover }) },
  { dataLayer: 'park', symbolizer: new PolygonSymbolizer({ fill: COLORS.park }) },
  {
    dataLayer: 'landuse',
    symbolizer: new PolygonSymbolizer({
      fill: (_z, f) =>
        ['residential', 'suburb', 'neighbourhood'].includes(cls(f)) ? COLORS.residential : COLORS.institution,
    }),
  },
  { dataLayer: 'water', symbolizer: new PolygonSymbolizer({ fill: COLORS.water }) },
  { dataLayer: 'waterway', symbolizer: new LineSymbolizer({ color: COLORS.water, width: 1.5 }) },
  {
    dataLayer: 'building',
    minzoom: 14,
    symbolizer: new PolygonSymbolizer({ fill: COLORS.building, stroke: COLORS.buildingStroke, width: 0.5 }),
  },

  // Yollar: önce kenar çizgileri (casing), sonra dolgular; büyük yollar en üstte
  {
    dataLayer: 'transportation',
    minzoom: 14,
    filter: isClass(...MINOR),
    symbolizer: new LineSymbolizer({ color: COLORS.roadCasing, width: roadWidth(1.2), lineCap: 'round' }),
  },
  {
    dataLayer: 'transportation',
    filter: isClass(...MEDIUM),
    symbolizer: new LineSymbolizer({ color: COLORS.roadCasing, width: roadWidth(2), lineCap: 'round' }),
  },
  {
    dataLayer: 'transportation',
    filter: isClass(...MAJOR),
    symbolizer: new LineSymbolizer({ color: COLORS.majorCasing, width: roadWidth(2.6), lineCap: 'round' }),
  },
  {
    dataLayer: 'transportation',
    filter: isClass('path'),
    minzoom: 15,
    symbolizer: new LineSymbolizer({ color: COLORS.path, width: 1, dash: [3, 2] }),
  },
  {
    dataLayer: 'transportation',
    filter: isClass('rail', 'transit'),
    symbolizer: new LineSymbolizer({ color: COLORS.rail, width: 1.5, dash: [6, 3] }),
  },
  {
    dataLayer: 'transportation',
    minzoom: 13,
    filter: isClass(...MINOR),
    symbolizer: new LineSymbolizer({
      color: (z) => (z < 14 ? COLORS.roadCasing : COLORS.road),
      width: (z) => (z < 14 ? 0.6 : roadWidth(0.9)(z)),
      lineCap: 'round',
    }),
  },
  {
    dataLayer: 'transportation',
    filter: isClass(...MEDIUM),
    symbolizer: new LineSymbolizer({ color: COLORS.road, width: roadWidth(1.5), lineCap: 'round' }),
  },
  {
    dataLayer: 'transportation',
    filter: isClass(...MAJOR),
    symbolizer: new LineSymbolizer({ color: COLORS.road, width: roadWidth(2), lineCap: 'round' }),
  },
];

// Etiketler soluk: durak ve hat katmanlarının önüne geçmemesi için açık gri, ince beyaz hale
const labelRules: LabelRule[] = [
  {
    dataLayer: 'place',
    filter: isClass('city', 'town'),
    symbolizer: new CenteredTextSymbolizer({
      fill: COLORS.placeLabel,
      stroke: COLORS.halo,
      width: 2,
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: 600,
    }),
  },
  {
    dataLayer: 'place',
    minzoom: 12,
    filter: isClass('suburb', 'neighbourhood', 'quarter', 'village'),
    symbolizer: new CenteredTextSymbolizer({
      fill: COLORS.placeLabel,
      stroke: COLORS.halo,
      width: 2,
      fontFamily: 'sans-serif',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
    }),
  },
  {
    dataLayer: 'transportation_name',
    minzoom: 14,
    symbolizer: new LineLabelSymbolizer({
      fill: COLORS.label,
      stroke: COLORS.halo,
      width: 2,
      fontFamily: 'sans-serif',
      fontSize: 10,
    }),
  },
  {
    dataLayer: 'water_name',
    minzoom: 13,
    symbolizer: new CenteredTextSymbolizer({
      fill: '#7d95a3',
      stroke: COLORS.halo,
      width: 2,
      fontFamily: 'sans-serif',
      fontSize: 10,
      fontStyle: 'italic',
    }),
  },
];

function createLocalBasemap(): L.Layer {
  return leafletLayer({
    url: LOCAL_BASEMAP_URL,
    paintRules,
    labelRules,
    backgroundColor: COLORS.background,
    maxDataZoom: MAX_DATA_ZOOM,
    maxZoom: ESRI_LIGHT_GRAY_TILE.maxZoom,
    attribution: '&copy; OpenStreetMap katkıcıları',
  }) as unknown as L.Layer;
}

function createEsriBasemap(): L.TileLayer {
  return L.tileLayer(ESRI_LIGHT_GRAY_TILE.url, {
    attribution: ESRI_LIGHT_GRAY_TILE.attribution,
    maxZoom: ESRI_LIGHT_GRAY_TILE.maxZoom,
    maxNativeZoom: ESRI_LIGHT_GRAY_TILE.maxNativeZoom,
  });
}

/** Yerel altlık dosyası sunuluyor mu (Vite bulunamayan dosya için index.html döndürebilir; içerik türü kontrol edilir). */
async function hasLocalBasemap(): Promise<boolean> {
  try {
    const res = await fetch(LOCAL_BASEMAP_URL, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    return res.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

// ---- Etkin altlığın adı (alt çubukta gösterilir) ----
const LOCAL_LABEL = 'Erzurum OSM (OSRM ile aynı veri)';
const ESRI_LABEL = 'Esri Gri (eski)';

let activeLabel = '';
const labelListeners = new Set<() => void>();
function setActiveLabel(label: string): void {
  activeLabel = label;
  labelListeners.forEach((l) => l());
}

/** `useSyncExternalStore` ile etkin altlığın adını okumak için. */
export const basemapLabelStore = {
  subscribe: (listener: () => void) => {
    labelListeners.add(listener);
    return () => labelListeners.delete(listener);
  },
  getSnapshot: () => activeLabel,
};

/**
 * Altlığı haritaya ekler: yerel OSM altlığı varsa o, yoksa Esri. Sağ altta altlık seçici bulunur
 * (OSRM çizgisini eski Esri altlığıyla karşılaştırmak için). Temizlik fonksiyonu döner.
 */
export function addBasemap(map: L.Map): () => void {
  let disposed = false;
  let control: L.Control.Layers | null = null;
  const esri = createEsriBasemap();
  const handleBaseLayerChange = (e: L.LayersControlEvent) => setActiveLabel(e.name);
  map.on('baselayerchange', handleBaseLayerChange);

  void hasLocalBasemap().then((available) => {
    if (disposed) return;
    if (!available) {
      esri.addTo(map);
      setActiveLabel(ESRI_LABEL);
      return;
    }
    const local = createLocalBasemap();
    local.addTo(map);
    setActiveLabel(LOCAL_LABEL);
    control = L.control
      .layers({ [LOCAL_LABEL]: local, [ESRI_LABEL]: esri }, undefined, {
        position: 'bottomright',
        collapsed: true,
      })
      .addTo(map);
  });

  return () => {
    disposed = true;
    map.off('baselayerchange', handleBaseLayerChange);
    control?.remove();
  };
}
