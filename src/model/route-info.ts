/**
 * Hat bilgisi (`/api/route-info`): hattın kendi alanları. Sefer ve durak sırasından bağımsızdır.
 * Katalogdaki `Route` (yön, sevk başlığı içerir) bu kayıttan türetilir (bkz. `useCatalogRoutes`).
 */
export interface RouteInfo {
  routeId: string;
  agencyId: string;
  routeShortName: string;
  routeLongName: string;
  routeType: number;
  routeColor: string;
  routeTextColor: string;
}

/**
 * `GET /api/route-info` cevabı. `draft`, yayınlandığında canlı listenin yerine geçecek TAM listedir
 * (listede olmayan yayındaki hat silinmiş sayılır); taslak yoksa null.
 */
export interface RouteInfoData {
  published: RouteInfo[];
  draft: RouteInfo[] | null;
}

/** Karşılaştırılan alanlar (routeId hariç). */
const ROUTE_INFO_FIELDS = [
  'agencyId',
  'routeShortName',
  'routeLongName',
  'routeType',
  'routeColor',
  'routeTextColor',
] as const satisfies readonly (keyof RouteInfo)[];

export function isSameRouteInfo(a: RouteInfo, b: RouteInfo): boolean {
  return a.routeId === b.routeId && ROUTE_INFO_FIELDS.every((field) => a[field] === b[field]);
}

/** İki hat listesi aynı mı (sıra önemsiz; routeId ile eşlenir). null listeler yalnızca birbirine eşittir. */
export function isSameRouteInfoList(a: RouteInfo[] | null, b: RouteInfo[] | null): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.length !== b.length) return false;
  const byId = new Map(b.map((r) => [r.routeId, r]));
  return a.every((r) => {
    const other = byId.get(r.routeId);
    return other !== undefined && isSameRouteInfo(r, other);
  });
}

/** GTFS `route_type` değerleri. */
export const ROUTE_TYPES: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Tramvay' },
  { value: 1, label: 'Metro' },
  { value: 2, label: 'Tren' },
  { value: 3, label: 'Otobüs' },
  { value: 4, label: 'Feribot' },
  { value: 5, label: 'Kablolu tramvay' },
  { value: 6, label: 'Teleferik' },
  { value: 7, label: 'Füniküler' },
  { value: 11, label: 'Troleybüs' },
  { value: 12, label: 'Monoray' },
];

export function routeTypeLabel(value: number): string {
  return ROUTE_TYPES.find((t) => t.value === value)?.label ?? `Tür ${value}`;
}
