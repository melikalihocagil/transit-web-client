import type { Coordinate } from './coordinate';
import type { Leg } from './leg';

/** Navigasyon bacaklarının haritaya tek çizgi olarak çizilecek birleşik hali. */
export interface MergedRouteLine {
  /** Bacakların koordinatları sırayla; bacak eklerinde tekrar eden nokta bir kez yer alır. */
  coords: Coordinate[];
  /** `legs[i]`, `coords` içinde [başlangıç, bitiş] (ikisi de dahil) aralığındadır. */
  ranges: [number, number][];
}

/**
 * Bacakları tek koordinat listesinde birleştirir. Bir bacağın ilk noktası öncekinin son noktasıyla aynıysa
 * tekrar eklenmez (sıfır uzunluklu parça çizgi birleşiminde iz bırakır).
 */
export function mergeLegCoordinates(legs: Leg[] | null | undefined): MergedRouteLine {
  const coords: Coordinate[] = [];
  const ranges: [number, number][] = [];

  for (const leg of legs ?? []) {
    const points = leg.coordinates ?? [];
    let start = coords.length;
    points.forEach((point, k) => {
      const last = coords.at(-1);
      if (k === 0 && last && last.lat === point.lat && last.lon === point.lon) {
        start = coords.length - 1;
        return;
      }
      coords.push(point);
    });
    ranges.push([start, Math.max(start, coords.length - 1)]);
  }

  return { coords, ranges };
}
