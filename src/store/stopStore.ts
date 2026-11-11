import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Stop } from '../model';
import { stopApi, queryClient } from '../api';

export interface StopStoreState {
  publishedStops: Stop[];
  draftStops: Stop[] | null;
  isLoading: boolean;
  error: string | null;
  affectedRouteIds: string[];

  // UDF Niyetleri (Intent Actions)
  loadStopsIntent: () => Promise<void>;
  moveStopIntent: (stopId: string, lat: number, lon: number) => Promise<void>;
  resetStopsIntent: () => void;
  clearAffectedRoutesIntent: () => void;
}

export const useStopStore = create<StopStoreState>()(
  persist(
    (set, get) => ({
      publishedStops: [],
      draftStops: null,
      isLoading: false,
      error: null,
      affectedRouteIds: [],

      loadStopsIntent: async () => {
        const existingDraft = get().draftStops;
        set({ isLoading: true, error: null });

        try {
          const data = await queryClient.ensureQueryData({
            queryKey: ['stops'],
            queryFn: stopApi.fetchStops,
          });

          set({
            publishedStops: data.published,
            // Yerel hafızada (staging) henüz sunucuya gönderilmemiş durak taşıma varsa onu koru
            draftStops: existingDraft !== null ? existingDraft : data.draft,
            isLoading: false,
          });
        } catch (err: unknown) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Şehir durakları yüklenemedi',
          });
        }
      },

      moveStopIntent: async (stopId: string, lat: number, lon: number) => {
        // 1. İyimser Güncelleme: Mevcut listede durağın koordinatını hemen güncelle (anında diske mühürlenir)
        const baseList = get().draftStops ?? get().publishedStops;
        const currentStop = baseList.find((s) => s.stopId === stopId);
        const updatedStop: Stop = currentStop
          ? { ...currentStop, lat, lon }
          : { stopId, stopName: '', lat, lon, locationType: 0 };

        const nextDraft = baseList.map((s) => (s.stopId === stopId ? updatedStop : s));

        set({ draftStops: nextDraft, error: null });

        try {
          // 2. Backend'e bildir (Java 25 Virtual Threads paralel etki analizi yapar)
          const affectedRoutes = await stopApi.moveStop(updatedStop);
          set({ affectedRouteIds: affectedRoutes });
        } catch (err: unknown) {
          // 3. Hata olursa resmi durak haline geri al (Rollback)
          set({
            draftStops: get().publishedStops,
            error: err instanceof Error ? err.message : 'Durak konumu güncellenemedi',
          });
        }
      },

      resetStopsIntent: () => {
        // Yerel taslağı sıfırla
        set({ draftStops: null, affectedRouteIds: [], error: null });
      },

      clearAffectedRoutesIntent: () => {
        set({ affectedRouteIds: [] });
      },
    }),
    {
      name: 'transit-stops-staging', // İstemci kalıcı hafıza anahtarı
      partialize: (state) => ({
        draftStops: state.draftStops,
        affectedRouteIds: state.affectedRouteIds,
      }),
    }
  )
);

// Türetilmiş Durum Seçicileri (Selectors)
export const selectActiveStops = (state: StopStoreState): Stop[] =>
  state.draftStops ?? state.publishedStops;

export const selectIsStopsDirty = (state: StopStoreState): boolean =>
  state.draftStops !== null;

export const selectAffectedRouteIds = (state: StopStoreState): string[] =>
  state.affectedRouteIds;
