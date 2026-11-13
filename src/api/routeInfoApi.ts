import { apiClient } from './client';
import type { RouteInfo, RouteInfoData } from '../model';

export const routeInfoApi = {
  /** Yayındaki hat bilgileri ve kullanıcının taslağı (tam liste; yoksa null). */
  fetchRouteInfos: async (): Promise<RouteInfoData> => {
    const response = await apiClient.get<RouteInfoData>('/api/route-info');
    return response.data;
  },

  /**
   * Kullanıcının taslağını verilen TAM listeyle değiştirir: listede olmayan yayındaki hat silinmiş,
   * `routeId` boş olan hat yeni sayılır (sunucu UUID verir). `[]` taslağı temizler. Güncel durumu döndürür.
   */
  saveRouteInfos: async (routes: RouteInfo[]): Promise<RouteInfoData> => {
    const response = await apiClient.post<RouteInfoData>('/api/route-info/save', routes);
    return response.data;
  },
};
