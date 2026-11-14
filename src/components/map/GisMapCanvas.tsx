import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ESRI_LIGHT_GRAY_TILE,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from './mapConfig';
import { initializeMapPanes } from './mapPanes';
import { addBasemap } from './basemap';
import { useAddStopMode } from './useAddStopMode';
import { useStopsMapSync } from './useStopsMapSync';
import { useRouteMapSync } from './useRouteMapSync';
import { MAP_FOCUS_EVENT, type MapFocusDetail } from './mapEvents';

export const GisMapCanvas: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // Harita motorunu tek seferlik (Singleton) mount et
    const map = L.map(container, {
      center: [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng],
      zoom: DEFAULT_MAP_ZOOM,
      maxZoom: ESRI_LIGHT_GRAY_TILE.maxZoom,
      zoomControl: false,
      preferCanvas: true,
      // Kademeli zoom: tekerlek ve +/- yarım seviye, kesirli seviyelere oturur (tam seviye zıplaması yok)
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
    });

    // 1. Özel Katman Düzlemlerini (Custom Panes) Başlat
    initializeMapPanes(map);

    // 2. Altlık: OSRM ile aynı veriden üretilen yerel OSM altlığı (yoksa Esri gri)
    const removeBasemap = addBasemap(map);

    // 3. Zoom Kontrollerini Sağ Üste Al
    L.control.zoom({ position: 'topright' }).addTo(map);

    setMapInstance(map);

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      window.clearTimeout(resizeTimer);
      removeBasemap();
      map.remove();
      setMapInstance(null);
    };
  }, []);

  // 4. Adaptör Hook'ları: Haritayı Zustand Store'larıyla Konuştur (Imperative Adapter)
  useStopsMapSync(mapInstance);
  useRouteMapSync(mapInstance);
  useAddStopMode(mapInstance);

  // 5. Harita Odaklanma Olayı Dinleyicisi
  useEffect(() => {
    if (!mapInstance) return;

    const handleFocus = (event: Event) => {
      const customEvent = event as CustomEvent<MapFocusDetail>;
      if (customEvent.detail) {
        const { lat, lon, zoom = 16 } = customEvent.detail;
        mapInstance.flyTo([lat, lon], zoom, { duration: 0.6 });
      }
    };

    window.addEventListener(MAP_FOCUS_EVENT, handleFocus);
    return () => {
      window.removeEventListener(MAP_FOCUS_EVENT, handleFocus);
    };
  }, [mapInstance]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainerRef} className="w-full h-full bg-slate-950" />
    </div>
  );
};
