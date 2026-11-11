import type { Coordinate } from './coordinate';

export interface Stop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  locationType: number; // 0: Normal Durak, 1: Sevk Noktası
}

export function isTerminalStop(stop: Stop): boolean {
  return stop.locationType === 1;
}

export function formatStopLabel(stop: Stop): string {
  return `${stop.stopId} - ${stop.stopName}`;
}

export function getStopCoordinate(stop: Stop): Coordinate {
  return { lat: stop.lat, lon: stop.lon };
}

export function isSameStop(a: Stop, b: Stop): boolean {
  return a.stopId === b.stopId;
}
