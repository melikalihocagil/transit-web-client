import { apiClient } from './client';
import type { Stop, StopsData } from '../model';

export const stopApi = {
  /** Published duraklar ve kullanıcının sunucuda kayıtlı durak taslağı (yoksa null). */
  fetchStops: async (): Promise<StopsData> => {
    const response = await apiClient.get<StopsData>('/api/stops');
    return response.data;
  },

  /** Verilen durakları kullanıcının taslağına yazar. Listede olmayan taslak kayıtlara dokunmaz. */
  saveStops: async (stops: Stop[]): Promise<void> => {
    await apiClient.post('/api/stops/save', stops);
  },

  /** Kullanıcının tek bir durak taslağını siler. */
  deleteStopDraft: async (stopId: string): Promise<void> => {
    await apiClient.delete(`/api/stops/delete/${encodeURIComponent(stopId)}`);
  },

  /**
   * Durağı kaydetmez; sunucuda kayıtlı taslağa göre bu durak yüzünden
   * geometrisi değişen hatların id'lerini döndürür.
   */
  moveStop: async (stop: Stop): Promise<string[]> => {
    const response = await apiClient.post<string[]>('/api/stops/move', stop);
    return response.data;
  },
};
