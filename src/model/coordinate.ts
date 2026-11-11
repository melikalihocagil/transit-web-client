export interface Coordinate {
  lat: number;
  lon: number;
}

export function isSameCoordinate(c1: Coordinate, c2: Coordinate, tolerance = 0.00001): boolean {
  return Math.abs(c1.lat - c2.lat) < tolerance && Math.abs(c1.lon - c2.lon) < tolerance;
}

export function formatCoordinate(coord: Coordinate): string {
  return `${coord.lat.toFixed(5)}, ${coord.lon.toFixed(5)}`;
}
