import * as turf from '@turf/turf';
import type { RouteLeg, RouteWaypointDto, ShapePoint, StopItem, ViaPointItem } from '../types/gtfs';
import type { PreFlightCheckResult } from '../types/worksheet';

/**
 * Calculates distance between two coordinates in meters using Haversine formula.
 */
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const from = turf.point([lon1, lat1]);
  const to = turf.point([lon2, lat2]);
  return turf.distance(from, to, { units: 'meters' });
}

/**
 * Re-indexes a list of coordinates into a GTFS compliant ShapePoint array.
 * Sets sequence from 1 to N and calculates cumulative distTraveled in meters.
 */
export function recalculateShapeSequence(coords: Array<{ lat: number; lon: number }>): ShapePoint[] {
  let cumulativeDist = 0;
  return coords.map((pt, idx) => {
    if (idx > 0) {
      const prev = coords[idx - 1];
      cumulativeDist += getDistanceMeters(prev.lat, prev.lon, pt.lat, pt.lon);
    }
    return {
      sequence: idx + 1,
      lat: Number(pt.lat.toFixed(6)),
      lon: Number(pt.lon.toFixed(6)),
      distTraveled: Math.round(cumulativeDist * 10) / 10,
    };
  });
}

/**
 * Simplifies a coordinate path by removing redundant points along straight roads.
 * Prevents over-dense vertex clusters while preserving actual curves and corners.
 */
export function simplifyShape(
  coords: Array<{ lat: number; lon: number }>,
  toleranceMeters: number = 2.5
): Array<{ lat: number; lon: number }> {
  if (coords.length <= 4) return coords;

  try {
    const line = turf.lineString(coords.map((c) => [c.lon, c.lat]));
    // Convert meters to approximate degree tolerance (~111,320m per degree)
    const degreeTolerance = toleranceMeters / 111320;
    const simplified = turf.simplify(line, { tolerance: degreeTolerance, highQuality: true });
    const simplifiedCoords = simplified.geometry.coordinates as [number, number][];

    return simplifiedCoords.map(([lon, lat]) => ({
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
    }));
  } catch {
    return coords;
  }
}

/**
 * Finds the index of the closest point in a ShapePoint array to a given coordinate.
 */
export function findNearestShapeIndex(
  point: { lat: number; lon: number },
  shapes: ShapePoint[]
): number {
  if (shapes.length === 0) return 0;
  let minDistance = Infinity;
  let bestIndex = 0;

  for (let i = 0; i < shapes.length; i++) {
    const dist = getDistanceMeters(point.lat, point.lon, shapes[i].lat, shapes[i].lon);
    if (dist < minDistance) {
      minDistance = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Splices a newly calculated local segment into the full route shape.
 * Replaces the range [fromIdx, toIdx] while keeping the rest of the route 100% untouched.
 */
export function spliceShapeSegment(
  originalShapes: ShapePoint[],
  fromIdx: number,
  toIdx: number,
  newSegmentCoords: Array<{ lat: number; lon: number }>
): ShapePoint[] {
  if (originalShapes.length === 0) {
    return recalculateShapeSequence(newSegmentCoords);
  }

  const start = Math.max(0, Math.min(fromIdx, toIdx));
  const end = Math.min(originalShapes.length - 1, Math.max(fromIdx, toIdx));

  const prefix = originalShapes.slice(0, start);
  const suffix = originalShapes.slice(end + 1);

  const combined = [
    ...prefix.map((s) => ({ lat: s.lat, lon: s.lon })),
    ...newSegmentCoords,
    ...suffix.map((s) => ({ lat: s.lat, lon: s.lon })),
  ];

  return recalculateShapeSequence(combined);
}

/**
 * Verilen bir koordinatın draftLegs içerisindeki hangi gerçek OSRM asfalt segmentine (leg)
 * en yakın olduğunu hesaplar. (Yalnızca harita boşluğuna tıklandığında kullanılır)
 */
export function findNearestLegIndex(
  newCoord: { lat: number; lon: number },
  legs: RouteLeg[]
): number {
  if (legs.length === 0) return 0;
  if (legs.length === 1) return legs[0].fromIndex;

  const targetPoint = turf.point([newCoord.lon, newCoord.lat]);
  let bestLegIndex = legs[0].fromIndex;
  let minDistance = Infinity;

  for (const leg of legs) {
    if (leg.coords.length < 2) continue;
    try {
      const line = turf.lineString(leg.coords.map((c) => [c.lon, c.lat]));
      const dist = turf.pointToLineDistance(targetPoint, line, { units: 'meters' });
      if (dist < minDistance) {
        minDistance = dist;
        bestLegIndex = leg.fromIndex;
      }
    } catch {
      const dist = getDistanceMeters(newCoord.lat, newCoord.lon, leg.coords[0].lat, leg.coords[0].lon);
      if (dist < minDistance) {
        minDistance = dist;
        bestLegIndex = leg.fromIndex;
      }
    }
  }

  return bestLegIndex;
}

/**
 * Performs pre-flight GTFS validation before publishing a package.
 */
export function validatePreFlight(shapes: ShapePoint[], stops: StopItem[]): PreFlightCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (stops.length < 2) {
    errors.push('Hatta en az 2 durak (Başlangıç ve Bitiş) bulunmalıdır.');
  }

  if (shapes.length < 2) {
    errors.push('Güzergah çizgisi (shape) en az 2 koordinat noktasından oluşmalıdır.');
  }

  // Check sequence monotonicity
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].sequence !== i + 1) {
      warnings.push(`Durak sıralaması ardışık değil: ${stops[i].stopName} (Sıra: ${stops[i].sequence})`);
    }
  }

  // Check total distance
  if (shapes.length > 0) {
    const totalDist = shapes[shapes.length - 1].distTraveled;
    if (totalDist > 100000) {
      warnings.push(`Hat uzunluğu olağandışı yüksek (${(totalDist / 1000).toFixed(1)} km). Koordinatları kontrol edin.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}


export interface OrderedWaypoint {
  id: string;
  lat: number;
  lon: number;
  isViaPoint: boolean;
  name?: string;
}

/**
 * Maps single sequential RouteWaypointDto array directly to OrderedWaypoint array.
 * Zero geometric guessing, preserves exact 1..N order.
 */
export function buildWaypointsFromRouteDtos(waypoints: RouteWaypointDto[]): OrderedWaypoint[] {
  return waypoints.map((w) => ({
    id: w.stopId || `via-${w.sequence}`,
    lat: w.lat,
    lon: w.lon,
    isViaPoint: w.stopId == null,
    name: w.name || (w.stopId == null ? 'Via Noktası' : 'Durak'),
  }));
}

/**
 * Builds the complete flattened, sequential list of waypoints (stops + via points)
 * to be fed into OSRM routing. Preserves GTFS stop order while interweaving via points.
 */
export function buildOrderedWaypoints(
  stops: StopItem[],
  viaPoints: ViaPointItem[]
): OrderedWaypoint[] {
  if (stops.length === 0) {
    return viaPoints.map((v) => ({
      id: v.id,
      lat: v.lat,
      lon: v.lon,
      isViaPoint: true,
      name: 'Via Noktası',
    }));
  }

  const result: OrderedWaypoint[] = [];

  // Group via points by afterStopId
  const viaMap = new Map<string, ViaPointItem[]>();
  for (const v of viaPoints) {
    const list = viaMap.get(v.afterStopId) || [];
    list.push(v);
    viaMap.set(v.afterStopId, list);
  }

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    result.push({
      id: stop.stopId,
      lat: stop.lat,
      lon: stop.lon,
      isViaPoint: false,
      name: stop.stopName,
    });

    const stopVias = viaMap.get(stop.stopId) || [];
    if (stopVias.length > 0) {
      // Backend ve istemci arasındaki doğal sırayı koru (varsa sequence'e göre, yoksa eklenme sırasına göre)
      // Yapay kuş uçuşu mesafe sıralaması OSRM'de ilmik ve düğümlere yol açtığı için kaldırıldı.
      if (stopVias.some((v) => v.sequence !== undefined)) {
        stopVias.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      }

      for (const v of stopVias) {
        result.push({
          id: v.id,
          lat: v.lat,
          lon: v.lon,
          isViaPoint: true,
          name: 'Via Noktası',
        });
      }
    }
  }

  return result;
}

/**
 * Snaps an arbitrary coordinate onto the nearest point along the route shape polyline.
 */
export function getNearestPointOnShape(
  coord: { lat: number; lon: number },
  shapes: ShapePoint[]
): { lat: number; lon: number } {
  if (shapes.length === 0) return coord;
  if (shapes.length === 1) return { lat: shapes[0].lat, lon: shapes[0].lon };

  try {
    const line = turf.lineString(shapes.map((s) => [s.lon, s.lat]));
    const pt = turf.point([coord.lon, coord.lat]);
    const snapped = turf.nearestPointOnLine(line, pt);
    const [snapLon, snapLat] = snapped.geometry.coordinates;
    return { lat: Number(snapLat.toFixed(6)), lon: Number(snapLon.toFixed(6)) };
  } catch {
    return coord;
  }
}

