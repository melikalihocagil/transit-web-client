import type { Coordinate } from './coordinate';

export interface SelfOverlapOptions {
  /** Bu kadar metreden yakın geçen iki parça aynı yolda sayılır (bölünmüş yolun şeritleri sayılmaz). */
  tolerance?: number;
  /** Rota boyunca bundan yakın (komşu) parçalar karşılaştırılmaz; dönüş noktası çevresi yanlış alarm vermez. */
  minGap?: number;
  /** Bundan kısa ortak kısım sayılmaz (kavşakta tek noktada kesişme gibi). */
  minLength?: number;
  /** Ortak kısım, giriş ve çıkış noktalarını kapsasın diye iki ucundan bu kadar uzatılır. */
  margin?: number;
}

interface Point {
  x: number;
  y: number;
}

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LON_AT_EQUATOR = 111_320;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

type Grid = Map<string, number[]>;

/** Her parça (j -> j+1), tolerans kadar genişletilmiş kapladığı hücrelere yazılır. */
function buildGrid(points: Point[], cellSize: number, tolerance: number): Grid {
  const grid: Grid = new Map();
  const cellOf = (v: number) => Math.floor(v / cellSize);
  for (let j = 0; j < points.length - 1; j++) {
    const a = points[j];
    const b = points[j + 1];
    const x0 = cellOf(Math.min(a.x, b.x) - tolerance);
    const x1 = cellOf(Math.max(a.x, b.x) + tolerance);
    const y0 = cellOf(Math.min(a.y, b.y) - tolerance);
    const y1 = cellOf(Math.max(a.y, b.y) + tolerance);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx}:${cy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(j);
        else grid.set(key, [j]);
      }
    }
  }
  return grid;
}

/** Arka arkaya işaretli noktaların [ilk, son] indeksleri. */
function markedRuns(marked: boolean[]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  marked.forEach((isMarked, i) => {
    if (isMarked && start === -1) start = i;
    if (!isMarked && start !== -1) {
      runs.push([start, i - 1]);
      start = -1;
    }
  });
  if (start !== -1) runs.push([start, marked.length - 1]);
  return runs;
}

/** Ortak kısmı iki ucundan `margin` kadar uzatır; sınırı geçen ilk nokta da alınır (uzun düz parçada erken bitmez). */
function extendRun(cum: number[], [first, last]: [number, number], margin: number): [number, number] {
  let start = first;
  while (start > 0 && cum[first] - cum[start] < margin) start--;
  let stop = last;
  while (stop < cum.length - 1 && cum[stop] - cum[last] < margin) stop++;
  return [start, stop];
}

/**
 * Rotanın kendi üstünden yeniden geçtiği kısımlar (ikinci geçiş). Her parça, ortak yola giriş ve çıkışı
 * kapsayacak şekilde iki ucundan `margin` kadar uzatılmış koordinat dizisidir.
 *
 * Bir nokta, rota boyunca kendisinden en az `minGap` önce biten bir parçaya `tolerance` metreden yakınsa
 * işaretlenir; arka arkaya işaretli noktalar ortak kısmı oluşturur.
 */
export function findSelfOverlaps(coords: Coordinate[], options: SelfOverlapOptions = {}): Coordinate[][] {
  const { tolerance = 5, minGap = 30, minLength = 20, margin = 60 } = options;
  if (coords.length < 3) return [];

  // Yerel düzlemsel metre koordinatları (şehir ölçeğinde yeterince doğru)
  const kx = METERS_PER_DEG_LON_AT_EQUATOR * Math.cos(coords[0].lat * (Math.PI / 180));
  const points: Point[] = coords.map((c) => ({ x: c.lon * kx, y: c.lat * METERS_PER_DEG_LAT }));

  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }

  const cellSize = Math.max(tolerance * 4, 20);
  const grid = buildGrid(points, cellSize, tolerance);
  const marked = points.map((p, i) => {
    const bucket = grid.get(`${Math.floor(p.x / cellSize)}:${Math.floor(p.y / cellSize)}`) ?? [];
    return bucket.some(
      (j) => cum[j + 1] < cum[i] - minGap && distanceToSegment(p, points[j], points[j + 1]) <= tolerance
    );
  });

  // Kısa olanlar atılır (kavşakta kesişme), kalanlar uzatılıp örtüşenler birleştirilir
  const runs: [number, number][] = [];
  for (const run of markedRuns(marked)) {
    if (cum[run[1]] - cum[run[0]] < minLength) continue;
    const [start, stop] = extendRun(cum, run, margin);
    const previous = runs.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], stop);
    else runs.push([start, stop]);
  }

  return runs.map(([start, stop]) => coords.slice(start, stop + 1));
}
