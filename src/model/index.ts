// 1. Coğrafi Temel (Coordinate)
export type { Coordinate } from './coordinate';
export { isSameCoordinate, formatCoordinate } from './coordinate';

// 2. Durak Varlığı (Stop)
export type { Stop, DeletedStop, DraftStop } from './stop';
export {
  isTerminalStop,
  formatStopLabel,
  getStopCoordinate,
  isSameStop,
  isDeletedStop,
  isSameStopData,
} from './stop';

// 3. Ara Kılavuz Noktası (Via)
export type { Via } from './via';
export { isViaBetween, isSameVia, sortViasBySequence, getViaCoordinate } from './via';

// 3.1. Bacak Konumu (navigation.legs[i] -> durak çifti + via sırası; backend buildRouteCoordinates karşılığı)
export type { LegSlot, LegTotals } from './route-legs';
export {
  locateLegs,
  sumLegsByStopPair,
  snapViasToLegs,
  insertVia,
  splitViasAtStop,
  normalizeViaSequences,
} from './route-legs';

// 4. Yol Bacağı (Leg)
export type { Leg } from './leg';

// 5. Navigasyon ve Süre/Mesafe (RouteNavigation)
export type { RouteNavigation } from './route-navigation';
export {
  formatDuration,
  formatDistance,
  formatDistanceDelta,
  formatDurationDelta,
} from './route-navigation';

// 5.1. Taslak / yayındaki farkı (ortak duraklar arasındaki ayrışma bölgeleri)
export type { RouteShape, RouteDiffRegion } from './route-diff';
export { diffRoutes } from './route-diff';

// 5.1.1. Bacakların tek çizgi olarak birleşik hali (haritada tek liste çizim)
export type { MergedRouteLine } from './route-polyline';
export { mergeLegCoordinates } from './route-polyline';

// 5.2. Rotanın kendi üstünden geçtiği kısımlar (haritada ortak yola giriş/çıkışı göstermek için)
export type { SelfOverlapOptions } from './route-overlap';
export { findSelfOverlaps } from './route-overlap';

// 6. Hat Tanımı (Route)
export type { Route } from './route';
export { formatRouteTitle } from './route';

// 6.1. Hat Bilgisi (/api/route-info: ad, tür, renk) ve hat renkleri
export type { RouteInfo, RouteInfoData } from './route-info';
export { isSameRouteInfo, isSameRouteInfoList, ROUTE_TYPES, routeTypeLabel } from './route-info';
export {
  normalizeHexColor,
  toCssColor,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_ROUTE_TEXT_COLOR,
  contrastRatio,
  MIN_TEXT_CONTRAST,
  suggestTextColor,
  lightenColor,
  darkenColor,
  ROUTE_COLOR_GROUPS,
  ROUTE_COLOR_GROUP_ORDER,
  parseRouteCode,
  routeColorGroup,
  distributeGroupColors,
} from './route-color';

// 7. Hat Detay Paketi (RouteDetail)
export type { RouteDetail } from './route-detail';

// 8. Çift Katmanlı Çalışma Paketleri (Dual-Layer Workspace State)
export type { RouteData } from './route-data';
export type { StopsData } from './stops-data';

// 9. Etkilenen Hat (durak değişikliğinin geometrisini değiştirdiği hat)
export type { AffectedRoute } from './affected-route';
