import type { Leg } from './leg';

export interface RouteNavigation {
  distance: number;
  duration: number;
  legs: Leg[];
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  // Dakikaya yuvarlanınca 0 görünecek kısa süreler saniye olarak gösterilir
  if (mins === 0) return `${Math.round(seconds)} sn`;
  return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`;
}

function sign(value: number): string {
  return value > 0 ? '+' : '−';
}

/**
 * İşaretli mesafe farkı, ondalıklı km (`+0.04 km`). 2 basamağa yuvarlanınca sıfır görünecek kadar
 * küçükse metre (`+3 m`). Fark tam olarak 0 ise null.
 */
export function formatDistanceDelta(meters: number): string | null {
  if (meters === 0) return null;
  const abs = Math.abs(meters);
  const km = (abs / 1000).toFixed(2);
  if (Number(km) === 0) return `${sign(meters)}${Math.max(Math.round(abs), 1)} m`;
  return `${sign(meters)}${km} km`;
}

/** İşaretli süre farkı: 60 saniyeden azsa saniye (`+20 sn`), değilse ondalıklı dakika (`−2.5 dk`). Fark 0 ise null. */
export function formatDurationDelta(seconds: number): string | null {
  if (seconds === 0) return null;
  const abs = Math.abs(seconds);
  if (abs < 60) return `${sign(seconds)}${Math.max(Math.round(abs), 1)} sn`;
  return `${sign(seconds)}${(abs / 60).toFixed(1)} dk`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 
    ? `${(meters / 1000).toFixed(1)} km` 
    : `${Math.round(meters)} m`;
}
