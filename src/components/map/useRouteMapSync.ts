import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useRouteStore, useStopStore, selectActiveStops } from '../../store';
import { MAP_PANES } from './mapPanes';
import { PUBLISHED_LINE_STYLE, DRAFT_LINE_STYLE } from './mapStyles';
import {
  createRouteStopIcon,
  createViaHandleIcon,
  createGhostStopIcon,
  createLineDragHandleIcon,
} from './markerFactory';
import { isTerminalStop, type Stop, type RouteNavigation, type Via } from '../../model';

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
 * Çizgiye tıklandığında veya sürüklendiğinde hangi iki durak (fromStopId -> toStopId) arasına denk geldiğini
 * 2D piksel projeksiyonu ile OSRM bacakları ve segmentler üzerinden tespit ederek bulur.
 */
function findNearestStopSegment(
  clickLatLng: L.LatLng,
  stops: Stop[],
  vias: Via[],
  navigation: RouteNavigation | null,
  map: L.Map
): { fromStopId: string; toStopId: string } | null {
  if (stops.length < 2) return null;

  const clickPoint = map.latLngToLayerPoint(clickLatLng);
  let minDistance = Infinity;
  let bestFromStopId = stops[0].stopId;
  let bestToStopId = stops[1].stopId;

  // 1. Eğer navigation legs mevcutsa, her bir OSRM leg'ini ait olduğu (fromStopId -> toStopId) segmentine bağla
  if (navigation && navigation.legs && navigation.legs.length > 0) {
    const legSegmentMap: { fromStopId: string; toStopId: string }[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const fromId = stops[i].stopId;
      const toId = stops[i + 1].stopId;
      const countVias = vias.filter((v) => v.fromStopId === fromId && v.toStopId === toId).length;
      for (let k = 0; k <= countVias; k++) {
        legSegmentMap.push({ fromStopId: fromId, toStopId: toId });
      }
    }

    if (legSegmentMap.length === navigation.legs.length) {
      for (let legIdx = 0; legIdx < navigation.legs.length; legIdx++) {
        const legCoords = navigation.legs[legIdx].coordinates;
        if (!legCoords || legCoords.length < 2) continue;

        for (let j = 0; j < legCoords.length - 1; j++) {
          const p1 = map.latLngToLayerPoint([legCoords[j].lat, legCoords[j].lon]);
          const p2 = map.latLngToLayerPoint([legCoords[j + 1].lat, legCoords[j + 1].lon]);
          const dist = L.LineUtil.pointToSegmentDistance(clickPoint, p1, p2);
          if (dist < minDistance) {
            minDistance = dist;
            bestFromStopId = legSegmentMap[legIdx].fromStopId;
            bestToStopId = legSegmentMap[legIdx].toStopId;
          }
        }
      }

      return { fromStopId: bestFromStopId, toStopId: bestToStopId };
    }
  }

  // 2. Fallback: Durak koordinatları arasındaki 2D projeksiyon mesafesi
  for (let i = 0; i < stops.length - 1; i++) {
    const p1 = map.latLngToLayerPoint([stops[i].lat, stops[i].lon]);
    const p2 = map.latLngToLayerPoint([stops[i + 1].lat, stops[i + 1].lon]);

    const dist = L.LineUtil.pointToSegmentDistance(clickPoint, p1, p2);
    if (dist < minDistance) {
      minDistance = dist;
      bestFromStopId = stops[i].stopId;
      bestToStopId = stops[i + 1].stopId;
    }
  }

  return {
    fromStopId: bestFromStopId,
    toStopId: bestToStopId,
  };
}

/**
 * Aktif seçili hattın published ve draft katmanlarını haritayla senkronize eden adaptör hook.
 *
 * Kurallar:
 * 1. published: Alt katmanda kesikli gri referans çizgisi ve hayalet duraklar.
 * 2. draft: Üst katmanda canlı mavi çalışma çizgisi, sürüklenebilir durak pinleri ve via tutamaçları.
 * 3. Çizgi Tıklaması: Tıklanan yere yeni bir Via nesnesi eklenir (addViaIntent).
 * 4. Mıknatıs Kilitleme: Bir via durak yakınına (<= 20px) bırakılırsa durak nesnesine kilitlenir (snapViaIntent).
 */
export function useRouteMapSync(map: L.Map | null): void {
  const routeId = useRouteStore((state) => state.routeId);
  const published = useRouteStore((state) => state.published);
  const draft = useRouteStore((state) => state.draft);
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

  const lineDragHandleRef = useRef<L.Marker | null>(null);
  const isDraggingLineRef = useRef<boolean>(false);

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

      if (lineDragHandleRef.current) {
        lineDragHandleRef.current.remove();
        lineDragHandleRef.current = null;
      }
      isDraggingLineRef.current = false;

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

    if (lineDragHandleRef.current) {
      lineDragHandleRef.current.remove();
      lineDragHandleRef.current = null;
    }
    isDraggingLineRef.current = false;

    if (!routeId) {
      lastFittedRouteIdRef.current = null;
      return;
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
    if (!activeRoute) return;

    // Hat ilk seçildiğinde veya değiştiğinde haritayı hattın sınırlarına sığdır
    if (lastFittedRouteIdRef.current !== routeId && activeRoute.stops.length > 0) {
      lastFittedRouteIdRef.current = routeId;
      const bounds = L.latLngBounds(activeRoute.stops.map((s) => [s.lat, s.lon]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

    // 1. Aktif Rota Çizgisi (SVG Tabanlı, Piksel Hassas Tıklama Yakalama)
    const isCalculating = isRouting || !activeRoute.navigation;
    const draftCoords = activeRoute.navigation
      ? extractPolylineCoords(activeRoute.navigation)
      : activeRoute.stops.map((s) => [s.lat, s.lon] as [number, number]);

    if (draftCoords.length > 0) {
      const lineStyle: L.PolylineOptions = isCalculating
        ? {
            ...DRAFT_LINE_STYLE,
            opacity: 0.5,
            dashArray: '4, 6',
          }
        : DRAFT_LINE_STYLE;

      const draftSvgRenderer = L.svg({ pane: MAP_PANES.DRAFT_LINE });
      const draftPolyline = L.polyline(draftCoords, {
        ...lineStyle,
        renderer: draftSvgRenderer,
      });

      // Çizgi üzerinde dinamik tek hamlede sürükle-bırak tutamacı (Single-Gesture Polyline Drag)
      let activeSegment: { fromStopId: string; toStopId: string } | null = null;

      const removeLineDragHandle = () => {
        if (lineDragHandleRef.current) {
          lineDragHandleRef.current.remove();
          lineDragHandleRef.current = null;
        }
      };

      const createOrGetLineDragHandle = (latlng: L.LatLng): L.Marker => {
        if (lineDragHandleRef.current) {
          return lineDragHandleRef.current;
        }

        const handle = L.marker(latlng, {
          icon: createLineDragHandleIcon(),
          pane: MAP_PANES.DRAFT_VIAS,
          draggable: true,
          zIndexOffset: 1500,
        }).addTo(map);

        handle.bindTooltip(
          `<div style="font-family: sans-serif; font-size: 11px;">
            <strong style="color: #3b82f6;">Güzergahı Bük / Sürükle</strong><br/>
            <span style="color: #94a3b8; font-size: 10px;">Yeni yola sürükleyin veya durağa kilitleyin</span>
          </div>`,
          { direction: 'top', offset: [0, -10] }
        );

        handle.on('dragstart', () => {
          isDraggingLineRef.current = true;
          handle.closeTooltip();
          activeSegment = findNearestStopSegment(
            handle.getLatLng(),
            activeRoute.stops,
            activeRoute.vias,
            activeRoute.navigation,
            map
          );
        });

        handle.on('dragend', (e) => {
          isDraggingLineRef.current = false;
          const targetMarker = e.target as L.Marker;
          const dropLatLng = targetMarker.getLatLng();
          const dropPoint = map.latLngToLayerPoint(dropLatLng);

          // Şehir duraklarına 20 piksel mıknatıs kilitleme kontrolü
          const allCityStops = selectActiveStops(useStopStore.getState());
          let snappedStop: Stop | null = null;
          let minPixelDist = 20;

          for (const cityStop of allCityStops) {
            const stopPoint = map.latLngToLayerPoint([cityStop.lat, cityStop.lon]);
            const dist = dropPoint.distanceTo(stopPoint);
            if (dist <= minPixelDist) {
              minPixelDist = dist;
              snappedStop = cityStop;
            }
          }

          if (snappedStop && activeSegment) {
            // Bir durağa kilitlendi: Durağı ilgili segmente durak olarak ekle
            const fromIdx = activeRoute.stops.findIndex((s) => s.stopId === activeSegment!.fromStopId);
            const insertIdx = fromIdx !== -1 ? fromIdx + 1 : undefined;
            addStopIntent(snappedStop, insertIdx);
          } else if (activeSegment) {
            // Serbest yola bırakıldı: Yeni Via ekle
            const newVia: Via = {
              fromStopId: activeSegment.fromStopId,
              toStopId: activeSegment.toStopId,
              viaSequence: 1,
              lat: dropLatLng.lat,
              lon: dropLatLng.lng,
            };
            addViaIntent(newVia);
          }

          removeLineDragHandle();
        });

        handle.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (isDraggingLineRef.current) return;
          const segment = findNearestStopSegment(
            e.latlng,
            activeRoute.stops,
            activeRoute.vias,
            activeRoute.navigation,
            map
          );
          if (!segment) return;

          const newVia: Via = {
            fromStopId: segment.fromStopId,
            toStopId: segment.toStopId,
            viaSequence: 1,
            lat: e.latlng.lat,
            lon: e.latlng.lng,
          };
          addViaIntent(newVia);
          removeLineDragHandle();
        });

        lineDragHandleRef.current = handle;
        return handle;
      };

      // 1. Çizgi üzerinde gezinirken (Hover) tutamacı konumlandır
      draftPolyline.on('mousemove', (e: L.LeafletMouseEvent) => {
        if (isDraggingLineRef.current) return;
        const handle = createOrGetLineDragHandle(e.latlng);
        handle.setLatLng(e.latlng);
      });

      // 2. Çizgiden fare ayrıldığında sürükleme aktif değilse kaldır
      draftPolyline.on('mouseout', (e: L.LeafletMouseEvent) => {
        if (isDraggingLineRef.current) return;
        const relatedTarget = (e.originalEvent as MouseEvent)?.relatedTarget as HTMLElement | null;
        if (relatedTarget && relatedTarget.closest?.('.transit-line-drag-handle')) {
          return;
        }
        removeLineDragHandle();
      });

      // 3. Çizgiye fare basıldığı an (mousedown) tek hamlede sürüklemeyi başlat
      draftPolyline.on('mousedown', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const handle = createOrGetLineDragHandle(e.latlng);
        handle.setLatLng(e.latlng);

        if (handle.dragging) {
          (handle.dragging as unknown as { _onDown: (ev: MouseEvent | TouchEvent) => void })._onDown(e.originalEvent);
        }
      });

      // 4. Çizgiye doğrudan tıklanması (drag yapılmadan bırakılırsa)
      draftPolyline.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (isDraggingLineRef.current) return;
        const segment = findNearestStopSegment(
          e.latlng,
          activeRoute.stops,
          activeRoute.vias,
          activeRoute.navigation,
          map
        );
        if (!segment) return;

        const newVia: Via = {
          fromStopId: segment.fromStopId,
          toStopId: segment.toStopId,
          viaSequence: 1,
          lat: e.latlng.lat,
          lon: e.latlng.lng,
        };

        addViaIntent(newVia);
        removeLineDragHandle();
      });

      draftLineGroup.addLayer(draftPolyline);
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
        const dropPoint = map.latLngToLayerPoint(dropLatLng);

        // Şehirdeki tüm duraklar arasından 20 piksel yakında olan var mı kontrol et
        const allCityStops = selectActiveStops(useStopStore.getState());
        let snappedStop: Stop | null = null;
        let minPixelDist = 20; // 20 piksel mıknatıs eşiği

        for (const cityStop of allCityStops) {
          const stopPoint = map.latLngToLayerPoint([cityStop.lat, cityStop.lon]);
          const dist = dropPoint.distanceTo(stopPoint);
          if (dist <= minPixelDist) {
            minPixelDist = dist;
            snappedStop = cityStop;
          }
        }

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
