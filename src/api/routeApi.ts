import { apiClient } from './client';
import type { Route, RouteData, RouteNavigation, Stop, Via } from '../model';

export const routeApi = {
  fetchRouteList: async (): Promise<Route[]> => {
    const response = await apiClient.get<Route[]>('/api/routes');
    return response.data;
  },

  fetchRouteData: async (routeId: string): Promise<RouteData> => {
    const response = await apiClient.get<RouteData>(`/api/routes/${routeId}`);
    return response.data;
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
