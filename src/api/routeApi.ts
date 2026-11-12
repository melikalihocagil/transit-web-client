import { apiClient } from './client';
import type { AffectedRoute, Route, RouteData, RouteNavigation, Stop, Via } from '../model';

/** `POST /api/routes/save` gövdesindeki bir hat taslağı. */
export interface RouteDraftPayload {
  routeId: string;
  stops: Stop[];
  vias: Via[];
}

export const routeApi = {
  fetchRouteList: async (): Promise<Route[]> => {
    const response = await apiClient.get<Route[]>('/api/routes');
    return response.data;
  },

  fetchRouteData: async (routeId: string): Promise<RouteData> => {
    const response = await apiClient.get<RouteData>(`/api/routes/${routeId}`);
    return response.data;
  },

  /**
   * Verilen hat taslaklarını yazar (hat başına sil-yaz). Sunucu durak koordinatlarını yok sayar;
   * yalnızca durak sırası ve via'lar kaydedilir. Her hattın güncel published/draft verisini döndürür.
   */
  saveRouteDrafts: async (routes: RouteDraftPayload[]): Promise<RouteData[]> => {
    const response = await apiClient.post<RouteData[]>('/api/routes/save', routes);
    return response.data;
  },

  /** Kullanıcının tek bir hat taslağını siler. */
  deleteRouteDraft: async (routeId: string): Promise<void> => {
    await apiClient.delete(`/api/routes/delete/${encodeURIComponent(routeId)}`);
  },

  /** Kullanıcının sunucuda kayıtlı etkilenen hat listesi. */
  fetchAffectedRoutes: async (): Promise<AffectedRoute[]> => {
    const response = await apiClient.get<AffectedRoute[]>('/api/routes/affected');
    return response.data;
  },

  /** Kullanıcının etkilenen hat listesini tamamen verilenle değiştirir; `[]` listeyi temizler. */
  replaceAffectedRoutes: async (affectedRoutes: AffectedRoute[]): Promise<void> => {
    await apiClient.put('/api/routes/affected', affectedRoutes);
  },

  calculateRouting: async (
    stops: Stop[],
    vias: Via[],
    signal?: AbortSignal
  ): Promise<RouteNavigation> => {
    const response = await apiClient.post<RouteNavigation>(
      '/api/routing/calculate',
      { stops, vias },
      { signal }
    );
    return response.data;
  },
};
