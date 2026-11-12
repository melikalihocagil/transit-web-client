import type { Coordinate } from './coordinate';

export interface Via {
  fromStopId: string;
  toStopId: string;
  viaSequence: number;
  lat: number;
  lon: number;
}

export function isViaBetween(via: Via, fromStopId: string, toStopId: string): boolean {
  return via.fromStopId === fromStopId && via.toStopId === toStopId;
}

/** Via kimliği: (fromStopId, toStopId, viaSequence). */
export function isSameVia(a: Via, b: Via): boolean {
  return (
    a.fromStopId === b.fromStopId && a.toStopId === b.toStopId && a.viaSequence === b.viaSequence
  );
}

export function sortViasBySequence(vias: Via[]): Via[] {
  return [...vias].sort((a, b) => a.viaSequence - b.viaSequence);
}

export function getViaCoordinate(via: Via): Coordinate {
  return { lat: via.lat, lon: via.lon };
}
