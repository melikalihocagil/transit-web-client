import type { Leg } from './leg';

export interface RouteNavigation {
  distance: number;
  duration: number;
  legs: Leg[];
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 
    ? `${(meters / 1000).toFixed(1)} km` 
    : `${Math.round(meters)} m`;
}
