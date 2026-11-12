import type { Stop } from './stop';
import type { Via } from './via';
import type { RouteNavigation } from './route-navigation';
import { isViaBetween, isSameVia } from './via';

/**
 * Navigasyondaki bir bacağın (leg) konumu.
 *
 * Backend `RoutingService.buildRouteCoordinates` noktaları şu sırayla dizer:
 * durak[0], (durak[0] -> durak[1] via'ları viaSequence sırasıyla), durak[1], ...
 * `legs[i]` bu dizinin i. ve i+1. noktası arasıdır; her durak aralığında `via sayısı + 1` bacak vardır.
 */
export interface LegSlot {
  /** stops[segmentIndex] -> stops[segmentIndex + 1] */
  segmentIndex: number;
  fromStopId: string;
  toStopId: string;
  /** Bu bacağa eklenecek via'nın alacağı sıra (1'den başlar); aynı zamanda bacağın aralık içindeki sırası. */
  viaSequence: number;
}

export interface LegTotals {
  distance: number;
  duration: number;
}

/**
 * Beklenen her bacak için bir `LegSlot` üretir. Saklanmaz, her zaman `stops` + `vias`'tan türetilir.
 * Aralık içindeki sıra numaralarının 1..n boşluksuz olduğu varsayılır (bkz. `normalizeViaSequences`).
 */
export function locateLegs(stops: Stop[], vias: Via[]): LegSlot[] {
  const slots: LegSlot[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const fromStopId = stops[i].stopId;
    const toStopId = stops[i + 1].stopId;
    const viaCount = vias.filter((v) => isViaBetween(v, fromStopId, toStopId)).length;
    for (let k = 0; k <= viaCount; k++) {
      slots.push({ segmentIndex: i, fromStopId, toStopId, viaSequence: k + 1 });
    }
  }
  return slots;
}

/** Navigasyon bacak sayısı beklenen bacak sayısıyla eşleşiyor mu? */
function isAligned(
  slots: LegSlot[],
  navigation: RouteNavigation | null | undefined
): navigation is RouteNavigation {
  return !!navigation && Array.isArray(navigation.legs) && navigation.legs.length === slots.length;
}

/**
 * Ardışık her durak çifti (i -> i+1) için aradaki tüm bacakların toplam mesafe ve süresi.
 * Bacak sayısı uyuşmazsa `null` döner.
 */
export function sumLegsByStopPair(
  stops: Stop[],
  vias: Via[],
  navigation: RouteNavigation | null | undefined
): LegTotals[] | null {
  const slots = locateLegs(stops, vias);
  if (!isAligned(slots, navigation)) return null;

  const totals: LegTotals[] = Array.from({ length: Math.max(stops.length - 1, 0) }, () => ({
    distance: 0,
    duration: 0,
  }));

  navigation.legs.forEach((leg, i) => {
    const bucket = totals[slots[i].segmentIndex];
    bucket.distance += leg.distance ?? 0;
    bucket.duration += leg.duration ?? 0;
  });

  return totals;
}

/**
 * OSRM cevabına göre via'ları çizgiye oturtur: `slots[i]` kimliğine sahip via, `legs[i]`'nin
 * son koordinatına taşınır (aralığın son bacağı durakta biter, ona karşılık gelen via yoktur).
 * Eşleşme yoksa ya da değişiklik yoksa aynı dizi referansı döner.
 */
export function snapViasToLegs(
  stops: Stop[],
  vias: Via[],
  navigation: RouteNavigation | null | undefined
): Via[] {
  const slots = locateLegs(stops, vias);
  if (!isAligned(slots, navigation)) return vias;

  let next: Via[] | null = null;
  for (let i = 0; i < slots.length; i++) {
    const last = navigation.legs[i]?.coordinates?.at(-1);
    if (typeof last?.lat !== 'number' || typeof last?.lon !== 'number') continue;

    const { fromStopId, toStopId, viaSequence } = slots[i];
    const viaIndex = vias.findIndex((v) =>
      isSameVia(v, { fromStopId, toStopId, viaSequence, lat: 0, lon: 0 })
    );
    if (viaIndex === -1) continue;

    const via = vias[viaIndex];
    if (via.lat === last.lat && via.lon === last.lon) continue;
    if (next === null) next = [...vias];
    next[viaIndex] = { ...via, lat: last.lat, lon: last.lon };
  }

  return next ?? vias;
}

/**
 * Via'yı ekler: aynı çiftte sırası `via.viaSequence` ve sonrası olanlar bir kayar.
 */
export function insertVia(vias: Via[], via: Via): Via[] {
  const shifted = vias.map((v) =>
    isViaBetween(v, via.fromStopId, via.toStopId) && v.viaSequence >= via.viaSequence
      ? { ...v, viaSequence: v.viaSequence + 1 }
      : v
  );
  return [...shifted, via];
}

/**
 * Araya durak girince aralığı böler: sırası `slot.viaSequence`'tan küçük olanlar
 * (from -> yeniDurak), diğerleri (yeniDurak -> to) çiftine geçer; iki çift de 1'den numaralanır.
 */
export function splitViasAtStop(vias: Via[], slot: LegSlot, newStopId: string): Via[] {
  return vias.map((v) => {
    if (!isViaBetween(v, slot.fromStopId, slot.toStopId)) return v;
    if (v.viaSequence < slot.viaSequence) {
      return { ...v, toStopId: newStopId };
    }
    return {
      ...v,
      fromStopId: newStopId,
      viaSequence: v.viaSequence - slot.viaSequence + 1,
    };
  });
}

/**
 * Her (fromStopId, toStopId) çifti içinde sıra numaralarını 1..n boşluksuz ve tekil yapar.
 * Mevcut sıra kararlı biçimde korunur (eşit numaralarda dizideki geliş sırası; backend ile aynı).
 * Dizideki eleman konumları değişmez; hiçbir şey değişmediyse aynı dizi referansı döner.
 */
export function normalizeViaSequences(vias: Via[]): Via[] {
  const groups = new Map<string, number[]>();
  vias.forEach((via, index) => {
    const key = `${via.fromStopId}->${via.toStopId}`;
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  });

  let next: Via[] | null = null;
  for (const indices of groups.values()) {
    const ordered = [...indices].sort((a, b) => vias[a].viaSequence - vias[b].viaSequence);
    for (let rank = 0; rank < ordered.length; rank++) {
      const viaIndex = ordered[rank];
      const viaSequence = rank + 1;
      if (vias[viaIndex].viaSequence !== viaSequence) {
        if (next === null) next = [...vias];
        next[viaIndex] = { ...vias[viaIndex], viaSequence };
      }
    }
  }

  return next ?? vias;
}
