import type { Coordinate } from './coordinate';

export interface Stop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  locationType: number; // 0: Normal Durak, 1: Sevk Noktası
}

/**
 * Draft'ta silinmiş durak işareti (tombstone). Sadece istemci modelinde kullanılır:
 * backend `lat`/`lon` alanlarını primitive double olarak tuttuğu için null gönderilemez.
 */
export interface DeletedStop {
  stopId: string;
  lat: null;
  lon: null;
}

/** Draft'taki bir kayıt: published'dan farklı bir durak, yeni bir durak ya da silme işareti. */
export type DraftStop = Stop | DeletedStop;

export function isDeletedStop(stop: DraftStop): stop is DeletedStop {
  return stop.lat === null || stop.lon === null;
}

/** İki durağın tüm veri alanlarının aynı olup olmadığını kontrol eder. */
export function isSameStopData(a: Stop, b: Stop): boolean {
  return (
    a.stopName === b.stopName &&
    a.lat === b.lat &&
    a.lon === b.lon &&
    a.locationType === b.locationType
  );
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
