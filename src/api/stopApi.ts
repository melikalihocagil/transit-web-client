import { apiClient } from './client';
import type { Stop, StopsData } from '../model';

export const stopApi = {
  fetchStops: async (): Promise<StopsData> => {
    const response = await apiClient.get<StopsData>('/api/stops');
    return response.data;
  },

  moveStop: async (stop: Stop): Promise<string[]> => {
    const response = await apiClient.post<string[]>('/api/stops/move', stop);
    return response.data;
  },
};
