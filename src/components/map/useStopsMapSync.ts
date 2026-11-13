import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useStopDraftStore, useMapHighlightStore, selectEffectiveStops } from '../../store';
import { MAP_PANES } from './mapPanes';
import {
  CITY_STOP_CANVAS_STYLE,
  TERMINAL_STOP_CANVAS_STYLE,
  MOVED_STOP_CANVAS_STYLE,
  PUBLISHED_GHOST_STOP_STYLE,
} from './mapStyles';
import { createBlinkRingIcon, createCityStopIcon } from './markerFactory';
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

/** Hayaletin üzerine gelinmiş sayılması için imlecin merkezine en fazla uzaklığı (piksel). */
const GHOST_HOVER_RADIUS_PX = 9;

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
  /** Sürükleme önizlemesini geri alır (gizlenen noktayı gösterir, geçici hayaleti kaldırır). */
  const endDragPreviewRef = useRef<(() => void) | null>(null);
  /** Hayalet hover'ını (baloncuk + yanıp sönme) kapatır; veri değişince çağrılır. */
  const clearGhostHoverRef = useRef<(() => void) | null>(null);

  /** Açık tutamacı ve varsa sürükleme önizlemesini kaldırır. */
  const removeDragHandle = () => {
    endDragPreviewRef.current?.();
    endDragPreviewRef.current = null;
    dragHandleRef.current?.remove();
    dragHandleRef.current = null;
  };

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

    // ---- Tek baloncuk: durak, tutamaç ve hayalet aynı tooltip'i kullanır; üst üste iki baloncuk olmaz ----
    const tip = L.tooltip({ direction: 'top', offset: [0, -8] });
    let isDragging = false;
    let hoveredGhostId: string | null = null;
    let hoveredStopId: string | null = null;

    const showTip = (latlng: L.LatLngExpression, html: string) => {
      if (isDragging) return;
      tip.setLatLng(latlng).setContent(html);
      if (!map.hasLayer(tip)) tip.addTo(map);
    };
    const hideTip = () => {
      tip.remove();
    };

    // ---- Sürükleme önizlemesi ----
    /**
     * Aynı id'li iki nokta kuralı sürüklemede de geçerlidir: tutamaç durağın canlı (draft) konumudur,
     * canvas'taki noktası gizlenir ve published konumu hayalet halka olarak gösterilir.
     */
    const startDragPreview = (stopId: string) => {
      markers.get(stopId)?.marker.setStyle({ opacity: 0, fillOpacity: 0 });

      // Durak zaten taşınmışsa hayaleti vardır; yoksa (ve published'da varsa) geçici hayalet çizilir
      let tempGhost: L.CircleMarker | null = null;
      const original = useStopDraftStore.getState().published[stopId];
      if (original && !ghosts.has(stopId)) {
        tempGhost = L.circleMarker([original.lat, original.lon], {
          ...PUBLISHED_GHOST_STOP_STYLE,
          renderer: ghostsRenderer,
          interactive: false,
        });
        ghostsGroup.addLayer(tempGhost);
      }

      endDragPreviewRef.current = () => {
        isDragging = false;
        const entry = markers.get(stopId);
        entry?.marker.setStyle(STYLES[entry.styleKey]);
        if (tempGhost) ghostsGroup.removeLayer(tempGhost);
      };
    };

    // ---- Yanıp sönme: hayaletin, şehir noktasının ya da hat pininin üzerine gelinince aynı id'li hayalet ve ----
    // ---- güncel konum birlikte yanıp söner. Tek kanal: `useMapHighlightStore.highlightedStopId`.          ----
    const setHighlight = (stopId: string | null) => {
      useMapHighlightStore.getState().setHighlightedStopId(stopId);
    };
    let blinkMarkers: L.Marker[] = [];
    const stopBlink = () => {
      for (const m of blinkMarkers) m.remove();
      blinkMarkers = [];
    };
    /** Durağın hayaleti varsa hayaleti ve draft noktasını yanıp söndürür; hayaleti yoksa (taşınmamış durak) bir şey yapmaz. */
    const blinkPair = (stopId: string) => {
      stopBlink();
      if (isDragging) return;
      const ghost = ghosts.get(stopId);
      if (!ghost) return;
      const latlngs = [ghost.getLatLng()];
      const current = markers.get(stopId);
      if (current) latlngs.push(current.marker.getLatLng());
      // Halka hat pinlerinin de üstündeki düzlemde çizilir (pin şehir noktasını örttüğü için); etkileşimsizdir
      blinkMarkers = latlngs.map((latlng) =>
        L.marker(latlng, {
          icon: createBlinkRingIcon(),
          pane: MAP_PANES.DRAFT_VIAS,
          interactive: false,
          keyboard: false,
        }).addTo(map)
      );
    };

    const clearGhostHover = () => {
      if (hoveredGhostId === null) return;
      hoveredGhostId = null;
      hideTip();
      // Hayaletten çıkarken imleç bir durağın üzerindeyse onun baloncuğu ve vurgusu açılır
      if (hoveredStopId !== null) {
        showStopTip(hoveredStopId);
        setHighlight(hoveredStopId);
      } else {
        setHighlight(null);
      }
    };
    // Veri değişince (geri al, kayıt vb.) vurgu yeni konumlarla yeniden çizilir
    clearGhostHoverRef.current = () => {
      clearGhostHover();
      const highlighted = useMapHighlightStore.getState().highlightedStopId;
      if (highlighted !== null) blinkPair(highlighted);
      else stopBlink();
    };

    // Vurgu kanalı: kim set ederse etsin (durak katmanı ya da hat pini) yanıp sönme burada çizilir
    // Hat pini sürüklenirken (draggingStopId) şehir noktası gizlenir, published konumu hayalet olur
    const unsubscribeHighlight = useMapHighlightStore.subscribe((state, prev) => {
      if (state.draggingStopId !== prev.draggingStopId) {
        if (prev.draggingStopId !== null) {
          endDragPreviewRef.current?.();
          endDragPreviewRef.current = null;
        }
        if (state.draggingStopId !== null) {
          removeDragHandle();
          isDragging = true;
          clearGhostHover();
          hideTip();
          stopBlink();
          startDragPreview(state.draggingStopId);
        }
      }
      if (state.highlightedStopId === prev.highlightedStopId) return;
      if (state.highlightedStopId !== null) blinkPair(state.highlightedStopId);
      else stopBlink();
    });

    /** İmlecin altındaki hayaletin id'si. Hayalet düzlemi tıklamaya kapalı olduğu için piksel mesafesiyle bulunur. */
    const findGhostAt = (point: L.Point): string | null => {
      let found: string | null = null;
      let best = GHOST_HOVER_RADIUS_PX;
      for (const [stopId, ghost] of ghosts) {
        const dist = map.latLngToContainerPoint(ghost.getLatLng()).distanceTo(point);
        if (dist <= best) {
          best = dist;
          found = stopId;
        }
      }
      return found;
    };

    // DOM olayı kullanılır: imleç durak canvas'ının üzerindeyken Leaflet harita `mousemove`'unu her zaman iletmiyor
    const handleMapMouseMove = (e: MouseEvent) => {
      if (isDragging) return;
      const ghostId = findGhostAt(map.mouseEventToContainerPoint(e));
      if (ghostId === hoveredGhostId) return;
      clearGhostHover();
      if (ghostId === null) return;

      const ghost = ghosts.get(ghostId);
      const original = useStopDraftStore.getState().published[ghostId];
      if (!ghost || !original) return;
      hoveredGhostId = ghostId;
      setHighlight(ghostId);

      showTip(
        ghost.getLatLng(),
        `<div style="font-family: sans-serif; font-size: 11px;">
          <strong style="color: #64748b;">${escapeHtml(original.stopId)}</strong> - ${escapeHtml(original.stopName)}
          <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">Yayındaki konum</div>
        </div>`
      );
    };

    // ---- Durak hover'ı ----
    const showStopTip = (stopId: string) => {
      const entry = markers.get(stopId);
      if (!entry) return;
      const { stop, styleKey } = entry;
      showTip(
        entry.marker.getLatLng(),
        `<div style="font-family: sans-serif; font-size: 11px;">
          <strong style="color: #3b82f6;">${escapeHtml(stop.stopId)}</strong> - ${escapeHtml(stop.stopName)}
          ${styleKey === 'moved' ? '<span style="color: #f59e0b; font-weight: 600;"> (Taşındı)</span>' : ''}
          <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">Taşımak için tıklayın</div>
        </div>`
      );
    };
    const handleStopMouseOver = (e: L.LeafletMouseEvent) => {
      hoveredStopId = stopIdOf(e.propagatedFrom as L.Layer);
      if (hoveredGhostId !== null) return; // hayalet hover'ı öncelikli
      showStopTip(hoveredStopId);
      setHighlight(hoveredStopId);
    };
    const handleStopMouseOut = () => {
      hoveredStopId = null;
      if (hoveredGhostId !== null) return;
      hideTip();
      setHighlight(null);
    };

    // ---- Tıklanan durak için sürüklenebilir tutamaç ----
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

      const handleTipHtml = `<div style="font-family: sans-serif; font-size: 11px;">
          <strong style="color: #3b82f6;">${escapeHtml(stop.stopId)}</strong> - ${escapeHtml(stop.stopName)}
          <div style="color: #22c55e; font-size: 10px; font-weight: 600;">Yeni konuma sürükleyin</div>
        </div>`;
      const showHandleTip = () => showTip(handle.getLatLng(), handleTipHtml);
      showHandleTip();
      handle.on('mouseover', showHandleTip);
      handle.on('mouseout', hideTip);

      // Sürükleme boyunca hiçbir baloncuk gösterilmez
      handle.on('dragstart', () => {
        isDragging = true;
        clearGhostHover();
        hideTip();
        setHighlight(null);
        stopBlink();
        startDragPreview(stop.stopId);
      });

      handle.on('dragend', () => {
        const { lat, lng } = handle.getLatLng();
        removeDragHandle();
        useStopDraftStore.getState().moveStop(stop.stopId, lat, lng);
      });

      dragHandleRef.current = handle;
    };

    const handleMapClick = () => {
      removeDragHandle();
      hideTip();
    };

    stopsGroup.on('click', handleStopClick);
    stopsGroup.on('mouseover', handleStopMouseOver);
    stopsGroup.on('mouseout', handleStopMouseOut);
    map.on('click', handleMapClick);
    const container = map.getContainer();
    L.DomEvent.on(container, 'mousemove', handleMapMouseMove as L.DomEvent.EventHandlerFn);
    L.DomEvent.on(container, 'mouseleave', clearGhostHover);

    return () => {
      map.off('click', handleMapClick);
      L.DomEvent.off(container, 'mousemove', handleMapMouseMove as L.DomEvent.EventHandlerFn);
      L.DomEvent.off(container, 'mouseleave', clearGhostHover);
      unsubscribeHighlight();
      stopBlink();
      removeDragHandle();
      clearGhostHover();
      clearGhostHoverRef.current = null;
      hideTip();
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

      // Stil yalnızca durağa değil published'a da bağlıdır: sayfa yüklenirken taslak published'dan önce
      // gelir, published gelince aynı durak nesnesi için de "taşındı" stili uygulanmalıdır.
      if (entry.stop !== stop && (entry.stop.lat !== stop.lat || entry.stop.lon !== stop.lon)) {
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

    // Durak verisi değiştiyse açık tutamaç ve hayalet vurgusu artık eski konumu gösteriyor olabilir
    removeDragHandle();
    clearGhostHoverRef.current?.();
  }, [map, published, draft, effectiveStops]);
}
