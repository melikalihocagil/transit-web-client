import type L from 'leaflet';

export const MAP_PANES = {
  PUBLISHED_LINE: 'published-line-pane',
  CITY_STOPS: 'city-stops-pane',
  PUBLISHED_STOPS: 'published-stops-pane',
  DRAFT_LINE: 'draft-line-pane',
  DRAFT_STOPS: 'draft-stops-pane',
  DRAFT_VIAS: 'draft-vias-pane',
} as const;

/**
 * Leaflet özel katman düzlemlerini (Custom Panes) hiyerarşik Z-Index sırasıyla başlatır:
 *
 * 1. published-line-pane  (Z: 410) -> Dokunulmaz kesikli referans çizgisi
 * 2. city-stops-pane      (Z: 420) -> 738 şehir durağı genel zemin canvas katmanı
 * 3. published-stops-pane (Z: 430) -> Dokunulmaz hayalet (ghost) durak halkaları (pointer-events: none)
 * 4. draft-line-pane      (Z: 440) -> Canlı, tıklanabilir SVG çalışma çizgisi
 * 5. draft-stops-pane     (Z: 450) -> Sürüklenebilir aktif durak pinleri
 * 6. draft-vias-pane      (Z: 460) -> Sürüklenebilir ara kılavuz tutamaçları
 */
export function initializeMapPanes(map: L.Map): void {
  if (!map.getPane(MAP_PANES.PUBLISHED_LINE)) {
    const pane = map.createPane(MAP_PANES.PUBLISHED_LINE);
    pane.style.zIndex = '410';
  }

  if (!map.getPane(MAP_PANES.CITY_STOPS)) {
    const pane = map.createPane(MAP_PANES.CITY_STOPS);
    pane.style.zIndex = '420';
  }

  // Hayalet düzlemi tıklamaya kapalıdır: canvas'ı tüm görünümü kaplar ve
  // alttaki durak canvas'ına giden tıklamaları yutmamalıdır.
  const publishedStopsPane =
    map.getPane(MAP_PANES.PUBLISHED_STOPS) ?? map.createPane(MAP_PANES.PUBLISHED_STOPS);
  publishedStopsPane.style.zIndex = '430';
  publishedStopsPane.style.pointerEvents = 'none';

  if (!map.getPane(MAP_PANES.DRAFT_LINE)) {
    const pane = map.createPane(MAP_PANES.DRAFT_LINE);
    pane.style.zIndex = '440';
  }

  if (!map.getPane(MAP_PANES.DRAFT_STOPS)) {
    const pane = map.createPane(MAP_PANES.DRAFT_STOPS);
    pane.style.zIndex = '450';
  }

  if (!map.getPane(MAP_PANES.DRAFT_VIAS)) {
    const pane = map.createPane(MAP_PANES.DRAFT_VIAS);
    pane.style.zIndex = '460';
  }
}
