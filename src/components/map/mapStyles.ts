import type L from 'leaflet';
import { MAP_PANES } from './mapPanes';

export const PUBLISHED_LINE_STYLE: L.PolylineOptions = {
  color: '#64748b', // Slate 500
  weight: 3,
  opacity: 0.75,
  dashArray: '6, 8',
  pane: MAP_PANES.PUBLISHED_LINE,
  interactive: false,
};

export const DRAFT_LINE_STYLE: L.PolylineOptions = {
  color: '#3b82f6', // Blue 500
  weight: 5,
  opacity: 0.95,
  pane: MAP_PANES.DRAFT_LINE,
  interactive: true,
};

// Üzerine gelinen bacağın vurgusu (görünür çizgiye setStyle ile uygulanır)
export const DRAFT_LINE_HOVER_STYLE: L.PathOptions = {
  color: '#60a5fa', // Blue 400
  weight: 7,
  opacity: 1,
};

// Bacak başına saydam, kalın yakalama çizgisi (olayları bu yakalar; görünür çizgi etkileşimsizdir)
export const DRAFT_LINE_HIT_STYLE: L.PolylineOptions = {
  color: '#000000',
  weight: 16,
  opacity: 0,
  pane: MAP_PANES.DRAFT_LINE,
  interactive: true,
};

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

export const PUBLISHED_GHOST_STOP_STYLE: L.CircleMarkerOptions = {
  radius: 6,
  color: '#94a3b8', // Slate 400
  fillColor: '#cbd5e1', // Slate 300
  fillOpacity: 0.2,
  weight: 2,
  dashArray: '3, 3',
  pane: MAP_PANES.PUBLISHED_STOPS,
};
