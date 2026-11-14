import type L from 'leaflet';
import { MAP_PANES } from './mapPanes';

export const PUBLISHED_LINE_STYLE: L.PolylineOptions = {
  // Tüm hatlarda aynı renk (hat rengine göre değişmez); taslak çizgisinin altından seçilebilsin diye kalın
  color: '#475569', // Slate 600
  weight: 6,
  opacity: 0.85,
  dashArray: '12, 10',
  pane: MAP_PANES.PUBLISHED_LINE,
  interactive: false,
};

export const DRAFT_LINE_STYLE: L.PolylineOptions = {
  color: '#3b82f6', // Blue 500 (yerine hattın rengi kullanılır)
  weight: 9,
  opacity: 1,
  pane: MAP_PANES.DRAFT_LINE,
  interactive: true,
};

// Hat kenarlığı: birleşik hat tek kenarlık olarak çizginin altına çizilir. İnce ve hattın renginin koyu tonudur
// (renk hook'ta verilir). Tam opaktır: üst katmanla kesiştiği yerlerde koyulaşma olmaz.
export const DRAFT_LINE_CASING_STYLE: L.PolylineOptions = {
  color: '#1e293b', // Slate 800 (yerine hattın renginin koyu tonu kullanılır)
  weight: 15,
  opacity: 1,
  pane: MAP_PANES.DRAFT_LINE,
  interactive: false,
};

// Rotanın kendi üstünden yeniden geçtiği kısmın üst katmanı: uçları düz kesilir, böylece kendi bandının üstünde
// iz bırakmaz; yalnızca ortak yola giriş/çıkışta diğer bandın üstünden geçen kenarlığı görünür.
export const DRAFT_LINE_OVERLAP_CASING_STYLE: L.PolylineOptions = {
  ...DRAFT_LINE_CASING_STYLE,
  lineCap: 'butt',
};

// Üzerine gelinen bacağın parlaması: hattın üstüne beyaz, ince çizgi; opaklığı CSS ile yanıp söner
// (.transit-leg-flash). Taban hat tek parça kalır, yalnızca o bacak açık-koyu yanıp söner.
export const DRAFT_LINE_FLASH_STYLE: L.PolylineOptions = {
  color: '#ffffff',
  opacity: 1,
  pane: MAP_PANES.DRAFT_LINE,
  interactive: false,
  className: 'transit-leg-flash',
};

/** Hat çizgisi kalınlıkları bu zoom ve altında en ince, `ROUTE_WIDTH_MAX_ZOOM` ve üstünde en kalındır. */
const ROUTE_WIDTH_MIN_ZOOM = 12;
const ROUTE_WIDTH_MAX_ZOOM = 16;

export interface RouteLineWidths {
  /** Taslak bacak çizgisi */
  line: number;
  /** Taslak bacak kenarlığı (çizginin her yanında ~2 px) */
  casing: number;
  /** Üzerine gelinen bacağın beyaz parlama çizgisi (çizgiden ince) */
  flash: number;
  /** Saydam yakalama çizgisi (kenarlıktan geniş; uzakta da tutulabilir kalır) */
  hit: number;
  /** Rota hesaplanırken / bacaklar tutarsızken gösterilen kesikli geçici çizgi */
  pending: number;
  /** Yayındaki kesikli çizgi ve kesik deseni (kalınlıkla orantılı) */
  published: number;
  publishedDash: string;
}

/**
 * Zoom'a göre çizgi kalınlıkları: uzakta ince (yol ve durak pinleri okunur), yakında kalın; arası doğrusal.
 * Kesirli zoom desteklenir.
 */
export function routeLineWidths(zoom: number): RouteLineWidths {
  const t = Math.min(1, Math.max(0, (zoom - ROUTE_WIDTH_MIN_ZOOM) / (ROUTE_WIDTH_MAX_ZOOM - ROUTE_WIDTH_MIN_ZOOM)));
  const lerp = (min: number, max: number) => Math.round((min + (max - min) * t) * 10) / 10;
  const casing = lerp(6, 13);
  const published = lerp(3, 6);
  return {
    line: lerp(4, 9),
    casing,
    flash: lerp(2, 4),
    hit: Math.max(casing + 3, 14),
    pending: lerp(3, 5),
    published,
    publishedDash: `${Math.round(published * 2)}, ${Math.round(published * 1.7)}`,
  };
}

// Bacak başına saydam, kalın yakalama çizgisi (olayları bu yakalar; görünür çizgi etkileşimsizdir)
export const DRAFT_LINE_HIT_STYLE: L.PolylineOptions = {
  color: '#000000',
  weight: 18, // zoom'a göre `routeLineWidths().hit` ile değişir
  opacity: 0,
  pane: MAP_PANES.DRAFT_LINE,
  interactive: true,
};

// Fark baloncuğu: taslak yayındakine göre arttıysa kırmızı, azaldıysa yeşil
export const DIFF_INCREASE_COLOR = '#ef4444'; // Red 500
export const DIFF_DECREASE_COLOR = '#22c55e'; // Green 500

export const CITY_STOP_CANVAS_STYLE: L.CircleMarkerOptions = {
  opacity: 1, // Açıkça verilir: sürüklemede gizlenen nokta setStyle ile bu stile geri döner
  radius: 4,
  color: '#334155', // Slate 700
  fillColor: '#94a3b8', // Slate 400
  fillOpacity: 0.7,
  weight: 1.5,
  pane: MAP_PANES.CITY_STOPS,
};

export const TERMINAL_STOP_CANVAS_STYLE: L.CircleMarkerOptions = {
  opacity: 1, // Açıkça verilir: sürüklemede gizlenen nokta setStyle ile bu stile geri döner
  radius: 6,
  color: '#78350f', // Amber 900
  fillColor: '#f59e0b', // Amber 500
  fillOpacity: 0.9,
  weight: 2,
  pane: MAP_PANES.CITY_STOPS,
};

export const MOVED_STOP_CANVAS_STYLE: L.CircleMarkerOptions = {
  opacity: 1, // Açıkça verilir: sürüklemede gizlenen nokta setStyle ile bu stile geri döner
  radius: 6,
  color: '#1d4ed8', // Blue 700
  fillColor: '#3b82f6', // Blue 500
  fillOpacity: 0.95,
  weight: 2,
  pane: MAP_PANES.CITY_STOPS,
};

// Yayında olmayan, haritadan eklenmiş yeni durak (taslakta)
export const NEW_STOP_CANVAS_STYLE: L.CircleMarkerOptions = {
  opacity: 1,
  radius: 6,
  color: '#15803d', // Green 700
  fillColor: '#22c55e', // Green 500
  fillOpacity: 0.95,
  weight: 2,
  pane: MAP_PANES.CITY_STOPS,
};

export const PUBLISHED_GHOST_STOP_STYLE: L.CircleMarkerOptions = {
  radius: 6,
  color: '#94a3b8', // Slate 400
  fillColor: '#cbd5e1', // Slate 300
  fillOpacity: 0.2,
  weight: 2,
  dashArray: '3, 3',
  pane: MAP_PANES.PUBLISHED_STOPS,
};
