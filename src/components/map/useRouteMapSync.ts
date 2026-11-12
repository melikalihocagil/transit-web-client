import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useRouteStore, useStopDraftStore, selectEffectiveStops, selectActiveDraft } from '../../store';
import { MAP_PANES } from './mapPanes';
import {
  PUBLISHED_LINE_STYLE,
  DRAFT_LINE_STYLE,
  DRAFT_LINE_HOVER_STYLE,
  DRAFT_LINE_HIT_STYLE,
} from './mapStyles';
import {
  createRouteStopIcon,
  createViaHandleIcon,
  createGhostStopIcon,
  createLineDragHandleIcon,
} from './markerFactory';
import {
  isTerminalStop,
  locateLegs,
  formatDistance,
  formatDuration,
  type Stop,
  type RouteNavigation,
  type LegSlot,
} from '../../model';

/** Bu kadar pikselden az hareket eden basış sürükleme değil, tıklama sayılır. */
const CLICK_TOLERANCE_PX = 4;
/** Bırakma noktasına bu kadar piksel yakın şehir durağına kilitlenilir. */
const STOP_SNAP_RADIUS_PX = 20;

/**
 * Navigasyon bacaklarından (legs) tüm polyline koordinatlarını derler.
 */
function extractPolylineCoords(navigation: RouteNavigation | null): [number, number][] {
  if (!navigation || !navigation.legs) return [];
  const coords: [number, number][] = [];
  for (const leg of navigation.legs) {
    for (const c of leg.coordinates) {
      coords.push([c.lat, c.lon]);
    }
  }
  return coords;
}

/**
 * Bırakma noktasına 20 piksel içindeki en yakın şehir durağını bulur (mıknatıs kilitleme).
 */
function findSnapStop(map: L.Map, latlng: L.LatLng): Stop | null {
  const dropPoint = map.latLngToLayerPoint(latlng);
  const allCityStops = selectEffectiveStops(useStopDraftStore.getState());
  let snappedStop: Stop | null = null;
  let minPixelDist = STOP_SNAP_RADIUS_PX;

  for (const cityStop of allCityStops) {
    const stopPoint = map.latLngToLayerPoint([cityStop.lat, cityStop.lon]);
    const dist = dropPoint.distanceTo(stopPoint);
    if (dist <= minPixelDist) {
      minPixelDist = dist;
      snappedStop = cityStop;
    }
  }

  return snappedStop;
}

/**
 * Aktif seçili hattın published ve draft katmanlarını haritayla senkronize eden adaptör hook.
 *
 * Kurallar:
 * 1. published: Alt katmanda kesikli gri referans çizgisi ve hayalet duraklar.
 * 2. draft: Üst katmanda canlı mavi çalışma çizgisi, sürüklenebilir durak pinleri ve via tutamaçları.
 * 3. Bacaklar: Navigasyon bacakları duraklar + via'larla eşleşiyorsa her bacak ayrı çizilir;
 *    tıklanan/sürüklenen bacağın durak çifti ve via sırası kesin olarak bilinir (locateLegs).
 * 4. Çizgi Tıklaması/Sürüklemesi: Bacağa yeni via eklenir (addViaIntent) ya da yakındaki
 *    şehir durağı araya girer (addStopIntent).
 * 5. Mıknatıs Kilitleme: Bir via durak yakınına (<= 20px) bırakılırsa durak nesnesine kilitlenir (snapViaIntent).
 */
export function useRouteMapSync(map: L.Map | null): void {
  const routeId = useRouteStore((state) => state.routeId);
  const published = useRouteStore((state) => state.published);
  const draft = useRouteStore(selectActiveDraft);
  const isRouting = useRouteStore((state) => state.isRouting);

  const moveDraftStopIntent = useRouteStore((state) => state.moveDraftStopIntent);
  const addStopIntent = useRouteStore((state) => state.addStopIntent);
  const addViaIntent = useRouteStore((state) => state.addViaIntent);
  const moveViaIntent = useRouteStore((state) => state.moveViaIntent);
  const removeViaIntent = useRouteStore((state) => state.removeViaIntent);
  const snapViaIntent = useRouteStore((state) => state.snapViaIntent);

  const publishedLineGroupRef = useRef<L.LayerGroup | null>(null);
  const draftLineGroupRef = useRef<L.LayerGroup | null>(null);
  const draftStopsGroupRef = useRef<L.LayerGroup | null>(null);
  const draftViasGroupRef = useRef<L.LayerGroup | null>(null);
  const ghostStopsGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFittedRouteIdRef = useRef<string | null>(null);

  // 1. Katman gruplarını başlat ve haritaya ekle
  useEffect(() => {
    if (!map) return;

    const pubLineGroup = L.layerGroup([], { pane: MAP_PANES.PUBLISHED_LINE }).addTo(map);
    const draftLineGroup = L.layerGroup([], { pane: MAP_PANES.DRAFT_LINE }).addTo(map);
    const ghostGroup = L.layerGroup([], { pane: MAP_PANES.PUBLISHED_STOPS }).addTo(map);
    const draftStopsGroup = L.layerGroup([], { pane: MAP_PANES.DRAFT_STOPS }).addTo(map);
    const draftViasGroup = L.layerGroup([], { pane: MAP_PANES.DRAFT_VIAS }).addTo(map);

    publishedLineGroupRef.current = pubLineGroup;
    draftLineGroupRef.current = draftLineGroup;
    ghostStopsGroupRef.current = ghostGroup;
    draftStopsGroupRef.current = draftStopsGroup;
    draftViasGroupRef.current = draftViasGroup;

    return () => {
      pubLineGroup.remove();
      draftLineGroup.remove();
      ghostGroup.remove();
      draftStopsGroup.remove();
      draftViasGroup.remove();

      publishedLineGroupRef.current = null;
      draftLineGroupRef.current = null;
      ghostStopsGroupRef.current = null;
      draftStopsGroupRef.current = null;
      draftViasGroupRef.current = null;
    };
  }, [map]);

  // 2. Hat verisi değiştikçe katmanları senkronize et
  useEffect(() => {
    const pubLineGroup = publishedLineGroupRef.current;
    const draftLineGroup = draftLineGroupRef.current;
    const ghostGroup = ghostStopsGroupRef.current;
    const draftStopsGroup = draftStopsGroupRef.current;
    const draftViasGroup = draftViasGroupRef.current;

    if (!map || !pubLineGroup || !draftLineGroup || !ghostGroup || !draftStopsGroup || !draftViasGroup) {
      return;
    }

    pubLineGroup.clearLayers();
    draftLineGroup.clearLayers();
    ghostGroup.clearLayers();
    draftStopsGroup.clearLayers();
    draftViasGroup.clearLayers();

    // Çizgi üzerindeki işaret noktası ve süren sürükleme bu effect çalışmasına aittir;
    // temizlikte ikisi de sökülür (sürükleme ortasında veri değişse de harita kilitli kalmaz)
    let lineHandle: L.Marker | null = null;
    let endLineDrag: (() => void) | null = null;

    const removeLineHandle = () => {
      if (lineHandle) {
        lineHandle.remove();
        lineHandle = null;
      }
    };

    const showLineHandle = (latlng: L.LatLng) => {
      if (!lineHandle) {
        lineHandle = L.marker(latlng, {
          icon: createLineDragHandleIcon(),
          pane: MAP_PANES.DRAFT_VIAS,
          interactive: false,
          keyboard: false,
          zIndexOffset: 1500,
        }).addTo(map);
      } else {
        lineHandle.setLatLng(latlng);
      }
    };

    const cleanup = () => {
      endLineDrag?.();
      removeLineHandle();
    };

    if (!routeId) {
      lastFittedRouteIdRef.current = null;
      return cleanup;
    }

    // --- A) Alt Katman: PUBLISHED Rota Çizgisi ---
    if (published?.navigation) {
      const pubCoords = extractPolylineCoords(published.navigation);
      if (pubCoords.length > 0) {
        const pubSvgRenderer = L.svg({ pane: MAP_PANES.PUBLISHED_LINE });
        const pubPolyline = L.polyline(pubCoords, {
          ...PUBLISHED_LINE_STYLE,
          renderer: pubSvgRenderer,
        });
        pubLineGroup.addLayer(pubPolyline);
      }
    }

    // --- B) Üst Katman: DRAFT (Aktif Tezgah) ---
    // Eğer draft henüz oluşmamışsa Copy-on-Write kuralı gereği published'ı referans al
    const activeRoute = draft ?? published;
    if (!activeRoute) return cleanup;

    // Hat ilk seçildiğinde veya değiştiğinde haritayı hattın sınırlarına sığdır
    if (lastFittedRouteIdRef.current !== routeId && activeRoute.stops.length > 0) {
      lastFittedRouteIdRef.current = routeId;
      const bounds = L.latLngBounds(activeRoute.stops.map((s) => [s.lat, s.lon]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

    // 1. Aktif Rota Çizgisi
    const navigation = activeRoute.navigation;
    const slots = locateLegs(activeRoute.stops, activeRoute.vias);
    const isAligned = navigation != null && navigation.legs.length === slots.length && !isRouting;
    const draftSvgRenderer = L.svg({ pane: MAP_PANES.DRAFT_LINE });

    if (!isAligned || !navigation) {
      // Hesap sürüyor ya da bacaklar tutarsız: kesikli tek çizgi, etkileşimsiz
      const draftCoords = navigation
        ? extractPolylineCoords(navigation)
        : activeRoute.stops.map((s) => [s.lat, s.lon] as [number, number]);

      if (draftCoords.length > 0) {
        const draftPolyline = L.polyline(draftCoords, {
          ...DRAFT_LINE_STYLE,
          opacity: 0.5,
          dashArray: '4, 6',
          interactive: false,
          renderer: draftSvgRenderer,
        });
        draftLineGroup.addLayer(draftPolyline);
      }
    } else {
      // Her bacak ayrı çizilir: görünür çizgi (etkileşimsiz) + saydam kalın yakalama çizgisi
      const legCountBySegment = new Map<number, number>();
      for (const slot of slots) {
        legCountBySegment.set(slot.segmentIndex, (legCountBySegment.get(slot.segmentIndex) ?? 0) + 1);
      }

      // Basılı tutulan bacak çizgi boyunca sürüklenir; bırakınca via ya da durak eklenir
      const startLineDrag = (slot: LegSlot, visible: L.Polyline, onLine: L.LatLng, startPoint: L.Point) => {
        map.dragging.disable();

        const handleMove = (e: L.LeafletMouseEvent) => {
          showLineHandle(e.latlng);
        };

        const handleUp = (ev: MouseEvent) => {
          const dropLatLng = map.mouseEventToLatLng(ev);
          const movedPx = map.mouseEventToContainerPoint(ev).distanceTo(startPoint);
          endLineDrag?.();

          if (movedPx < CLICK_TOLERANCE_PX) {
            // Tıklama: via, çizgi üzerindeki noktaya eklenir
            addViaIntent({
              fromStopId: slot.fromStopId,
              toStopId: slot.toStopId,
              viaSequence: slot.viaSequence,
              lat: onLine.lat,
              lon: onLine.lng,
            });
            return;
          }

          const snappedStop = findSnapStop(map, dropLatLng);
          if (snappedStop) {
            // Bir şehir durağına bırakıldı: durak bu bacağın içine girer
            addStopIntent(snappedStop, slot);
          } else {
            // Serbest yola bırakıldı: bacağa yeni via
            addViaIntent({
              fromStopId: slot.fromStopId,
              toStopId: slot.toStopId,
              viaSequence: slot.viaSequence,
              lat: dropLatLng.lat,
              lon: dropLatLng.lng,
            });
          }
        };

        map.on('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);

        endLineDrag = () => {
          map.off('mousemove', handleMove);
          document.removeEventListener('mouseup', handleUp);
          map.dragging.enable();
          visible.setStyle(DRAFT_LINE_STYLE);
          removeLineHandle();
          endLineDrag = null;
        };
      };

      navigation.legs.forEach((leg, i) => {
        const slot = slots[i];
        const coords = leg.coordinates.map((c) => [c.lat, c.lon] as [number, number]);
        if (coords.length < 2) return;

        const visible = L.polyline(coords, {
          ...DRAFT_LINE_STYLE,
          interactive: false,
          renderer: draftSvgRenderer,
        });
        const hit = L.polyline(coords, {
          ...DRAFT_LINE_HIT_STYLE,
          renderer: draftSvgRenderer,
        });

        const fromStop = activeRoute.stops[slot.segmentIndex];
        const toStop = activeRoute.stops[slot.segmentIndex + 1];
        const legCount = legCountBySegment.get(slot.segmentIndex) ?? 1;

        hit.bindTooltip(
          `<div style="font-family: sans-serif; font-size: 11px;">
            <strong>${fromStop.stopName} &rarr; ${toStop.stopName}</strong><br/>
            <span style="color: #94a3b8;">bacak ${slot.viaSequence}/${legCount} &middot; ${formatDistance(leg.distance)} &middot; ${formatDuration(leg.duration)}</span>
          </div>`,
          { sticky: true, direction: 'top', offset: [0, -10] }
        );

        // Çizgi üzerindeki en yakın nokta (işaret ve tıklamayla eklenen via buraya oturur)
        const pointOnLine = (latlng: L.LatLng): L.LatLng => {
          const closest = visible.closestLayerPoint(map.latLngToLayerPoint(latlng));
          return closest ? map.layerPointToLatLng(closest) : latlng;
        };

        hit.on('mouseover', () => {
          if (endLineDrag) return;
          visible.setStyle(DRAFT_LINE_HOVER_STYLE);
        });

        hit.on('mouseout', () => {
          if (endLineDrag) return;
          visible.setStyle(DRAFT_LINE_STYLE);
          removeLineHandle();
        });

        hit.on('mousemove', (e: L.LeafletMouseEvent) => {
          if (endLineDrag) return;
          showLineHandle(pointOnLine(e.latlng));
        });

        // Ekleme fare bırakılınca yapılır; tıklama haritaya ulaşmasın
        hit.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
        });

        hit.on('mousedown', (e: L.LeafletMouseEvent) => {
          if (e.originalEvent.button !== 0 || endLineDrag) return;
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e.originalEvent);
          hit.closeTooltip();

          const onLine = pointOnLine(e.latlng);
          visible.setStyle(DRAFT_LINE_HOVER_STYLE);
          showLineHandle(onLine);
          startLineDrag(slot, visible, onLine, map.mouseEventToContainerPoint(e.originalEvent));
        });

        draftLineGroup.addLayer(visible);
        draftLineGroup.addLayer(hit);
      });
    }

    // 2. Published ile Draft Durakları Arasındaki Sapmalar (Hayalet Pinler)
    if (published && draft) {
      const publishedMap = new Map(published.stops.map((s) => [s.stopId, s]));
      draft.stops.forEach((draftStop, index) => {
        const orig = publishedMap.get(draftStop.stopId);
        if (orig && (orig.lat !== draftStop.lat || orig.lon !== draftStop.lon)) {
          const ghost = L.marker([orig.lat, orig.lon], {
            icon: createGhostStopIcon(index + 1),
            pane: MAP_PANES.PUBLISHED_STOPS,
            interactive: false,
          });
          ghostGroup.addLayer(ghost);
        }
      });
    }

    // 3. Aktif Hat Durak Pinleri (Sürüklenebilir)
    activeRoute.stops.forEach((stop, index) => {
      const isTerminal = isTerminalStop(stop);
      const marker = L.marker([stop.lat, stop.lon], {
        icon: createRouteStopIcon(index + 1, isTerminal),
        pane: MAP_PANES.DRAFT_STOPS,
        draggable: true,
      });

      marker.bindTooltip(
        `<div style="font-family: sans-serif; font-size: 11px;">
          <strong>#${index + 1}</strong> ${stop.stopId} - ${stop.stopName}
        </div>`,
        { direction: 'top', offset: [0, -12] }
      );

      marker.on('dragend', (e) => {
        const target = e.target as L.Marker;
        const { lat, lng } = target.getLatLng();
        moveDraftStopIntent(stop.stopId, lat, lng);
      });

      draftStopsGroup.addLayer(marker);
    });

    // 4. Aktif Hat Via Tutamaçları (Sürüklenebilir & Mıknatıslı)
    activeRoute.vias.forEach((via) => {
      const viaMarker = L.marker([via.lat, via.lon], {
        icon: createViaHandleIcon(),
        pane: MAP_PANES.DRAFT_VIAS,
        draggable: true,
      });

      viaMarker.bindTooltip(
        `<div style="font-family: sans-serif; font-size: 11px;">
          Ara Nokta (Via) <span style="color: #94a3b8;">(${via.fromStopId} &rarr; ${via.toStopId})</span><br/>
          <span style="color: #f59e0b; font-size: 10px;">Durağa sürükleyerek kilitleyebilirsiniz. Sağ tık siler.</span>
        </div>`,
        { direction: 'top', offset: [0, -8] }
      );

      // Sağ tık: Via'yı sil
      viaMarker.on('contextmenu', (e) => {
        L.DomEvent.stopPropagation(e);
        removeViaIntent(via);
      });

      // Bırakma anı (dragend): Mıknatıs kilitleme kontrolü
      viaMarker.on('dragend', (e) => {
        const target = e.target as L.Marker;
        const dropLatLng = target.getLatLng();
        const snappedStop = findSnapStop(map, dropLatLng);

        if (snappedStop) {
          // Bir durağın üzerine bırakıldı: Via'yı bu durağa dönüştür (Snap to Stop)
          snapViaIntent(via, snappedStop);
        } else {
          // Normal serbest via konumu güncellemesi
          moveViaIntent(via, dropLatLng.lat, dropLatLng.lng);
        }
      });

      draftViasGroup.addLayer(viaMarker);
    });

    return cleanup;
  }, [
    map,
    routeId,
    published,
    draft,
    isRouting,
    moveDraftStopIntent,
    addStopIntent,
    addViaIntent,
    moveViaIntent,
    removeViaIntent,
    snapViaIntent,
  ]);
}
