import type { Stop } from './stop';
import type { Via } from './via';
import type { Coordinate } from './coordinate';
import type { RouteNavigation } from './route-navigation';
import { isViaBetween, sortViasBySequence } from './via';
import { locateLegs, sumLegsByStopPair, type LegTotals } from './route-legs';

/** Karşılaştırılan hattın bir tarafı (taslak ya da yayındaki). */
export interface RouteShape {
  stops: Stop[];
  vias: Via[];
  navigation: RouteNavigation | null | undefined;
}

/**
 * Taslağın yayındakinden ayrıştığı bölge. Ayrışmadan önceki ve sonraki ortak duraklar arasıdır;
 * arka arkaya farklı aralıklar tek bölgede birleşir.
 * Durak aralıkları yarı açıktır: segment `i`, `stops[i] -> stops[i + 1]` aralığıdır.
 */
export interface RouteDiffRegion {
  /** Taslakta bölgenin ilk ve son durağının indeksi (`draftFrom === draftTo` ise taslakta çizgi yok). */
  draftFrom: number;
  draftTo: number;
  publishedFrom: number;
  publishedTo: number;
  draft: LegTotals;
  published: LegTotals;
  /** Baloncuğun konacağı nokta: bölgedeki taslak çizginin uzunluğa göre ortası. */
  anchor: Coordinate;
}

/** Eşleşen durak indeks çiftleri [taslak, yayındaki]; stopId dizilerinin en uzun ortak alt dizisi. */
function matchStops(a: Stop[], b: Stop[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i].stopId === b[j].stopId ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].stopId === b[j].stopId) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

function isSamePosition(a: Stop, b: Stop): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

function viasOf(vias: Via[], from: Stop, to: Stop): Via[] {
  return sortViasBySequence(vias.filter((v) => isViaBetween(v, from.stopId, to.stopId)));
}

/** Tek durak aralığı (iki tarafta da aynı uç duraklar) değişmeden mi kalmış? */
function isSameSegment(draft: RouteShape, published: RouteShape, d: number, p: number): boolean {
  const [dFrom, dTo] = [draft.stops[d], draft.stops[d + 1]];
  const [pFrom, pTo] = [published.stops[p], published.stops[p + 1]];
  // Uç sınırlar sanal olabilir (hattın başı/sonu ortak durak değilse); kimlik de karşılaştırılır
  if (dFrom.stopId !== pFrom.stopId || dTo.stopId !== pTo.stopId) return false;
  if (!isSamePosition(dFrom, pFrom) || !isSamePosition(dTo, pTo)) return false;
  const dVias = viasOf(draft.vias, dFrom, dTo);
  const pVias = viasOf(published.vias, pFrom, pTo);
  return (
    dVias.length === pVias.length &&
    dVias.every((v, k) => v.lat === pVias[k].lat && v.lon === pVias[k].lon)
  );
}

function sumRange(totals: LegTotals[], from: number, to: number): LegTotals {
  const sum = { distance: 0, duration: 0 };
  for (let i = from; i < to; i++) {
    sum.distance += totals[i].distance;
    sum.duration += totals[i].duration;
  }
  return sum;
}

/** Yaklaşık düzlemsel uzaklık (yalnızca orta nokta bulmak için; birim önemsiz). */
function planarDistance(a: Coordinate, b: Coordinate): number {
  const dLat = b.lat - a.lat;
  const dLon = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

/** Taslağın `from..to` durak aralığındaki çizginin ortası; çizgi yoksa durağın kendisi. */
function midpointOf(draft: RouteShape, from: number, to: number): Coordinate {
  const fallback = { lat: draft.stops[from].lat, lon: draft.stops[from].lon };
  if (from === to || !draft.navigation) return fallback;

  const slots = locateLegs(draft.stops, draft.vias);
  const coords: Coordinate[] = [];
  draft.navigation.legs.forEach((leg, i) => {
    const segment = slots[i]?.segmentIndex;
    if (segment !== undefined && segment >= from && segment < to) coords.push(...leg.coordinates);
  });
  if (coords.length < 2) return fallback;

  const lengths = coords.slice(1).map((c, i) => planarDistance(coords[i], c));
  let remaining = lengths.reduce((s, l) => s + l, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const t = remaining / lengths[i];
      return {
        lat: coords[i].lat + (coords[i + 1].lat - coords[i].lat) * t,
        lon: coords[i].lon + (coords[i + 1].lon - coords[i].lon) * t,
      };
    }
    remaining -= lengths[i];
  }
  return coords.at(-1) ?? fallback;
}

/**
 * Taslağın yayındakinden ayrıştığı bölgeler. Fark girdiden çıkarılır (durak sırası, via'lar, durak konumu);
 * geometri karşılaştırılmaz. İki tarafın navigasyonu bacaklarla hizalı değilse boş döner.
 */
export function diffRoutes(draft: RouteShape, published: RouteShape): RouteDiffRegion[] {
  const dTotals = sumLegsByStopPair(draft.stops, draft.vias, draft.navigation);
  const pTotals = sumLegsByStopPair(published.stops, published.vias, published.navigation);
  if (!dTotals || !pTotals || draft.stops.length === 0) return [];

  const dLast = draft.stops.length - 1;
  const pLast = Math.max(published.stops.length - 1, 0);

  // Ortak duraklar ve uçlar: aralık [çapa k, çapa k+1]. Uçlarda ortak durak yoksa hattın ucu kullanılır.
  const anchors = matchStops(draft.stops, published.stops);
  const bounds: [number, number][] = [[0, 0], ...anchors, [dLast, pLast]];

  const regions: RouteDiffRegion[] = [];
  let open: { d: number; p: number } | null = null;

  const close = (dEnd: number, pEnd: number) => {
    if (!open) return;
    regions.push({
      draftFrom: open.d,
      draftTo: dEnd,
      publishedFrom: open.p,
      publishedTo: pEnd,
      draft: sumRange(dTotals, open.d, dEnd),
      published: sumRange(pTotals, open.p, pEnd),
      anchor: midpointOf(draft, open.d, dEnd),
    });
    open = null;
  };

  for (let k = 0; k < bounds.length - 1; k++) {
    const [da, pa] = bounds[k];
    const [db, pb] = bounds[k + 1];
    const dSpan = db - da;
    const pSpan = pb - pa;
    if (dSpan === 0 && pSpan === 0) continue; // uç ile çapa aynı durak

    const changed = dSpan !== 1 || pSpan !== 1 || !isSameSegment(draft, published, da, pa);
    if (changed) {
      if (!open) open = { d: da, p: pa };
    } else {
      close(da, pa);
    }
  }
  close(dLast, pLast);

  return regions;
}
