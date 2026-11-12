import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useStopDraftStore, selectEffectiveStops } from '../../store';
import { MAP_PANES } from './mapPanes';
import {
  CITY_STOP_CANVAS_STYLE,
  TERMINAL_STOP_CANVAS_STYLE,
  MOVED_STOP_CANVAS_STYLE,
  PUBLISHED_GHOST_STOP_STYLE,
} from './mapStyles';
import { createCityStopIcon } from './markerFactory';
import { isDeletedStop, isTerminalStop, type Stop } from '../../model';

type StopStyleKey = 'normal' | 'terminal' | 'moved';

const STYLES: Record<StopStyleKey, L.CircleMarkerOptions> = {
  normal: CITY_STOP_CANVAS_STYLE,
  terminal: TERMINAL_STOP_CANVAS_STYLE,
  moved: MOVED_STOP_CANVAS_STYLE,
};

interface StopMarkerOptions extends L.CircleMarkerOptions {
  stopId: string;
}

interface MarkerEntry {
  marker: L.CircleMarker;
  stop: Stop;
  styleKey: StopStyleKey;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isMovedFromPublished(stop: Stop, published: Stop | undefined): boolean {
  return published !== undefined && (published.lat !== stop.lat || published.lon !== stop.lon);
}

function stopIdOf(layer: L.Layer): string {
  return (layer.options as StopMarkerOptions).stopId;
}

/**
 * Şehirdeki tüm durakları canvas üzerinde çizer.
 *
 * - Tek bir canvas renderer kullanılır; tüm durak marker'ları onu paylaşır.
 * - Marker'lar stopId ile tutulur; değişiklikte sadece farklı olan duraklar güncellenir.
 * - Tooltip ve click tek bir grup seviyesinde yönetilir (durak başına dinleyici yok).
 * - Durağa tıklanınca o durak için tek bir sürüklenebilir tutamaç açılır; bırakınca store'a yazılır.
 * - Draft'ta taşınan ya da silinen published duraklar için orijinal konumda etkileşimsiz
 *   hayalet halka çizilir (ayrı canvas, tıklamaya kapalı düzlemde).
 */
export function useStopsMapSync(map: L.Map | null): void {
  const published = useStopDraftStore((state) => state.published);
  const draft = useStopDraftStore((state) => state.draft);
  const effectiveStops = useStopDraftStore(selectEffectiveStops);

  const stopsGroupRef = useRef<L.FeatureGroup | null>(null);
  const ghostsGroupRef = useRef<L.FeatureGroup | null>(null);
  const stopsRendererRef = useRef<L.Canvas | null>(null);
  const ghostsRendererRef = useRef<L.Canvas | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const ghostsRef = useRef(new Map<string, L.CircleMarker>());
  const dragHandleRef = useRef<L.Marker | null>(null);

  // 1. Duraklar henüz yüklenmediyse sunucudan çek
  useEffect(() => {
    if (Object.keys(useStopDraftStore.getState().published).length === 0) {
      void useStopDraftStore.getState().loadStops();
    }
  }, []);

  // 2. Katmanlar, renderer'lar ve olay dinleyicileri: harita başına bir kez
  useEffect(() => {
    if (!map) return;

    const markers = markersRef.current;
    const ghosts = ghostsRef.current;

    const stopsRenderer = L.canvas({ pane: MAP_PANES.CITY_STOPS });
    const ghostsRenderer = L.canvas({ pane: MAP_PANES.PUBLISHED_STOPS });
    const stopsGroup = L.featureGroup().addTo(map);
    const ghostsGroup = L.featureGroup().addTo(map);

    stopsRendererRef.current = stopsRenderer;
    ghostsRendererRef.current = ghostsRenderer;
    stopsGroupRef.current = stopsGroup;
    ghostsGroupRef.current = ghostsGroup;

    const removeDragHandle = () => {
      dragHandleRef.current?.remove();
      dragHandleRef.current = null;
    };

    // Tek paylaşımlı tooltip: içerik, üzerine gelinen marker'ın durağından üretilir
    stopsGroup.bindTooltip(
      (layer) => {
        const entry = markers.get(stopIdOf(layer as L.Layer));
        if (!entry) return '';
        const { stop, styleKey } = entry;
        return `<div style="font-family: sans-serif; font-size: 11px;">
          <strong style="color: #3b82f6;">${escapeHtml(stop.stopId)}</strong> - ${escapeHtml(stop.stopName)}
          ${styleKey === 'moved' ? '<span style="color: #f59e0b; font-weight: 600;"> (Taşındı)</span>' : ''}
          <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">Taşımak için tıklayın</div>
        </div>`;
      },
      { direction: 'top', offset: [0, -6] }
    );

    // Tek click dinleyicisi: tıklanan durak için sürüklenebilir tutamaç aç
    const handleStopClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      const entry = markers.get(stopIdOf(e.propagatedFrom as L.Layer));
      if (!entry) return;
      removeDragHandle();

      const { stop } = entry;
      const handle = L.marker([stop.lat, stop.lon], {
        icon: createCityStopIcon(isTerminalStop(stop), true),
        pane: MAP_PANES.DRAFT_STOPS,
        draggable: true,
      }).addTo(map);

      handle
        .bindTooltip(
          `<div style="font-family: sans-serif; font-size: 11px;">
            <strong style="color: #3b82f6;">${escapeHtml(stop.stopId)}</strong> - ${escapeHtml(stop.stopName)}
            <div style="color: #22c55e; font-size: 10px; font-weight: 600;">Yeni konuma sürükleyin</div>
          </div>`,
          { direction: 'top', offset: [0, -10] }
        )
        .openTooltip();

      handle.on('dragend', () => {
        const { lat, lng } = handle.getLatLng();
        removeDragHandle();
        useStopDraftStore.getState().moveStop(stop.stopId, lat, lng);
      });

      dragHandleRef.current = handle;
    };

    stopsGroup.on('click', handleStopClick);
    map.on('click', removeDragHandle);

    return () => {
      map.off('click', removeDragHandle);
      removeDragHandle();
      stopsGroup.remove();
      ghostsGroup.remove();
      stopsRenderer.remove();
      ghostsRenderer.remove();
      markers.clear();
      ghosts.clear();
      stopsGroupRef.current = null;
      ghostsGroupRef.current = null;
      stopsRendererRef.current = null;
      ghostsRendererRef.current = null;
    };
  }, [map]);

  // 3. Artımlı senkronizasyon: sadece değişen marker'lar güncellenir
  useEffect(() => {
    const stopsGroup = stopsGroupRef.current;
    const ghostsGroup = ghostsGroupRef.current;
    const stopsRenderer = stopsRendererRef.current;
    const ghostsRenderer = ghostsRendererRef.current;
    if (!map || !stopsGroup || !ghostsGroup || !stopsRenderer || !ghostsRenderer) return;

    const markers = markersRef.current;
    const ghosts = ghostsRef.current;
    const visibleIds = new Set<string>();

    for (const stop of effectiveStops) {
      visibleIds.add(stop.stopId);
      const original = published[stop.stopId];
      const moved = isMovedFromPublished(stop, original);
      const styleKey: StopStyleKey = moved ? 'moved' : isTerminalStop(stop) ? 'terminal' : 'normal';

      const entry = markers.get(stop.stopId);
      if (!entry) {
        const options: StopMarkerOptions = {
          ...STYLES[styleKey],
          renderer: stopsRenderer,
          interactive: true,
          stopId: stop.stopId,
        };
        const marker = L.circleMarker([stop.lat, stop.lon], options);
        stopsGroup.addLayer(marker);
        markers.set(stop.stopId, { marker, stop, styleKey });
        continue;
      }

      if (entry.stop === stop) continue;
      if (entry.stop.lat !== stop.lat || entry.stop.lon !== stop.lon) {
        entry.marker.setLatLng([stop.lat, stop.lon]);
      }
      if (entry.styleKey !== styleKey) {
        entry.marker.setStyle(STYLES[styleKey]);
        entry.marker.setRadius(STYLES[styleKey].radius ?? 4);
        entry.styleKey = styleKey;
      }
      entry.stop = stop;
    }

    // Artık görünmeyen duraklar (silinen / kaldırılan)
    for (const [stopId, entry] of markers) {
      if (!visibleIds.has(stopId)) {
        stopsGroup.removeLayer(entry.marker);
        markers.delete(stopId);
      }
    }

    // Hayalet halkalar: draft'ta taşınan ya da silinen published durakların orijinal konumunda
    const ghostIds = new Set<string>();
    for (const entry of Object.values(draft)) {
      const original = published[entry.stopId];
      if (!original) continue;
      if (!isDeletedStop(entry) && !isMovedFromPublished(entry, original)) continue;
      ghostIds.add(entry.stopId);

      const ghost = ghosts.get(entry.stopId);
      if (!ghost) {
        const marker = L.circleMarker([original.lat, original.lon], {
          ...PUBLISHED_GHOST_STOP_STYLE,
          renderer: ghostsRenderer,
          interactive: false,
        });
        ghostsGroup.addLayer(marker);
        ghosts.set(entry.stopId, marker);
      } else {
        ghost.setLatLng([original.lat, original.lon]);
      }
    }
    for (const [stopId, ghost] of ghosts) {
      if (!ghostIds.has(stopId)) {
        ghostsGroup.removeLayer(ghost);
        ghosts.delete(stopId);
      }
    }

    // Durak verisi değiştiyse açık tutamaç artık eski konumu gösteriyor olabilir
    dragHandleRef.current?.remove();
    dragHandleRef.current = null;
  }, [map, published, draft, effectiveStops]);
}
