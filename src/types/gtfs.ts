export interface ShapePoint {
  sequence: number;
  lat: number;
  lon: number;
  distTraveled: number; // in meters
  isViaPoint?: boolean;
}

export type StopActionType = 'NONE' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface StopItem {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  sequence: number;
  actionType: StopActionType;
  locationType?: number | null;
}

export const GtfsLocationType = {
  STOP: 0,
  STATION: 1,
  ENTRANCE_EXIT: 2,
  GENERIC_NODE: 3,
  BOARDING_AREA: 4,
} as const;

export type GtfsLocationTypeValue = (typeof GtfsLocationType)[keyof typeof GtfsLocationType];

export interface RouteWaypointDto {
  sequence: number;
  stopId: string | null;
  name?: string | null;
  lat: number;
  lon: number;
  distTraveled?: number | null;
  locationType?: number | null;
}

export interface ViaPointItem {
  id: string;
  lat: number;
  lon: number;
  afterStopId: string; // the stopId this via point follows in sequence
  sequence?: number;
}

export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  coords: Array<{ lat: number; lon: number }>;
}

export interface RouteInfo {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  routeTextColor: string;
  agencyId: string;
  directionId?: 0 | 1;
}


