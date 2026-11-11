import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useStopStore } from '../../store';
import { MAP_PANES } from './mapPanes';
import {
  CITY_STOP_CANVAS_STYLE,
  TERMINAL_STOP_CANVAS_STYLE,
  MOVED_STOP_CANVAS_STYLE,
  PUBLISHED_GHOST_STOP_STYLE,
} from './mapStyles';
import { createCityStopIcon } from './markerFactory';
import { isTerminalStop } from '../../model';

/**
 * Şehir genelindeki durak envanterini (738 durak) GPU destekli HTML5 Canvas üzerinde
 * 60 FPS akıcılıkla senkronize eden adaptör hook.
 *
 * Performans İlkeleri:
 * 1. 738 durağın tamamı DOM nesnesi (L.divIcon) yerine Canvas üzerinde L.circleMarker olarak çizilir.
 * 2. Sıfır DOM yükü sayesinde harita kaydırma (pan) ve yakınlaştırma (zoom) esnasında layout thrashing yaşanmaz.
 * 3. Operatör bir durağı taşımak istediğinde durağa tıklar; sadece seçilen o tek durak için
 *    sürüklenebilir geçici bir tutamaç (DOM drag handle) aktif edilir ve bırakıldığında (dragend)
 *    store niyetini tetikleyerek kendini temizler.
 */
export function useStopsMapSync(map: L.Map | null): void {
  const publishedStops = useStopStore((state) => state.publishedStops);
  const draftStops = useStopStore((state) => state.draftStops);
  const loadStopsIntent = useStopStore((state) => state.loadStopsIntent);
  const moveStopIntent = useStopStore((state) => state.moveStopIntent);

  const cityStopsLayerRef = useRef<L.LayerGroup | null>(null);
  const ghostStopsLayerRef = useRef<L.LayerGroup | null>(null);
  const activeDragMarkerRef = useRef<L.Marker | null>(null);

  // 1. İlk yüklemede duraklar boşsa sunucudan çek (loadStopsIntent)
  useEffect(() => {
    if (publishedStops.length === 0) {
      void loadStopsIntent();
    }
  }, [publishedStops.length, loadStopsIntent]);

  // 2. Harita katman gruplarını bağla, harita tıklama temizliğini kur ve unmount'ta temizle
  useEffect(() => {
    if (!map) return;

    const cityGroup = L.layerGroup([], { pane: MAP_PANES.CITY_STOPS }).addTo(map);
    const ghostGroup = L.layerGroup([], { pane: MAP_PANES.PUBLISHED_STOPS }).addTo(map);

    cityStopsLayerRef.current = cityGroup;
    ghostStopsLayerRef.current = ghostGroup;

    // Harita zeminine tıklanınca varsa aktif taşıma tutamacını kaldır
    const handleMapClick = () => {
      if (activeDragMarkerRef.current) {
        activeDragMarkerRef.current.remove();
        activeDragMarkerRef.current = null;
      }
    };
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
      if (activeDragMarkerRef.current) {
        activeDragMarkerRef.current.remove();
        activeDragMarkerRef.current = null;
      }
      cityGroup.remove();
      ghostGroup.remove();
      cityStopsLayerRef.current = null;
      ghostStopsLayerRef.current = null;
    };
  }, [map]);

  // 3. Durak listesi her değiştiğinde Canvas katmanlarını güncelle (UDF Reaktivitesi)
  useEffect(() => {
    const cityGroup = cityStopsLayerRef.current;
    const ghostGroup = ghostStopsLayerRef.current;
    if (!map || !cityGroup || !ghostGroup) return;

    cityGroup.clearLayers();
    ghostGroup.clearLayers();

    // Varsa önceki taşıma tutamacını da sıfırla
    if (activeDragMarkerRef.current) {
      activeDragMarkerRef.current.remove();
      activeDragMarkerRef.current = null;
    }

    // Özel katman düzlemleri için Canvas renderer'lar
    const cityCanvasRenderer = L.canvas({ pane: MAP_PANES.CITY_STOPS });
    const ghostCanvasRenderer = L.canvas({ pane: MAP_PANES.PUBLISHED_STOPS });

    // Published durakları hızlı erişim için haritalayalım
    const publishedMap = new Map(publishedStops.map((s) => [s.stopId, s]));

    // Aktif durak listesi: Varsa draftStops, yoksa publishedStops
    const activeStops = draftStops ?? publishedStops;

    for (const stop of activeStops) {
      const published = publishedMap.get(stop.stopId);
      const isMoved = published !== undefined && (published.lat !== stop.lat || published.lon !== stop.lon);

      // A) Eğer durak taşınmışsa, orijinal konumunda altta Canvas HAYALET pini bırak
      if (isMoved && published) {
        const ghostCircle = L.circleMarker([published.lat, published.lon], {
          ...PUBLISHED_GHOST_STOP_STYLE,
          renderer: ghostCanvasRenderer,
          interactive: true,
        });

        ghostCircle.bindTooltip(
          `<div style="font-family: sans-serif; font-size: 11px;">
            <span style="color: #94a3b8; font-weight: 600;">Orijinal:</span> <strong>${published.stopId}</strong> - ${published.stopName}
          </div>`,
          { direction: 'top', offset: [0, -6] }
        );

        ghostGroup.addLayer(ghostCircle);
      }

      // B) Aktif durak pini (GPU Destekli Canvas CircleMarker)
      const isTerminal = isTerminalStop(stop);
      const baseStyle = isMoved
        ? MOVED_STOP_CANVAS_STYLE
        : isTerminal
          ? TERMINAL_STOP_CANVAS_STYLE
          : CITY_STOP_CANVAS_STYLE;

      const circle = L.circleMarker([stop.lat, stop.lon], {
        ...baseStyle,
        renderer: cityCanvasRenderer,
        interactive: true,
      });

      circle.bindTooltip(
        `<div style="font-family: sans-serif; font-size: 11px;">
          <strong style="color: #3b82f6;">${stop.stopId}</strong> - ${stop.stopName}
          ${isMoved ? '<span style="color: #f59e0b; font-weight: 600;"> (Taşındı)</span>' : ''}
          <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">Taşımak için tıklayın</div>
        </div>`,
        { direction: 'top', offset: [0, -6] }
      );

      // Durağa tıklandığında: SADECE bu durak için tek bir sürüklenebilir DOM pini aç (On-Demand Drag Handle)
      circle.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);

        if (activeDragMarkerRef.current) {
          activeDragMarkerRef.current.remove();
          activeDragMarkerRef.current = null;
        }

        const dragMarker = L.marker([stop.lat, stop.lon], {
          icon: createCityStopIcon(isTerminal, true),
          pane: MAP_PANES.DRAFT_STOPS,
          draggable: true,
        }).addTo(map);

        dragMarker
          .bindTooltip(
            `<div style="font-family: sans-serif; font-size: 11px;">
              <strong style="color: #3b82f6;">${stop.stopId}</strong> - ${stop.stopName}
              <div style="color: #22c55e; font-size: 10px; font-weight: 600;">Yeni konuma sürükleyin</div>
            </div>`,
            { direction: 'top', offset: [0, -10] }
          )
          .openTooltip();

        dragMarker.on('dragend', (dragEvent) => {
          const marker = dragEvent.target as L.Marker;
          const { lat, lng } = marker.getLatLng();
          dragMarker.remove();
          activeDragMarkerRef.current = null;
          void moveStopIntent(stop.stopId, lat, lng);
        });

        activeDragMarkerRef.current = dragMarker;
      });

      cityGroup.addLayer(circle);
    }
  }, [map, publishedStops, draftStops, moveStopIntent]);
}
