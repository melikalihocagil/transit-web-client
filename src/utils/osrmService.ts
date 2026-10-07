import axios from 'axios';
import type { RouteLeg } from '../types/gtfs';

const PRIMARY_OSRM_URL =
  (import.meta as unknown as { env?: { VITE_OSRM_URL?: string } }).env?.VITE_OSRM_URL ||
  'http://localhost:5000/route/v1/driving';

const FALLBACK_PROXY_URL = '/osrm/route/v1/driving';

export interface LatLngCoord {
  lat: number;
  lon: number;
}

export interface DetailedRouteResult {
  allCoordinates: LatLngCoord[];
  legs: RouteLeg[];
}

interface OsrmStep {
  geometry?: {
    coordinates?: [number, number][];
  };
}

interface OsrmLeg {
  steps?: OsrmStep[];
}

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry?: {
      coordinates?: [number, number][];
    };
    legs?: OsrmLeg[];
  }>;
}

function extractLegCoordinates(leg: OsrmLeg): LatLngCoord[] {
  const coords: LatLngCoord[] = [];
  if (!leg || !leg.steps) return coords;
  for (const s of leg.steps) {
    if (!s.geometry || !s.geometry.coordinates) continue;
    for (const [lon, lat] of s.geometry.coordinates) {
      if (
        coords.length === 0 ||
        coords[coords.length - 1].lat !== lat ||
        coords[coords.length - 1].lon !== lon
      ) {
        coords.push({ lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) });
      }
    }
  }
  return coords;
}

/**
 * Single OSRM query for a batch of stops with steps=true to retrieve leg geometries.
 */
async function queryOsrmBatchWithLegs(
  batch: LatLngCoord[],
  baseUrl: string
): Promise<{ legs: LatLngCoord[][]; overview: LatLngCoord[] } | null> {
  if (batch.length < 2) return null;

  try {
    const coordsQuery = batch.map((s) => `${s.lon},${s.lat}`).join(';');
    const url = `${baseUrl}/${coordsQuery}?overview=full&geometries=geojson&steps=true&continue_straight=true`;

    const response = await axios.get<OsrmRouteResponse>(url, {
      timeout: 6000,
      headers: {
        'User-Agent': 'TransitAdminClient/1.0',
      },
    });

    if (
      response.data &&
      response.data.code === 'Ok' &&
      response.data.routes &&
      response.data.routes.length > 0
    ) {
      const route = response.data.routes[0];
      const overview: LatLngCoord[] = (route.geometry?.coordinates || []).map(([lon, lat]) => ({
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
      }));

      const extractedLegs: LatLngCoord[][] = [];
      if (route.legs && route.legs.length > 0) {
        for (let j = 0; j < route.legs.length; j++) {
          const legCoords = extractLegCoordinates(route.legs[j]);
          if (legCoords.length >= 2) {
            extractedLegs.push(legCoords);
          } else {
            extractedLegs.push([batch[j], batch[j + 1]]);
          }
        }
      }

      return { legs: extractedLegs, overview };
    }
  } catch (err) {
    console.warn(`OSRM call to ${baseUrl} failed:`, err);
  }

  return null;
}

/**
 * Calculates a driving route connecting a list of coordinates in sequence using OSRM,
 * returning BOTH the concatenated route coordinates AND each individual leg connecting W_k -> W_{k+1}.
 */
export async function getRouteWithLegs(stops: LatLngCoord[]): Promise<DetailedRouteResult> {
  if (stops.length === 0) return { allCoordinates: [], legs: [] };
  if (stops.length === 1) return { allCoordinates: [stops[0]], legs: [] };

  const BATCH_SIZE = 20;
  const allCoordinates: LatLngCoord[] = [];
  const legs: RouteLeg[] = [];

  const baseUrls = [PRIMARY_OSRM_URL, FALLBACK_PROXY_URL];
  let activeBaseUrl = PRIMARY_OSRM_URL;

  for (let i = 0; i < stops.length - 1; i += BATCH_SIZE - 1) {
    const chunk = stops.slice(i, i + BATCH_SIZE);
    if (chunk.length < 2) break;

    let result = await queryOsrmBatchWithLegs(chunk, activeBaseUrl);

    if (!result) {
      for (const url of baseUrls) {
        if (url === activeBaseUrl) continue;
        result = await queryOsrmBatchWithLegs(chunk, url);
        if (result) {
          activeBaseUrl = url;
          break;
        }
      }
    }

    if (result && result.legs.length === chunk.length - 1) {
      for (let j = 0; j < result.legs.length; j++) {
        const fromIndex = i + j;
        const toIndex = fromIndex + 1;
        const legCoords = result.legs[j];
        legs.push({ fromIndex, toIndex, coords: legCoords });

        if (allCoordinates.length > 0) {
          allCoordinates.push(...legCoords.slice(1));
        } else {
          allCoordinates.push(...legCoords);
        }
      }
    } else {
      // Fallback for this chunk: direct connection between consecutive waypoints
      console.warn('OSRM could not route segment chunk, using direct fallback for this batch.');
      for (let j = 0; j < chunk.length - 1; j++) {
        const fromIndex = i + j;
        const toIndex = fromIndex + 1;
        const fallbackCoords = [chunk[j], chunk[j + 1]];
        legs.push({ fromIndex, toIndex, coords: fallbackCoords });

        if (allCoordinates.length > 0) {
          allCoordinates.push(chunk[j + 1]);
        } else {
          allCoordinates.push(...fallbackCoords);
        }
      }
    }
  }

  return {
    allCoordinates: allCoordinates.length > 0 ? allCoordinates : stops,
    legs,
  };
}

/**
 * Calculates a driving route connecting a list of coordinates in sequence using OSRM.
 * Returns an array of coordinates following the actual street network (not straight lines).
 */
export async function getRouteForStops(stops: LatLngCoord[]): Promise<LatLngCoord[]> {
  const result = await getRouteWithLegs(stops);
  return result.allCoordinates;
}
