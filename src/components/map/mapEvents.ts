export interface MapFocusDetail {
  lat: number;
  lon: number;
  zoom?: number;
}

export const MAP_FOCUS_EVENT = 'transit:map-focus';

/**
 * Haritayı belirli bir koordinata yumuşakça odaklar (flyTo).
 */
export function focusMapCoordinate(lat: number, lon: number, zoom = 17): void {
  window.dispatchEvent(
    new CustomEvent<MapFocusDetail>(MAP_FOCUS_EVENT, {
      detail: { lat, lon, zoom },
    })
  );
}
