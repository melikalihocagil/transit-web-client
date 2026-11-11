import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RouteDetail, Stop, Via } from '../model';
import { routeApi, queryClient } from '../api';
import { routingPipeline } from './routingPipeline';

export interface RouteHistorySnapshot {
  stops: Stop[];
  vias: Via[];
}

export interface RouteStoreState {
  routeId: string | null;
  published: RouteDetail | null;
  draft: RouteDetail | null;
  isLoading: boolean;
  isRouting: boolean;
  error: string | null;
  past: RouteHistorySnapshot[];
  future: RouteHistorySnapshot[];

  // UDF Niyetleri (Intent Actions)
  selectRouteIntent: (routeId: string) => Promise<void>;
  removeStopIntent: (stopId: string) => void;
  reorderStopsIntent: (fromIndex: number, toIndex: number) => void;
  addStopIntent: (stop: Stop, atIndex?: number) => void;
  moveDraftStopIntent: (stopId: string, lat: number, lon: number) => void;
  addViaIntent: (via: Via) => void;
  moveViaIntent: (via: Via, lat: number, lon: number) => void;
  removeViaIntent: (via: Via) => void;
  snapViaIntent: (via: Via, targetStop: Stop) => void;
  undoIntent: () => void;
  redoIntent: () => void;
  resetToPublishedIntent: () => void;
  setDraftNavigation: (navigation: RouteDetail['navigation']) => void;
  recalculateDraftRoutingIntent: () => void;
  clearRoute: () => void;
}

// Yardımcı Fonksiyon: Eğer draft henüz yoksa (draft === null), published'dan kopyalayarak draft üretir (Copy-on-Write)
function ensureWorkingDraft(state: { published: RouteDetail | null; draft: RouteDetail | null }): RouteDetail | null {
  if (state.draft) {
    return {
      ...state.draft,
      stops: [...state.draft.stops],
      vias: [...state.draft.vias],
    };
  }
  if (state.published) {
    return {
      stops: [...state.published.stops],
      vias: [...state.published.vias],
      navigation: state.published.navigation,
    };
  }
  return null;
}

const MAX_HISTORY_LENGTH = 30;

function pushSnapshot(
  draft: RouteDetail | null,
  past: RouteHistorySnapshot[]
): { past: RouteHistorySnapshot[]; future: RouteHistorySnapshot[] } {
  if (!draft) {
    return { past, future: [] };
  }
  const snapshot: RouteHistorySnapshot = {
    stops: draft.stops.map((s) => ({ ...s })),
    vias: draft.vias.map((v) => ({ ...v })),
  };
  const nextPast = [...past, snapshot];
  if (nextPast.length > MAX_HISTORY_LENGTH) {
    nextPast.shift();
  }
  return {
    past: nextPast,
    future: [],
  };
}

// Yardımcı Fonksiyon: Asenkron Rota Hesaplama Pipeline'ını Tetikler (Madde 5)
function triggerDraftRouting(
  stops: Stop[],
  vias: Via[],
  set: (partial: Partial<RouteStoreState> | ((state: RouteStoreState) => Partial<RouteStoreState>)) => void,
  get: () => RouteStoreState
): void {
  if (stops.length < 2) {
    set({ isRouting: false });
    return;
  }

  set({ isRouting: true });

  routingPipeline.schedule(stops, vias, {
    onStart: () => {
      set({ isRouting: true });
    },
    onSuccess: (navigation) => {
      const currentDraft = get().draft;
      if (currentDraft) {
        set({
          draft: { ...currentDraft, navigation },
          isRouting: false,
          error: null,
        });
      }
    },
    onError: (err) => {
      set({
        isRouting: false,
        error: err.message || 'Güzergah OSRM rotalaması hesaplanamadı',
      });
    },
    onSettled: () => {
      set({ isRouting: false });
    },
  });
}

export const useRouteStore = create<RouteStoreState>()(
  persist(
    (set, get) => ({
      routeId: null,
      published: null,
      draft: null,
      isLoading: false,
      isRouting: false,
      error: null,
      past: [],
      future: [],

      selectRouteIntent: async (routeId: string) => {
        // Rota değiştiğinde devam eden tüm asenkron hesaplamaları anında iptal et
        routingPipeline.cancel();

        // Eğer yerelde (staging) bu hatta ait kaydedilmemiş bir taslak varsa, sunucudan sadece published'ı tamamlayabiliriz
        const existingDraft = get().draft;
        const isSameRouteStaged = get().routeId === routeId && existingDraft !== null;

        set({ isLoading: true, routeId, error: null, isRouting: false, past: [], future: [] });

        try {
          const data = await queryClient.ensureQueryData({
            queryKey: ['route', routeId],
            queryFn: () => routeApi.fetchRouteData(routeId),
          });

          const activeDraft = isSameRouteStaged ? existingDraft : data.draft;

          set({
            published: data.published,
            draft: activeDraft,
            isLoading: false,
          });

          // Eğer yerel taslağın navigasyonu eksik kalmışsa asenkron OSRM rotalamasını tamamla
          if (activeDraft && !activeDraft.navigation && activeDraft.stops.length >= 2) {
            triggerDraftRouting(activeDraft.stops, activeDraft.vias, set, get);
          }
        } catch (err: unknown) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Hat verisi yüklenemedi',
          });
        }
      },

      removeStopIntent: (stopId: string) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;
        if (draft.stops.length <= 2) return; // Güzergah en az 2 duraktan oluşmalıdır

        const history = pushSnapshot(get().draft, get().past);
        const nextStops = draft.stops.filter((s) => s.stopId !== stopId);
        const nextVias = draft.vias.filter((v) => v.fromStopId !== stopId && v.toStopId !== stopId);

        set({
          ...history,
          draft: {
            stops: nextStops,
            vias: nextVias,
            navigation: null, // Geometri değişti, asenkron OSRM hesaplanacak
          },
        });

        triggerDraftRouting(nextStops, nextVias, set, get);
      },

      reorderStopsIntent: (fromIndex: number, toIndex: number) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;

        const history = pushSnapshot(get().draft, get().past);
        const nextStops = [...draft.stops];
        const [moved] = nextStops.splice(fromIndex, 1);
        nextStops.splice(toIndex, 0, moved);

        // Yeni durak dizilimine göre geçerli kalan (fromStopId -> toStopId) çiftlerini koru
        const validPairs = new Set<string>();
        for (let i = 0; i < nextStops.length - 1; i++) {
          validPairs.add(`${nextStops[i].stopId}->${nextStops[i + 1].stopId}`);
        }
        const nextVias = draft.vias.filter((v) => validPairs.has(`${v.fromStopId}->${v.toStopId}`));

        set({
          ...history,
          draft: {
            stops: nextStops,
            vias: nextVias,
            navigation: null,
          },
        });

        triggerDraftRouting(nextStops, nextVias, set, get);
      },

      addStopIntent: (stop: Stop, atIndex?: number) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;

        const history = pushSnapshot(get().draft, get().past);
        const nextStops = [...draft.stops];
        if (atIndex !== undefined && atIndex >= 0 && atIndex <= nextStops.length) {
          nextStops.splice(atIndex, 0, stop);
        } else {
          nextStops.push(stop);
        }

        set({
          ...history,
          draft: {
            ...draft,
            stops: nextStops,
            navigation: null,
          },
        });

        triggerDraftRouting(nextStops, draft.vias, set, get);
      },

      moveDraftStopIntent: (stopId: string, lat: number, lon: number) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;

        const history = pushSnapshot(get().draft, get().past);
        const nextStops = draft.stops.map((s) => (s.stopId === stopId ? { ...s, lat, lon } : s));

        set({
          ...history,
          draft: {
            ...draft,
            stops: nextStops,
            navigation: null,
          },
        });

        triggerDraftRouting(nextStops, draft.vias, set, get);
      },

      addViaIntent: (via: Via) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;

        const history = pushSnapshot(get().draft, get().past);
        const existingVias = draft.vias.filter(
          (v) => v.fromStopId === via.fromStopId && v.toStopId === via.toStopId
        );
        const newVia: Via = {
          ...via,
          viaSequence: via.viaSequence || existingVias.length + 1,
        };
        const nextVias = [...draft.vias, newVia];

        set({
          ...history,
          draft: {
            ...draft,
            vias: nextVias,
            navigation: null,
          },
        });

        triggerDraftRouting(draft.stops, nextVias, set, get);
      },

      moveViaIntent: (targetVia: Via, lat: number, lon: number) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;

        const history = pushSnapshot(get().draft, get().past);
        const nextVias = draft.vias.map((v) => {
          if (
            v.fromStopId === targetVia.fromStopId &&
            v.toStopId === targetVia.toStopId &&
            v.viaSequence === targetVia.viaSequence
          ) {
            return { ...v, lat, lon };
          }
          return v;
        });

        set({
          ...history,
          draft: {
            ...draft,
            vias: nextVias,
            navigation: null,
          },
        });

        triggerDraftRouting(draft.stops, nextVias, set, get);
      },

      removeViaIntent: (targetVia: Via) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;

        const history = pushSnapshot(get().draft, get().past);
        const nextVias = draft.vias.filter(
          (v) =>
            !(
              v.fromStopId === targetVia.fromStopId &&
              v.toStopId === targetVia.toStopId &&
              v.viaSequence === targetVia.viaSequence
            )
        );

        set({
          ...history,
          draft: {
            ...draft,
            vias: nextVias,
            navigation: null,
          },
        });

        triggerDraftRouting(draft.stops, nextVias, set, get);
      },

      snapViaIntent: (via: Via, targetStop: Stop) => {
        const draft = ensureWorkingDraft(get());
        if (!draft) return;

        const index = draft.stops.findIndex((s) => s.stopId === via.fromStopId);
        if (index === -1) return;

        const history = pushSnapshot(get().draft, get().past);
        const nextStops = [...draft.stops];
        nextStops.splice(index + 1, 0, targetStop);
        const nextVias = draft.vias.filter((v) => v !== via);

        set({
          ...history,
          draft: {
            stops: nextStops,
            vias: nextVias,
            navigation: null,
          },
        });

        triggerDraftRouting(nextStops, nextVias, set, get);
      },

      undoIntent: () => {
        const { draft, past, future } = get();
        if (!draft || past.length === 0) return;

        const previousSnapshot = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        const currentSnapshot: RouteHistorySnapshot = {
          stops: draft.stops.map((s) => ({ ...s })),
          vias: draft.vias.map((v) => ({ ...v })),
        };
        const newFuture = [currentSnapshot, ...future];

        const nextDraft: RouteDetail = {
          stops: previousSnapshot.stops.map((s) => ({ ...s })),
          vias: previousSnapshot.vias.map((v) => ({ ...v })),
          navigation: null,
        };

        set({
          draft: nextDraft,
          past: newPast,
          future: newFuture,
          isRouting: true,
        });

        triggerDraftRouting(nextDraft.stops, nextDraft.vias, set, get);
      },

      redoIntent: () => {
        const { draft, past, future } = get();
        if (!draft || future.length === 0) return;

        const nextSnapshot = future[0];
        const newFuture = future.slice(1);
        const currentSnapshot: RouteHistorySnapshot = {
          stops: draft.stops.map((s) => ({ ...s })),
          vias: draft.vias.map((v) => ({ ...v })),
        };
        const newPast = [...past, currentSnapshot];

        const nextDraft: RouteDetail = {
          stops: nextSnapshot.stops.map((s) => ({ ...s })),
          vias: nextSnapshot.vias.map((v) => ({ ...v })),
          navigation: null,
        };

        set({
          draft: nextDraft,
          past: newPast,
          future: newFuture,
          isRouting: true,
        });

        triggerDraftRouting(nextDraft.stops, nextDraft.vias, set, get);
      },

      resetToPublishedIntent: () => {
        routingPipeline.cancel();
        // Taslağı sıfırla, hem hafızadan hem yerel diskten (localStorage) temizlenir
        set({ draft: null, past: [], future: [], isRouting: false, error: null });
      },

      setDraftNavigation: (navigation) => {
        const currentDraft = get().draft;
        if (!currentDraft) return;
        set({ draft: { ...currentDraft, navigation } });
      },

      recalculateDraftRoutingIntent: () => {
        const draft = get().draft;
        if (!draft || draft.stops.length < 2) return;
        triggerDraftRouting(draft.stops, draft.vias, set, get);
      },

      clearRoute: () => {
        routingPipeline.cancel();
        set({
          routeId: null,
          published: null,
          draft: null,
          past: [],
          future: [],
          error: null,
          isLoading: false,
          isRouting: false,
        });
      },
    }),
    {
      name: 'transit-route-staging', // İstemci kalıcı hafıza anahtarı (Crash Recovery / Staging)
      partialize: (state) => ({
        routeId: state.routeId,
        draft: state.draft, // Sadece üzerinde çalışılan taslak yerelde kilitlenir
      }),
    }
  )
);

// Türetilmiş Durum Seçicileri (Selectors)
export const selectActiveRoute = (state: RouteStoreState): RouteDetail | null =>
  state.draft ?? state.published;

export const selectIsRouteDirty = (state: RouteStoreState): boolean =>
  state.draft !== null;

export const selectIsRouting = (state: RouteStoreState): boolean =>
  state.isRouting;

export const selectCanUndo = (state: RouteStoreState): boolean =>
  state.past.length > 0;

export const selectCanRedo = (state: RouteStoreState): boolean =>
  state.future.length > 0;
