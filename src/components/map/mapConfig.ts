export interface BaseTileConfig {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
}

/**
 * CartoDB "API KEY REQUIRED" kısıtlamasına takılmayan,
 * API anahtarı gerektirmeyen kurumsal gri altlık (Esri World Light Gray Canvas).
 *
 * Zoom Mimarisi:
 * Esri sunucusu karoları (tiles) sunucu tarafında z=16'ya kadar üretmektedir (maxNativeZoom: 16).
 * Leaflet'in overscaling yeteneği ile istemci tarafında z=22'ye kadar ultra derin yakınlaştırma sağlanır.
 * Böylece kırık/404 karo hatası yaşanmadan kaldırım, şerit ve durak cebi ölçeğinde santimetrik GIS hassasiyeti elde edilir.
 */
export const ESRI_LIGHT_GRAY_TILE: BaseTileConfig = {
  id: 'esri-light-gray',
  label: 'Gri Altlık (Esri)',
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
  maxZoom: 22,
  maxNativeZoom: 16,
};

export const DEFAULT_MAP_CENTER = {
  lat: 39.9055,
  lng: 41.2658,
};

export const DEFAULT_MAP_ZOOM = 13;
