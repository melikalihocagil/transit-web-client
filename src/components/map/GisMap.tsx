import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

export const GisMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);

  // Katman & Etkileşim Referansları
  const livePolylineRef = useRef<L.Polyline | null>(null);
  const draftPolylineRef = useRef<L.Polyline | null>(null);
  const draftSegmentsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const stopsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const realPointsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const hoverGhostMarkerRef = useRef<L.Marker | null>(null);
  const lastFittedRouteIdRef = useRef<string | null>(null);
  const isInternalGeomanEditRef = useRef<boolean>(false);
  const markersBySequenceRef = useRef<Map<number, L.Marker>>(new Map());
  const isDraggingLineRef = useRef<boolean>(false);
  const activeDragCleanupRef = useRef<(() => void) | null>(null);
  const lastLineDragEndTimeRef = useRef<number>(0);

  const {
    selectedRouteId,
    liveShapes,
    draftShapes,
    draftLegs,
    draftWaypoints,
    routingMode,
    activeTool,
    moveStop,
    addStopOnMap,
    deleteStop,
    moveViaPoint,
    deleteViaPoint,
    updateDraftShapes,
    mapFocusTarget,
  } = useWorkspaceStore();

  // 1. Harita İlk Yükleme (Mount)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Erzurum Merkez Koordinatları (Doğu Anadolu Ulaşım Ağı)
    const mapInstance = L.map(mapContainerRef.current, {
      center: [39.9055, 41.2658],
      zoom: 13,
      zoomControl: false,
      doubleClickZoom: false, // Çift tıklama yakınlaştırmasını kapat (GIS düzenlemede istenmeyen zoom'u engeller)
      boxZoom: false,         // Shift ile kutu çizip yakınlaştırmayı kapat
      scrollWheelZoom: true,
    });

    // Zoom kontrolü sağ üste
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);

    // Standart Açık Gri Filtreli OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapInstance);

    // Geoman Araç Ayarları (Serbest Manuel Çizim Modu İçin)
    mapInstance.pm.setGlobalOptions({
      allowSelfIntersection: true,
      snappable: true,
      snapDistance: 20,
    });

    // Katman Grupları
    stopsLayerGroupRef.current = L.layerGroup().addTo(mapInstance);
    realPointsLayerGroupRef.current = L.layerGroup().addTo(mapInstance);
    draftSegmentsLayerGroupRef.current = L.layerGroup().addTo(mapInstance);

    // Boyut kalibrasyonu
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 150);

    setMap(mapInstance);

    return () => {
      livePolylineRef.current = null;
      draftPolylineRef.current?.pm?.disable();
      draftPolylineRef.current = null;
      stopsLayerGroupRef.current = null;
      realPointsLayerGroupRef.current = null;
      draftSegmentsLayerGroupRef.current = null;
      if (hoverGhostMarkerRef.current) {
        hoverGhostMarkerRef.current.remove();
        hoverGhostMarkerRef.current = null;
      }
      if (activeDragCleanupRef.current) {
        activeDragCleanupRef.current();
        activeDragCleanupRef.current = null;
      }
      lastFittedRouteIdRef.current = null;
      mapInstance.remove();
      setMap(null);
    };
  }, []);

  // 2. Otomatik Kadraj (FitBounds) - Yeni hat seçildiğinde 1 kez çalışır
  useEffect(() => {
    if (!map || draftShapes.length === 0 || !selectedRouteId) return;

    if (lastFittedRouteIdRef.current === selectedRouteId) {
      return;
    }

    try {
      const bounds = L.latLngBounds(draftShapes.map((s) => [s.lat, s.lon]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        lastFittedRouteIdRef.current = selectedRouteId;
      }
    } catch (err) {
      console.warn('Harita kadrajı ayarlanamadı:', err);
    }
  }, [map, selectedRouteId, draftShapes]);

  // 3. Canlı Hat (Kırmızı Kesikli Çizgi) Güncellemesi
  useEffect(() => {
    if (!map) return;

    const latlngs: L.LatLngTuple[] = liveShapes.map((s) => [s.lat, s.lon]);

    if (livePolylineRef.current) {
      livePolylineRef.current.setLatLngs(latlngs);
    } else {
      livePolylineRef.current = L.polyline(latlngs, {
        color: '#ef4444', // Kırmızı
        weight: 3.5,
        opacity: 0.65,
        dashArray: '8, 8',
        interactive: false,
      }).addTo(map);
    }
  }, [map, liveShapes]);

  // 4. Taslak Hat ve Segmentler Yönetimi (Tamamen Çizgi / Segment Bazlı)
  useEffect(() => {
    if (!map || !draftSegmentsLayerGroupRef.current) return;
    const segmentsGroup = draftSegmentsLayerGroupRef.current;
    segmentsGroup.clearLayers();

    if (routingMode === 'auto') {
      // Manuel mod polyline'ını devre dışı bırak ve kaldır
      if (draftPolylineRef.current) {
        if (draftPolylineRef.current.pm?.enabled()) {
          draftPolylineRef.current.pm.disable();
        }
        draftPolylineRef.current.remove();
        draftPolylineRef.current = null;
      }

      // Her bir OSRM leg'i (W_k -> W_{k+1}) bağımsız bir segment polyline olarak çizilir
      draftLegs.forEach((leg) => {
        const segLatLngs: L.LatLngTuple[] = leg.coords.map((c) => [c.lat, c.lon]);
        if (segLatLngs.length < 2) return;

        const segLine = L.polyline(segLatLngs, {
          color: '#2563eb', // Mavi
          weight: 6,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'route-segment-polyline',
        }).addTo(segmentsGroup);

        // Segment üzerinde gezinirken hayalet nokta önizlemesi
        segLine.on('mousemove', (e: L.LeafletMouseEvent) => {
          if (isDraggingLineRef.current) return;
          const currentMode = useWorkspaceStore.getState().routingMode;
          if (currentMode !== 'auto') {
            if (hoverGhostMarkerRef.current) {
              hoverGhostMarkerRef.current.remove();
              hoverGhostMarkerRef.current = null;
            }
            return;
          }

          if (!hoverGhostMarkerRef.current) {
            const hoverIcon = L.divIcon({
              className: 'custom-div-icon',
              html: '<div class="hover-ghost-marker"></div>',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });
            hoverGhostMarkerRef.current = L.marker(e.latlng, {
              icon: hoverIcon,
              interactive: false,
            }).addTo(map);
          } else {
            hoverGhostMarkerRef.current.setLatLng(e.latlng);
          }
        });

        segLine.on('mouseout', () => {
          if (isDraggingLineRef.current) return;
          if (hoverGhostMarkerRef.current) {
            hoverGhostMarkerRef.current.remove();
            hoverGhostMarkerRef.current = null;
          }
        });

        // Çizgiye basıldığında (mousedown): Tek hamlede tıkla-oluştur veya basılı tut-sürükle!
        segLine.on('mousedown', (e: L.LeafletMouseEvent) => {
          if (e.originalEvent.button !== 0) return; // Yalnızca sol tık
          L.DomEvent.stopPropagation(e.originalEvent);
          L.DomEvent.preventDefault(e.originalEvent);

          const currentMode = useWorkspaceStore.getState().routingMode;
          if (currentMode !== 'auto') return;

          // Varsa önceki yarım kalmış sürüklemeyi temizle
          if (activeDragCleanupRef.current) {
            activeDragCleanupRef.current();
            activeDragCleanupRef.current = null;
          }

          isDraggingLineRef.current = true;
          document.body.style.cursor = 'grabbing';

          if (hoverGhostMarkerRef.current) {
            hoverGhostMarkerRef.current.remove();
            hoverGhostMarkerRef.current = null;
          }

          map.dragging.disable();

          const startLatLng = e.latlng;
          const fromCoord: L.LatLngTuple = [leg.coords[0].lat, leg.coords[0].lon];
          const toCoord: L.LatLngTuple = [leg.coords[leg.coords.length - 1].lat, leg.coords[leg.coords.length - 1].lon];

          // Orijinal segmenti hafifçe silikleştir
          segLine.setStyle({ opacity: 0.35 });

          // Sürüklenen noktayı komşu iki waypoint'e bağlayan elastik kılavuz çizgisi
          const elasticLine = L.polyline([fromCoord, [startLatLng.lat, startLatLng.lng], toCoord], {
            color: '#3b82f6',
            dashArray: '5, 5',
            weight: 2.5,
            opacity: 0.9,
            interactive: false,
          }).addTo(map);

          const state = useWorkspaceStore.getState();
          const isAddStop = state.activeTool === 'add_stop';

          // Anında beliren ve imlece kilitlenen aktif nokta
          const activeIcon = L.divIcon({
            className: 'custom-div-icon',
            html: isAddStop
              ? '<div class="stop-badge-marker new-stop" style="width:24px;height:24px;font-size:12px;">+</div>'
              : '<div class="active-drag-via-marker"></div>',
            iconSize: isAddStop ? [24, 24] : [16, 16],
            iconAnchor: isAddStop ? [12, 12] : [8, 8],
          });

          const activeMarker = L.marker(startLatLng, {
            icon: activeIcon,
            interactive: false,
            zIndexOffset: 1000,
          }).addTo(map);

          let currentLatLng = startLatLng;

          const onWindowMouseMove = (moveEvt: MouseEvent) => {
            try {
              const pt = map.mouseEventToLatLng(moveEvt);
              if (pt && !isNaN(pt.lat) && !isNaN(pt.lng)) {
                currentLatLng = pt;
                activeMarker.setLatLng(pt);
                elasticLine.setLatLngs([fromCoord, [pt.lat, pt.lng], toCoord]);
              }
            } catch {
              // Harita sınırları dışı hesaplama koruması
            }
          };

          const cleanup = () => {
            window.removeEventListener('mousemove', onWindowMouseMove);
            window.removeEventListener('mouseup', onWindowMouseUp);
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.cursor = '';
            map.dragging.enable();
            isDraggingLineRef.current = false;
            activeMarker.remove();
            elasticLine.remove();
            segLine.setStyle({ opacity: 0.85 });
          };

          const onKeyDown = (keyEvt: KeyboardEvent) => {
            if (keyEvt.key === 'Escape') {
              cleanup();
              activeDragCleanupRef.current = null;
            }
          };

          const onWindowMouseUp = async (upEvt: MouseEvent) => {
            cleanup();
            activeDragCleanupRef.current = null;
            lastLineDragEndTimeRef.current = Date.now();

            let finalLatLng = currentLatLng;
            try {
              const pt = map.mouseEventToLatLng(upEvt);
              if (pt && !isNaN(pt.lat) && !isNaN(pt.lng)) {
                finalLatLng = pt;
              }
            } catch {
              // fallback
            }

            const latestState = useWorkspaceStore.getState();
            if (latestState.routingMode !== 'auto') return;

            if (latestState.activeTool === 'add_stop') {
              await latestState.addStopOnSegment(leg.fromIndex, finalLatLng.lat, finalLatLng.lng);
            } else {
              await latestState.addViaPointOnSegment(leg.fromIndex, finalLatLng.lat, finalLatLng.lng);
            }
          };

          activeDragCleanupRef.current = cleanup;
          window.addEventListener('mousemove', onWindowMouseMove);
          window.addEventListener('mouseup', onWindowMouseUp, { once: true });
          window.addEventListener('keydown', onKeyDown);
        });

        // Çizgi tıklamasının harita tıklamasına sızmasını engelle
        segLine.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
        });
      });
    } else {
      // Manuel Çizim Modu: Serbest Geoman polylinesi
      if (hoverGhostMarkerRef.current) {
        hoverGhostMarkerRef.current.remove();
        hoverGhostMarkerRef.current = null;
      }

      if (isInternalGeomanEditRef.current) {
        isInternalGeomanEditRef.current = false;
        return;
      }

      const latlngs: L.LatLngTuple[] = draftShapes.map((s) => [s.lat, s.lon]);

      if (!draftPolylineRef.current) {
        const line = L.polyline(latlngs, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
        }).addTo(map);

        line.on('pm:markerdragend pm:vertexadded pm:vertexremoved', () => {
          const currentMode = useWorkspaceStore.getState().routingMode;
          if (currentMode === 'manual') {
            isInternalGeomanEditRef.current = true;
            const currentLatLngs = line.getLatLngs() as L.LatLng[];
            updateDraftShapes(currentLatLngs.map((pt) => ({ lat: pt.lat, lon: pt.lng })));
          }
        });

        draftPolylineRef.current = line;
      } else {
        draftPolylineRef.current.setLatLngs(latlngs);
      }

      if (!draftPolylineRef.current.pm?.enabled()) {
        draftPolylineRef.current.pm.enable({
          allowSelfIntersection: true,
        });
      }
    }

    return () => {
      if (activeDragCleanupRef.current) {
        activeDragCleanupRef.current();
        activeDragCleanupRef.current = null;
      }
    };
  }, [map, draftLegs, draftShapes, routingMode, updateDraftShapes]);

  // 5. Gerçek Kilit Noktaları (is_via_point = true / stopId == null olan noktalar)
  useEffect(() => {
    if (!map || !realPointsLayerGroupRef.current) return;
    const layerGroup = realPointsLayerGroupRef.current;
    layerGroup.clearLayers();

    if (routingMode !== 'auto') return;

    const viaWaypoints = draftWaypoints.filter((w) => w.stopId == null);

    viaWaypoints.forEach((vp) => {
      const viaId = `via-${vp.sequence}`;
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div class="real-point-marker" title="Via Kilit Noktası - Sürükleyerek caddeyi değiştirin veya sağ tıklayarak silin"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      const marker = L.marker([vp.lat, vp.lon], {
        icon,
        draggable: true,
        autoPan: false,
      });

      marker.on('click', () => {
        useWorkspaceStore.getState().setFocusedWaypointSequence(vp.sequence);
      });

      marker.on('dragstart', () => {
        map.dragging.disable();
      });

      marker.on('dragend', async (e) => {
        map.dragging.enable();
        const newPos = e.target.getLatLng();
        await moveViaPoint(viaId, newPos.lat, newPos.lng);
      });

      // Tıklanınca silme popup'ı
      const popupDiv = document.createElement('div');
      popupDiv.className = 'text-xs p-1 space-y-1.5 min-w-[140px]';
      popupDiv.innerHTML = `
        <div class="font-bold text-slate-900">Via Kilit Noktası (Sıra: ${vp.sequence})</div>
        <div class="text-[10px] text-slate-500 font-mono">${vp.lat.toFixed(5)}, ${vp.lon.toFixed(5)}</div>
      `;
      const removeBtn = document.createElement('button');
      removeBtn.className =
        'w-full mt-1.5 py-1 px-2 bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-[10px] rounded border border-red-200 cursor-pointer';
      removeBtn.textContent = 'Kilit Noktasını Kaldır';
      removeBtn.onclick = () => {
        deleteViaPoint(viaId);
      };
      popupDiv.appendChild(removeBtn);
      marker.bindPopup(popupDiv, { autoPan: false });

      // Sağ tıklama (contextmenu) ile hızlı kaldırma
      marker.on('contextmenu', (e) => {
        L.DomEvent.stopPropagation(e);
        deleteViaPoint(viaId);
      });

      layerGroup.addLayer(marker);
      markersBySequenceRef.current.set(vp.sequence, marker);
    });
  }, [map, draftWaypoints, routingMode, moveViaPoint, deleteViaPoint]);


  // 7. Durak Marker'ları (HTML DivIcon & Sürükleme) Güncellemesi
  useEffect(() => {
    if (!map || !stopsLayerGroupRef.current) return;
    const layerGroup = stopsLayerGroupRef.current;
    layerGroup.clearLayers();

    const stopWaypoints = draftWaypoints.filter((w) => w.stopId != null);
    if (stopWaypoints.length === 0) return;

    // Ring Hat Kontrolü: 1. ve N. durak aynı ise tekil birleşik terminal hub marker'ı oluştur
    const firstWp = draftWaypoints[0];
    const lastWp = draftWaypoints[draftWaypoints.length - 1];
    const isRingTerminalHub =
      firstWp?.stopId != null &&
      lastWp?.stopId != null &&
      firstWp.stopId === lastWp.stopId &&
      draftWaypoints.length > 1;

    stopWaypoints.forEach((stop) => {
      // Eğer ring hattın son durağı ise ve 1. durak ile birleştirilmişse, mükerrer marker çizme
      if (isRingTerminalHub && stop.sequence === lastWp.sequence) {
        return;
      }

      const isHub = isRingTerminalHub && stop.sequence === firstWp.sequence;
      const isStation = stop.locationType === 1 || isHub;

      let icon: L.DivIcon;
      if (isHub) {
        // Birleşik Terminal Hub Marker'ı (Kompakt 26x26px Piktogram Pini)
        icon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div class="terminal-hub-marker" title="${firstWp.name || 'Sevk İdare Merkezi'} (Kalkış & Varış Noktası)">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
                <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
                <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
                <path d="M10 6h4"/>
                <path d="M10 10h4"/>
                <path d="M10 14h4"/>
                <path d="M10 18h4"/>
              </svg>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
      } else if (isStation) {
        // Ara İstasyon / Terminal Marker
        icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div class="station-marker" style="width: 26px; height: 26px;" title="İstasyon / Sevk İdare">${stop.sequence}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
      } else {
        // Standart Yolcu Durağı Marker
        icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div class="stop-badge-marker" style="width: 24px; height: 24px;">${stop.sequence}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
      }

      const marker = L.marker([stop.lat, stop.lon], {
        icon,
        draggable: true,
        autoPan: false,
      });

      marker.on('click', () => {
        useWorkspaceStore.getState().setFocusedWaypointSequence(stop.sequence);
      });

      marker.on('dragstart', () => {
        map.dragging.disable();
      });

      marker.on('dragend', (e) => {
        map.dragging.enable();
        const newLatLng = e.target.getLatLng();
        moveStop(stop.sequence, newLatLng.lat, newLatLng.lng);
      });

      // Hover durumunda zarif tooltip
      if (isHub) {
        marker.bindTooltip(
          `<div class="text-xs font-semibold py-0.5">🏛️ ${firstWp.name || 'Sevk İdare Merkezi'}<div class="text-[10px] text-amber-500 font-normal">Kalkış & Varış Noktası (1 & ${lastWp.sequence})</div></div>`,
          { direction: 'top', offset: [0, -13], opacity: 0.95 }
        );
      }

      const popupContent = document.createElement('div');
      popupContent.className = 'text-xs p-1 space-y-1.5 min-w-[170px]';

      if (isHub) {
        popupContent.innerHTML = `
          <div class="font-bold text-amber-800 flex items-center justify-between">
            <span>🏛️ ${stop.name || 'Sevk İdare Merkezi'}</span>
          </div>
          <div class="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">
            <strong>Hat Terminali (Sevk İdare)</strong><br />
            1. Kalkış ve ${lastWp.sequence}. Varış noktası bu merkezdedir.
          </div>
          <div class="text-[10px] text-slate-500 font-mono">${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}</div>
        `;
      } else {
        popupContent.innerHTML = `
          <div class="font-bold text-slate-900 flex items-center justify-between">
            <span>${stop.sequence}. ${stop.name || 'İsimsiz Durak'}</span>
            ${isStation ? '<span class="text-[9px] bg-amber-100 text-amber-800 px-1 rounded">İstasyon</span>' : ''}
          </div>
          <div class="text-[10px] text-slate-500 font-mono">${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}</div>
        `;
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className =
        'w-full mt-2 py-1 px-2 bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-[10px] rounded border border-red-200 cursor-pointer';
      deleteBtn.textContent = isHub ? 'Terminal Durağını Kaldır' : 'Durağı Kaldır';
      deleteBtn.onclick = () => {
        deleteStop(stop.sequence);
      };
      popupContent.appendChild(deleteBtn);

      marker.bindPopup(popupContent, { autoPan: false });
      layerGroup.addLayer(marker);

      if (isHub) {
        markersBySequenceRef.current.set(firstWp.sequence, marker);
        markersBySequenceRef.current.set(lastWp.sequence, marker);
      } else {
        markersBySequenceRef.current.set(stop.sequence, marker);
      }
    });
  }, [map, draftWaypoints, moveStop, deleteStop]);

  // 7.1. Sol Listeden Tıklanan Durağa Haritada Odaklanma (Pan/FlyTo & Popup Açma)
  useEffect(() => {
    if (!map || !mapFocusTarget) return;

    const targetZoom = Math.max(map.getZoom(), 16);
    map.flyTo([mapFocusTarget.lat, mapFocusTarget.lon], targetZoom, {
      duration: 0.6,
    });

    const marker = markersBySequenceRef.current.get(mapFocusTarget.sequence);
    if (marker) {
      const timer = setTimeout(() => {
        marker.openPopup();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [map, mapFocusTarget]);

  // 8. Harita Tıklama Eylemi (Yalnızca Durak Ekleme Aktifken)
  useEffect(() => {
    if (!map) return;

    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      if (Date.now() - lastLineDragEndTimeRef.current < 300) return;
      const { lat, lng } = e.latlng;
      if (activeTool === 'add_stop') {
        await addStopOnMap(lat, lng);
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, activeTool, addStopOnMap]);

  return (
    <div className="relative w-full h-full">
      {/* Harita Tuvali */}
      <div ref={mapContainerRef} className="w-full h-full bg-slate-100 z-10" />

      {/* Aktif Araç Bildirim İpucu (Yalnızca Durak Ekleme Modunda Gösterilir) */}
      {activeTool === 'add_stop' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-emerald-950/90 text-emerald-200 border border-emerald-500/50 px-4 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
          <span>
            {draftWaypoints.filter((w) => w.stopId != null).length === 0
              ? 'Haritada 1. başlangıç durağının yerine tıklayın'
              : `${draftWaypoints.filter((w) => w.stopId != null).length + 1}. durağı eklemek için haritaya tıklayın (OSRM cadde güzergahını otomatik çizecektir)`}
          </span>
        </div>
      )}
    </div>
  );
};
