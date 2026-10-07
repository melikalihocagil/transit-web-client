import axios from 'axios';
import type { RevisionPackage } from '../types/package';
import type { RouteWaypointDto } from '../types/gtfs';

const API_BASE = '/api/v1/admin';

export interface AdminRouteDto {
  routeId: string;
  agencyId: string;
  routeShortName: string;
  routeLongName: string;
  routeType: number;
  routeColor: string;
  routeTextColor: string;
  isDraft: boolean;
}

export interface AdminStopDto {
  stopId: string;
  stopName: string;
  stopLat: number;
  stopLon: number;
  locationType?: number;
  isDraft?: boolean;
}

export interface WorksheetShapePointDto {
  shapeId: string;
  sequence: number;
  lat: number;
  lon: number;
  distTraveled: number;
  isViaPoint?: boolean;
}

export interface RouteDetailDto {
  route: AdminRouteDto;
  waypoints: RouteWaypointDto[];
  shapeCoordinates: [number, number][]; // [lon, lat][]
  stops?: AdminStopDto[];
  viaPoints?: WorksheetShapePointDto[];
  orderedWaypoints?: WaypointDto[];
}

export interface SaveWaypointsRequest {
  waypoints: RouteWaypointDto[];
}

export interface CreatePackageRequest {
  packageName: string;
  scopeType?: 'SINGLE_ROUTE' | 'MULTI_ROUTE' | 'NETWORK_WIDE';
  ukomeDecisionNo?: string;
  description?: string;
  createdBy?: string;
}

export interface PublishPackageRequest {
  publishedBy: string;
  changeReason: string;
}

export interface CreateStopRequest {
  stopId: string;
  stopName: string;
  stopLat: number;
  stopLon: number;
  locationType?: number;
}

export interface UpdateStopRequest {
  stopName?: string;
  stopLat?: number;
  stopLon?: number;
  locationType?: number;
}

export interface WaypointDto {
  lon: number;
  lat: number;
  isViaPoint?: boolean;
}

export type ShapeWaypoint = WaypointDto;

export interface CreateRouteRequest {
  routeId: string;
  agencyId: string;
  routeShortName: string;
  routeLongName: string;
  routeType?: number;
  routeColor?: string;
  routeTextColor?: string;
  packageId?: string;
}

export const adminApi = {
  // === 1. HATLAR (ROUTES) ===
  async getRoutes(packageId?: string): Promise<AdminRouteDto[]> {
    const params = packageId ? { packageId } : undefined;
    const res = await axios.get<AdminRouteDto[]>(`${API_BASE}/worksheet/routes`, { params });
    return res.data;
  },

  async getRouteDetail(routeId: string): Promise<RouteDetailDto> {
    const res = await axios.get<RouteDetailDto>(`${API_BASE}/worksheet/routes/${routeId}`);
    return res.data;
  },

  async createRoute(req: CreateRouteRequest): Promise<AdminRouteDto> {
    const res = await axios.post<AdminRouteDto>(`${API_BASE}/worksheet/routes`, req);
    return res.data;
  },

  async loadRouteToWorksheet(routeId: string, packageId?: string, workspaceId = 'default-workspace') {
    const res = await axios.post(`${API_BASE}/worksheet/routes/${routeId}/load`, null, {
      params: { packageId, workspaceId },
    });
    return res.data;
  },

  // === 1.1. WAYPOINTS (GÜZERGAH TASARIM ZİNCİRİ) ===
  async getRouteWaypoints(routeId: string): Promise<RouteWaypointDto[]> {
    const res = await axios.get<RouteWaypointDto[]>(`${API_BASE}/worksheet/routes/${routeId}/waypoints`);
    return res.data;
  },

  async saveRouteWaypoints(routeId: string, waypoints: RouteWaypointDto[]): Promise<RouteWaypointDto[]> {
    const res = await axios.put<RouteWaypointDto[]>(`${API_BASE}/worksheet/routes/${routeId}/waypoints`, {
      waypoints,
    });
    return res.data;
  },

  async generateShapeForRoute(routeId: string, shapeId?: string): Promise<WorksheetShapePointDto[]> {
    const params = shapeId ? { shapeId } : undefined;
    const res = await axios.post<WorksheetShapePointDto[]>(
      `${API_BASE}/worksheet/routes/${routeId}/generate-shape`,
      null,
      { params }
    );
    return res.data;
  },

  // === 2. DURAKLAR (STOPS) ===
  async getStops(packageId?: string): Promise<AdminStopDto[]> {
    const params = packageId ? { packageId } : undefined;
    const res = await axios.get<AdminStopDto[]>(`${API_BASE}/worksheet/stops`, { params });
    return res.data;
  },

  async createDraftStop(req: CreateStopRequest): Promise<AdminStopDto> {
    const res = await axios.post<AdminStopDto>(`${API_BASE}/worksheet/stops`, req);
    return res.data;
  },

  async updateDraftStop(stopId: string, req: UpdateStopRequest): Promise<AdminStopDto> {
    const res = await axios.put<AdminStopDto>(`${API_BASE}/worksheet/stops/${stopId}`, req);
    return res.data;
  },

  async deleteDraftStop(stopId: string): Promise<void> {
    await axios.delete(`${API_BASE}/worksheet/stops/${stopId}`);
  },

  // === 3. OSRM ŞEKİL (SHAPES) ===
  async generateShape(shapeId: string, waypoints: WaypointDto[], packageId?: string): Promise<WorksheetShapePointDto[]> {
    const params = packageId ? { packageId } : undefined;
    const res = await axios.post<WorksheetShapePointDto[]>(
      `${API_BASE}/worksheet/shapes/generate`,
      {
        shapeId,
        waypoints: waypoints.map((w) => ({
          lon: w.lon,
          lat: w.lat,
          isViaPoint: !!w.isViaPoint,
        })),
      },
      { params }
    );
    return res.data;
  },

  // === 4. REVİZYON PAKETLERİ ===
  async getPackages(): Promise<RevisionPackage[]> {
    const res = await axios.get<RevisionPackage[]>(`${API_BASE}/packages`);
    return res.data;
  },

  async createPackage(req: CreatePackageRequest): Promise<RevisionPackage> {
    const res = await axios.post<RevisionPackage>(`${API_BASE}/packages`, req);
    return res.data;
  },

  async publishPackage(packageId: string, req: PublishPackageRequest): Promise<string> {
    const res = await axios.post<string>(`${API_BASE}/packages/${packageId}/publish`, req);
    return res.data;
  },

  async rollbackPackage(packageId: string): Promise<string> {
    const res = await axios.post<string>(`${API_BASE}/packages/${packageId}/rollback`);
    return res.data;
  },
};
