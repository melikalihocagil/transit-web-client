import { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  useRouteStore,
  useStopDraftStore,
  useActiveRoute,
  useMapHighlightStore,
  selectEffectiveStops,
  useRouteInfoStore,
  selectRouteInfo,
} from '../../store';
import { MAP_PANES } from './mapPanes';
import {
  PUBLISHED_LINE_STYLE,
  DRAFT_LINE_STYLE,
  DRAFT_LINE_CASING_STYLE,
  DRAFT_LINE_OVERLAP_CASING_STYLE,
  DRAFT_LINE_FLASH_STYLE,
  routeLineWidths,
  DRAFT_LINE_HIT_STYLE,
  DIFF_INCREASE_COLOR,
  DIFF_DECREASE_COLOR,
} from './mapStyles';
import {
  createRouteStopIcon,
  createGhostStopIcon,
  createViaHandleIcon,
  createLineDragHandleIcon,
  createDiffBubbleIcon,
  DIFF_BUBBLE_SCALE_VAR,
} from './markerFactory';
import {
  isTerminalStop,
  locateLegs,
  formatDistance,
  formatDuration,
  formatDistanceDelta,
  formatDurationDelta,
  diffRoutes,
  findSelfOverlaps,
  mergeLegCoordinates,
  type Stop,
  type Coordinate,
  type LegSlot,
  toCssColor,
  darkenColor,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_ROUTE_TEXT_COLOR,
} from '../../model';

/** Bu kadar pikselden az hareket eden basış sürükleme değil, tıklama sayılır. */
const CLICK_TOLERANCE_PX = 4;
/** Fark baloncuğu bu zoom'da 1:1 boyuttadır; her zoom adımında ölçek √2 kat değişir. */
const DIFF_BUBBLE_BASE_ZOOM = 15;
const DIFF_BUBBLE_MIN_SCALE = 0.7;
const DIFF_BUBBLE_MAX_SCALE = 1.6;

function diffBubbleScale(zoom: number): number {
  const scale = Math.pow(2, (zoom - DIFF_BUBBLE_BASE_ZOOM) / 2);
  return Math.min(DIFF_BUBBLE_MAX_SCALE, Math.max(DIFF_BUBBLE_MIN_SCALE, scale));
}

/** Bırakma noktasına bu kadar piksel yakın şehir durağına kilitlenilir. */
const STOP_SNAP_RADIUS_PX = 20;

function toLatLngs(coords: Coordinate[]): [number, number][] {
  return coords.map((c) => [c.lat, c.lon]);
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
 * 1. published: Alt katmanda kesikli gri referans çizgisi. Durak hayaletleri yalnızca durak katmanında çizilir.
 * 2. Aktif hat: Üst katmanda canlı mavi çalışma çizgisi, sürüklenebilir durak pinleri ve via tutamaçları.
 *    Pin konumu durak store'undan gelir; pini taşımak durağın kendisini taşır (moveStop).
 * 3. Bacaklar: Navigasyon bacakları duraklar + via'larla eşleşiyorsa her bacak ayrı çizilir;
 *    tıklanan/sürüklenen bacağın durak çifti ve via sırası kesin olarak bilinir (locateLegs).
 * 4. Çizgi Tıklaması/Sürüklemesi: Bacağa yeni via eklenir (addViaIntent) ya da yakındaki
 *    şehir durağı araya girer (addStopIntent).
 * 5. Mıknatıs Kilitleme: Bir via durak yakınına (<= 20px) bırakılırsa durak nesnesine kilitlenir (snapViaIntent).
 */
export function useRouteMapSync(map: L.Map | null): void {
  const routeId = useRouteStore((state) => state.routeId);
  const published = useRouteStore((state) => state.published);
  const activeRoute = useActiveRoute();
  const isRouting = useRouteStore((state) => state.isRouting);
  // Çizgi ve pinler hattın renginde (hat bilgisi taslağı ?? yayındaki)
  const routeColor = useRouteInfoStore((state) =>
    toCssColor(selectRouteInfo(state, routeId)?.routeColor, DEFAULT_ROUTE_COLOR)
  );
  const routeTextColor = useRouteInfoStore((state) =>
    toCssColor(selectRouteInfo(state, routeId)?.routeTextColor, DEFAULT_ROUTE_TEXT_COLOR)
  );

  const addStopIntent = useRouteStore((state) => state.addStopIntent);
  const removeStopIntent = useRouteStore((state) => state.removeStopIntent);
  const addViaIntent = useRouteStore((state) => state.addViaIntent);
  const moveViaIntent = useRouteStore((state) => state.moveViaIntent);
  const removeViaIntent = useRouteStore((state) => state.removeViaIntent);
  const snapViaIntent = useRouteStore((state) => state.snapViaIntent);

  const publishedLineGroupRef = useRef<L.LayerGroup | null>(null);
  const draftLineGroupRef = useRef<L.LayerGroup | null>(null);
  const draftStopsGroupRef = useRef<L.LayerGroup | null>(null);
  const draftViasGroupRef = useRef<L.LayerGroup | null>(null);
  // Renderer'lar harita başına bir kez kurulur: Leaflet bir renderer'ı ilk kullanımda haritaya ekler ve
  // clearLayers ile kaldırmaz; her çizimde yenisini kurmak boş <svg>'lerin birikmesine yol açar.
  const publishedRendererRef = useRef<L.SVG | null>(null);
  const draftRendererRef = useRef<L.SVG | null>(null);
  const lastFittedRouteIdRef = useRef<string | null>(null);

  // 1. Katman gruplarını başlat ve haritaya ekle
  useEffect(() => {
    if (!map) return;

    const pubLineGroup = L.layerGroup([], { pane: MAP_PANES.PUBLISHED_LINE }).addTo(map);
    const draftLineGroup = L.layerGroup([], { pane: MAP_PANES.DRAFT_LINE }).addTo(map);
    const draftStopsGroup = L.layerGroup([], { pane: MAP_PANES.DRAFT_STOPS }).addTo(map);
    const draftViasGroup = L.layerGroup([], { pane: MAP_PANES.DRAFT_VIAS }).addTo(map);
    const publishedRenderer = L.svg({ pane: MAP_PANES.PUBLISHED_LINE });
    const draftRenderer = L.svg({ pane: MAP_PANES.DRAFT_LINE });

    publishedRendererRef.current = publishedRenderer;
    draftRendererRef.current = draftRenderer;
    publishedLineGroupRef.current = pubLineGroup;
    draftLineGroupRef.current = draftLineGroup;
    draftStopsGroupRef.current = draftStopsGroup;
    draftViasGroupRef.current = draftViasGroup;

    return () => {
      pubLineGroup.remove();
      draftLineGroup.remove();
      draftStopsGroup.remove();
      draftViasGroup.remove();
      publishedRenderer.remove();
      draftRenderer.remove();

      publishedRendererRef.current = null;
      draftRendererRef.current = null;
      publishedLineGroupRef.current = null;
      draftLineGroupRef.current = null;
      draftStopsGroupRef.current = null;
      draftViasGroupRef.current = null;
    };
  }, [map]);

  // 2. Hat verisi değiştikçe katmanları senkronize et
  useEffect(() => {
    const pubLineGroup = publishedLineGroupRef.current;
    const draftLineGroup = draftLineGroupRef.current;
    const draftStopsGroup = draftStopsGroupRef.current;
    const draftViasGroup = draftViasGroupRef.current;
    const pubSvgRenderer = publishedRendererRef.current;
    const draftSvgRenderer = draftRendererRef.current;

    if (
      !map ||
      !pubLineGroup ||
      !draftLineGroup ||
      !draftStopsGroup ||
      !draftViasGroup ||
      !pubSvgRenderer ||
      !draftSvgRenderer
    ) {
      return;
    }

    pubLineGroup.clearLayers();
    draftLineGroup.clearLayers();

    const lineStyle: L.PolylineOptions = { ...DRAFT_LINE_STYLE, color: routeColor };
    // Kenarlık hattın renginin koyu tonudur (Google Maps tarzı ince, uyumlu kenar)
    const casingColor = darkenColor(routeColor);
    draftStopsGroup.clearLayers();
    draftViasGroup.clearLayers();

    // Çizgi üzerindeki işaret noktası ve süren sürükleme bu effect çalışmasına aittir;
    // temizlikte ikisi de sökülür (sürükleme ortasında veri değişse de harita kilitli kalmaz)
    let lineHandle: L.Marker | null = null;
    let endLineDrag: (() => void) | null = null;

    // Üzerine gelinen (ya da sürüklenen) bacak: hattın üstüne o bacağın koordinatlarından geçici, beyaz ve ince
    // bir parlama çizgisi eklenir; opaklığı CSS ile yanıp söner (.transit-leg-flash). Aynı renkte bir çizgi
    // altındaki hatla ayırt edilemezdi. Fare çıkınca kaldırılır; kalıcı bacak çizgisi yoktur.
    let highlightLine: L.Polyline | null = null;

    const unhighlightLeg = () => {
      highlightLine?.remove();
      highlightLine = null;
    };

    const highlightLeg = (latlngs: [number, number][]) => {
      unhighlightLeg();
      highlightLine = L.polyline(latlngs, {
        ...DRAFT_LINE_FLASH_STYLE,
        weight: widths.flash,
        renderer: draftSvgRenderer,
      }).addTo(draftLineGroup);
    };

    const removeLineHandle = () => {
      if (lineHandle) {
        lineHandle.remove();
        lineHandle = null;
      }
    };

    const showLineHandle = (latlng: L.LatLng) => {
      if (!lineHandle) {
        lineHandle = L.marker(latlng, {
          icon: createLineDragHandleIcon(routeColor),
          pane: MAP_PANES.DRAFT_VIAS,
          interactive: false,
          keyboard: false,
          zIndexOffset: 1500,
        }).addTo(map);
      } else {
        lineHandle.setLatLng(latlng);
      }
    };

    // Çizgi kalınlıkları zoom'a bağlıdır: bu çalışmada kurulan çizgiler zoom bitince yeniden boyutlanır
    let widths = routeLineWidths(map.getZoom());
    let publishedLine: L.Polyline | null = null;
    let pendingLine: L.Polyline | null = null;
    // Tek liste çizim: hattın tamamı tek kenarlık + tek çizgi; etkileşim bacak başına saydam yakalama çizgisinde
    const routeLines: { casing: L.Polyline; visible: L.Polyline }[] = [];
    const legHits: L.Polyline[] = [];

    const applyWidths = () => {
      widths = routeLineWidths(map.getZoom());
      publishedLine?.setStyle({ weight: widths.published, dashArray: widths.publishedDash });
      pendingLine?.setStyle({ weight: widths.pending });
      for (const { casing, visible } of routeLines) {
        casing.setStyle({ weight: widths.casing });
        visible.setStyle({ weight: widths.line });
      }
      for (const hit of legHits) hit.setStyle({ weight: widths.hit });
      highlightLine?.setStyle({ weight: widths.flash });
    };
    map.on('zoomend', applyWidths);

    const cleanup = () => {
      map.off('zoomend', applyWidths);
      endLineDrag?.();
      removeLineHandle();
      unhighlightLeg();
    };

    if (!routeId) {
      lastFittedRouteIdRef.current = null;
      return cleanup;
    }

    // --- A) Alt Katman: PUBLISHED Rota Çizgisi ---
    if (published?.navigation) {
      const pubCoords = toLatLngs(mergeLegCoordinates(published.navigation.legs).coords);
      if (pubCoords.length > 0) {
        publishedLine = L.polyline(pubCoords, {
          ...PUBLISHED_LINE_STYLE,
          weight: widths.published,
          dashArray: widths.publishedDash,
          renderer: pubSvgRenderer,
        });
        pubLineGroup.addLayer(publishedLine);
      }
    }

    // --- B) Üst Katman: Aktif hat (sıra: taslak ?? yayındaki; konumlar durak store'undan) ---
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

    if (!isAligned || !navigation) {
      // Hesap sürüyor ya da bacaklar tutarsız: kesikli tek çizgi, etkileşimsiz
      const draftCoords = navigation
        ? toLatLngs(mergeLegCoordinates(navigation.legs).coords)
        : activeRoute.stops.map((s) => [s.lat, s.lon] as [number, number]);

      if (draftCoords.length > 0) {
        pendingLine = L.polyline(draftCoords, {
          ...lineStyle,
          weight: widths.pending,
          opacity: 0.5,
          dashArray: '4, 6',
          interactive: false,
          renderer: draftSvgRenderer,
        });
        draftLineGroup.addLayer(pendingLine);
      }
    } else {
      // Hat tek liste olarak çizilir (aşağıda); her bacağın yalnızca saydam yakalama çizgisi ayrıdır
      const legCountBySegment = new Map<number, number>();
      for (const slot of slots) {
        legCountBySegment.set(slot.segmentIndex, (legCountBySegment.get(slot.segmentIndex) ?? 0) + 1);
      }

      // Basılı tutulan bacak çizgi boyunca sürüklenir; bırakınca via ya da durak eklenir
      const startLineDrag = (slot: LegSlot, onLine: L.LatLng, startPoint: L.Point) => {
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
          unhighlightLeg();
          removeLineHandle();
          endLineDrag = null;
        };
      };

      navigation.legs.forEach((leg, i) => {
        const slot = slots[i];
        const coords = leg.coordinates.map((c) => [c.lat, c.lon] as [number, number]);
        if (coords.length < 2) return;

        const hit = L.polyline(coords, {
          ...DRAFT_LINE_HIT_STYLE,
          weight: widths.hit,
          renderer: draftSvgRenderer,
        });
        legHits.push(hit);

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
          const closest = hit.closestLayerPoint(map.latLngToLayerPoint(latlng));
          return closest ? map.layerPointToLatLng(closest) : latlng;
        };

        hit.on('mouseover', () => {
          if (endLineDrag) return;
          highlightLeg(coords);
        });

        hit.on('mouseout', () => {
          if (endLineDrag) return;
          unhighlightLeg();
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
          highlightLeg(coords);
          showLineHandle(onLine);
          startLineDrag(slot, onLine, map.mouseEventToContainerPoint(e.originalEvent));
        });

      });

      // Katman sırası:
      // 1. Taban: bacaklar tek listede birleştirilir; tek kenarlık + tek çizgi. Tek SVG yolu kendi üstüne binen
      //    kısımları tek seferde boyar: bacak eklerinde iz, bölünmüş yolda iç içe şerit, koyulaşma olmaz.
      // 2. Ortak yol: rotanın gerçekten kendi üstünden geçtiği kısımlar ikinci geçiş olarak kenarlığıyla yeniden
      //    çizilir (uçlar düz kesik); ortak yola giriş ve çıkış noktaları kenarlıkla seçilir.
      // 3. En üstte bacak başına saydam yakalama çizgileri (vurgu çizgisi gerektiğinde bunların da üstüne eklenir).
      const merged = mergeLegCoordinates(navigation.legs);
      const addRouteLine = (latlngs: [number, number][], casingStyle: L.PolylineOptions, lineCap?: L.LineCapShape) => {
        const casing = L.polyline(latlngs, {
          ...casingStyle,
          color: casingColor,
          weight: widths.casing,
          renderer: draftSvgRenderer,
        });
        const visible = L.polyline(latlngs, {
          ...lineStyle,
          weight: widths.line,
          ...(lineCap ? { lineCap } : {}),
          interactive: false,
          renderer: draftSvgRenderer,
        });
        routeLines.push({ casing, visible });
        draftLineGroup.addLayer(casing);
        draftLineGroup.addLayer(visible);
      };

      addRouteLine(toLatLngs(merged.coords), DRAFT_LINE_CASING_STYLE);
      for (const part of findSelfOverlaps(merged.coords)) {
        addRouteLine(toLatLngs(part), DRAFT_LINE_OVERLAP_CASING_STYLE, 'butt');
      }

      for (const hit of legHits) draftLineGroup.addLayer(hit);
    }

    // 3. Aktif Hat Durak Pinleri (Sürüklenebilir; sağ tıkla hattan çıkarılır)
    const { setHighlightedStopId, setDraggingStopId } = useMapHighlightStore.getState();
    activeRoute.stops.forEach((stop, index) => {
      const isTerminal = isTerminalStop(stop);
      const marker = L.marker([stop.lat, stop.lon], {
        icon: createRouteStopIcon(index + 1, isTerminal, routeColor, routeTextColor),
        pane: MAP_PANES.DRAFT_STOPS,
        draggable: true,
      });

      marker.bindTooltip(
        `<div style="font-family: sans-serif; font-size: 11px;">
          <strong>#${index + 1}</strong> ${stop.stopId} - ${stop.stopName}
          <div style="color: #f87171; font-size: 10px; margin-top: 2px;">Sağ tık: hattan çıkar</div>
        </div>`,
        { direction: 'top', offset: [0, -12] }
      );

      // Sağ tık: durak hattan çıkar (yalnızca bu sıra; durağın kendisi ve diğer hatlar değişmez). Ctrl+Z ile geri alınır
      marker.on('contextmenu', (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e.originalEvent);
        setHighlightedStopId(null);
        removeStopIntent(index);
      });

      // Üzerine gelince aynı id'li hayalet ve şehir noktası yanıp söner (durak katmanı çizer)
      marker.on('mouseover', () => setHighlightedStopId(stop.stopId));
      marker.on('mouseout', () => setHighlightedStopId(null));

      // Sürükleme boyunca baloncuk ve yanıp sönme gösterilmez; durak katmanı şehir noktasını gizleyip
      // published konumunu hayalet olarak gösterir
      marker.on('dragstart', () => {
        marker.unbindTooltip();
        setHighlightedStopId(null);
        setDraggingStopId(stop.stopId);
      });

      // Pin durağın kendisidir: taşımak durak taslağına yazar (hayalet, etkilenen hatlar, diğer hatlar, geri al)
      marker.on('dragend', (e) => {
        const target = e.target as L.Marker;
        const { lat, lng } = target.getLatLng();
        setDraggingStopId(null);
        useStopDraftStore.getState().moveStop(stop.stopId, lat, lng);
      });

      draftStopsGroup.addLayer(marker);
    });

    // 4. Aktif Hat Via Tutamaçları (Sürüklenebilir & Mıknatıslı)
    activeRoute.vias.forEach((via) => {
      const viaMarker = L.marker([via.lat, via.lon], {
        icon: createViaHandleIcon(routeColor),
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
    activeRoute,
    isRouting,
    routeColor,
    routeTextColor,
    addStopIntent,
    removeStopIntent,
    addViaIntent,
    moveViaIntent,
    removeViaIntent,
    snapViaIntent,
  ]);

  // 3. Seçili hattın numaralı hayaletleri. Hayaletin varlığı durak store'undan gelir (draft konumu
  // published'dan farklı ya da durak şu an sürükleniyor); hat katmanı yalnızca sıra numarasını ekler.
  // Ayrı effect'tir: sürükleme durumu değişince hat pinleri yeniden kurulmaz (sürükleme kopmaz).
  const publishedStops = useStopDraftStore((state) => state.published);
  const draggingStopId = useMapHighlightStore((state) => state.draggingStopId);

  useEffect(() => {
    if (!map || !routeId) return;
    const group = L.layerGroup([], { pane: MAP_PANES.PUBLISHED_STOPS }).addTo(map);

    activeRoute?.stops.forEach((stop, index) => {
      const original = publishedStops[stop.stopId];
      if (!original) return;
      const moved = original.lat !== stop.lat || original.lon !== stop.lon;
      if (!moved && stop.stopId !== draggingStopId) return;
      group.addLayer(
        L.marker([original.lat, original.lon], {
          icon: createGhostStopIcon(index + 1),
          pane: MAP_PANES.PUBLISHED_STOPS,
          interactive: false,
          keyboard: false,
        })
      );
    });

    return () => {
      group.remove();
    };
  }, [map, routeId, activeRoute, publishedStops, draggingStopId]);

  // 4. Fark baloncukları: taslağın yayındakinden ayrıştığı her bölgede (ortak duraklar arası) taslak çizgi
  // üzerinde kalıcı baloncuk. Taslağın mesafe/süresi ve parantez içinde farkı gösterir. Mesafe ve süresi
  // yayındakiyle birebir aynı olan bölge gösterilmez. Rota hesabı ya da durak sürüklemesi sürerken gizlenir.
  // Boyut zoom'a göre ölçeklenir (pane üzerindeki CSS değişkeni; baloncuklar yeniden kurulmaz).
  useEffect(() => {
    if (!map) return;
    const pane = map.getPane(MAP_PANES.DIFF_BUBBLES);
    if (!pane) return;
    const applyScale = (zoom: number) => {
      pane.style.setProperty(DIFF_BUBBLE_SCALE_VAR, String(diffBubbleScale(zoom)));
    };
    // Animasyonlu zoom'da hedef zoom baştan bilinir: ölçek, konumla aynı sürede (CSS geçişi) değişir.
    // Animasyonsuz zoom (sıkıştırma, kesirli adım) için zoom sonunda da uygulanır.
    const handleZoomAnim = (e: L.ZoomAnimEvent) => applyScale(e.zoom);
    const handleZoomEnd = () => applyScale(map.getZoom());
    applyScale(map.getZoom());
    map.on('zoomanim', handleZoomAnim);
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('zoomanim', handleZoomAnim);
      map.off('zoomend', handleZoomEnd);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !routeId || !published || !activeRoute || isRouting || draggingStopId) return;

    const regions = diffRoutes(activeRoute, published).filter(
      (r) => r.draft.distance !== r.published.distance || r.draft.duration !== r.published.duration
    );
    if (regions.length === 0) return;

    const group = L.layerGroup([], { pane: MAP_PANES.DIFF_BUBBLES }).addTo(map);
    for (const region of regions) {
      const distanceDelta = region.draft.distance - region.published.distance;
      const durationDelta = region.draft.duration - region.published.duration;
      const icon = createDiffBubbleIcon(
        {
          value: formatDistance(region.draft.distance),
          delta: formatDistanceDelta(distanceDelta),
          increased: distanceDelta > 0,
        },
        {
          value: formatDuration(region.draft.duration),
          delta: formatDurationDelta(durationDelta),
          increased: durationDelta > 0,
        },
        DIFF_INCREASE_COLOR,
        DIFF_DECREASE_COLOR
      );
      group.addLayer(
        L.marker([region.anchor.lat, region.anchor.lon], {
          icon,
          pane: MAP_PANES.DIFF_BUBBLES,
          interactive: false,
          keyboard: false,
        })
      );
    }

    return () => {
      group.remove();
    };
  }, [map, routeId, published, activeRoute, isRouting, draggingStopId]);
}
