import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LegSlot, RouteDetail, Stop, Via } from '../model';
import {
  insertVia,
  splitViasAtStop,
  isSameVia,
  normalizeViaSequences,
  snapViasToLegs,
} from '../model';
import { routeApi, queryClient } from '../api';
import { routingPipeline } from './routingPipeline';

export interface RouteHistorySnapshot {
  stops: Stop[];
  vias: Via[];
}

export interface RouteStoreState {
  routeId: string | null;
  published: RouteDetail | null;
  /** Kaydedilmemiş hat taslakları (anahtar: routeId). Seçili hattın taslağı `selectActiveDraft` ile türetilir. */
  drafts: Record<string, RouteDetail>;
  isLoading: boolean;
  isRouting: boolean;
  error: string | null;
  past: RouteHistorySnapshot[];
  future: RouteHistorySnapshot[];

  // UDF Niyetleri (Intent Actions)
  selectRouteIntent: (routeId: string) => Promise<void>;
  removeStopIntent: (stopId: string) => void;
  reorderStopsIntent: (fromIndex: number, toIndex: number) => void;
  /** `slot` verilirse durak o bacağın içine eklenir (aralık ikiye bölünür); yoksa sona eklenir. */
  addStopIntent: (stop: Stop, slot?: LegSlot) => void;
  moveDraftStopIntent: (stopId: string, lat: number, lon: number) => void;
  /** Via, tıklanan bacağın kimliğini (fromStopId, toStopId, viaSequence) taşır; sonrakiler kayar. */
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

type SetState = (
  partial: Partial<RouteStoreState> | ((state: RouteStoreState) => Partial<RouteStoreState>)
) => void;
type GetState = () => RouteStoreState;

/** Kalıcı hafızaya yazılan alanlar (taslakların navigation'ı hariç). */
type PersistedRouteState = Pick<RouteStoreState, 'routeId' | 'drafts'>;

// Seçici: Seçili hattın taslağı (saklanan nesnenin kendisi döner; her çağrıda yeni nesne üretilmez)
export const selectActiveDraft = (state: Pick<RouteStoreState, 'routeId' | 'drafts'>): RouteDetail | null =>
  state.routeId !== null ? state.drafts[state.routeId] ?? null : null;

// Yardımcı Fonksiyon: Seçili hattın çalışma taslağını döner; taslak yoksa published'dan kopyalar (Copy-on-Write)
function ensureWorkingDraft(state: RouteStoreState): { routeId: string; draft: RouteDetail } | null {
  const routeId = state.routeId;
  if (routeId === null) return null;

  const existing = state.drafts[routeId];
  if (existing) {
    return {
      routeId,
      draft: { ...existing, stops: [...existing.stops], vias: [...existing.vias] },
    };
  }
  if (state.published) {
    return {
      routeId,
      draft: {
        stops: [...state.published.stops],
        vias: [...state.published.vias],
        navigation: state.published.navigation,
      },
    };
  }
  return null;
}

// Yardımcı Fonksiyon: Eski/yinelenen via sıra numaralarını sessizce düzeltir (değişiklik yoksa aynı referans)
function normalizeDetail(detail: RouteDetail | null): RouteDetail | null {
  if (!detail || !Array.isArray(detail.vias)) return detail;
  const vias = normalizeViaSequences(detail.vias);
  return vias === detail.vias ? detail : { ...detail, vias };
}

// Yardımcı Fonksiyon: Tüm taslaklara normalizeDetail uygular (değişiklik yoksa aynı referans)
function normalizeDrafts(drafts: Record<string, RouteDetail>): Record<string, RouteDetail> {
  let next: Record<string, RouteDetail> | null = null;
  for (const [routeId, detail] of Object.entries(drafts)) {
    const normalized = normalizeDetail(detail);
    if (normalized && normalized !== detail) {
      next ??= { ...drafts };
      next[routeId] = normalized;
    }
  }
  return next ?? drafts;
}

const MAX_HISTORY_LENGTH = 30;

// Yardımcı Fonksiyon: Değişiklikten önceki çalışma taslağını geçmişe yazar.
// Intent'ler buraya ensureWorkingDraft sonucunu verir; taslak yokken bu published kopyasıdır,
// böylece taslaksız hatta yapılan ilk düzenleme de geri alınabilir.
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
// Sonuç yalnızca isteğin başlatıldığı hattın taslağına, o hat hâlâ seçiliyse yazılır.
function triggerDraftRouting(
  routeId: string,
  stops: Stop[],
  vias: Via[],
  set: SetState,
  get: GetState
): void {
  if (stops.length < 2) {
    set({ isRouting: false });
    return;
  }

  set({ isRouting: true });

  const isStillActive = () => get().routeId === routeId;

  routingPipeline.schedule(stops, vias, {
    onStart: () => {
      if (isStillActive()) set({ isRouting: true });
    },
    onSuccess: (navigation) => {
      if (!isStillActive()) return;
      const currentDraft = get().drafts[routeId];
      if (!currentDraft) return;

      // Via'ları OSRM'nin oturttuğu yol noktasına taşı (geçmişe yazılmaz, yeni hesap tetiklemez)
      const snappedVias = snapViasToLegs(currentDraft.stops, currentDraft.vias, navigation);
      set({
        drafts: { ...get().drafts, [routeId]: { ...currentDraft, vias: snappedVias, navigation } },
        isRouting: false,
        error: null,
      });
    },
    onError: (err) => {
      if (!isStillActive()) return;
      set({
        isRouting: false,
        error: err.message || 'Güzergah OSRM rotalaması hesaplanamadı',
      });
    },
    onSettled: () => {
      if (isStillActive()) set({ isRouting: false });
    },
  });
}

// Yardımcı Fonksiyon: Düzenlemeyi seçili hattın taslağına yazar, geçmişe ekler ve rota hesabını tetikler
function commitEdit(
  routeId: string,
  before: RouteDetail,
  stops: Stop[],
  vias: Via[],
  set: SetState,
  get: GetState
): void {
  const history = pushSnapshot(before, get().past);
  set({
    ...history,
    drafts: { ...get().drafts, [routeId]: { stops, vias, navigation: null } }, // Geometri değişti, asenkron OSRM hesaplanacak
  });
  triggerDraftRouting(routeId, stops, vias, set, get);
}

// Yardımcı Fonksiyon: Geri al / yinele sonucu taslağı yazar ve rota hesabını tetikler
function restoreSnapshot(
  routeId: string,
  snapshot: RouteHistorySnapshot,
  history: { past: RouteHistorySnapshot[]; future: RouteHistorySnapshot[] },
  set: SetState,
  get: GetState
): void {
  const nextDraft: RouteDetail = {
    stops: snapshot.stops.map((s) => ({ ...s })),
    vias: snapshot.vias.map((v) => ({ ...v })),
    navigation: null,
  };

  set({
    ...history,
    drafts: { ...get().drafts, [routeId]: nextDraft },
    isRouting: true,
  });

  triggerDraftRouting(routeId, nextDraft.stops, nextDraft.vias, set, get);
}

function toSnapshot(detail: RouteDetail): RouteHistorySnapshot {
  return {
    stops: detail.stops.map((s) => ({ ...s })),
    vias: detail.vias.map((v) => ({ ...v })),
  };
}

export const useRouteStore = create<RouteStoreState>()(
  persist(
    (set, get) => ({
      routeId: null,
      published: null,
      drafts: {},
      isLoading: false,
      isRouting: false,
      error: null,
      past: [],
      future: [],

      selectRouteIntent: async (routeId: string) => {
        // Rota değiştiğinde devam eden tüm asenkron hesaplamaları anında iptal et
        routingPipeline.cancel();

        // Önceki hattın published verisi yeni hatta karışmasın diye yükleme süresince temizlenir
        set({
          isLoading: true,
          routeId,
          published: null,
          error: null,
          isRouting: false,
          past: [],
          future: [],
        });

        try {
          const data = await queryClient.ensureQueryData({
            queryKey: ['route', routeId],
            queryFn: () => routeApi.fetchRouteData(routeId),
          });

          // Yükleme sürerken başka hat seçildiyse bu cevap geçersizdir
          if (get().routeId !== routeId) return;

          // Yerel taslak varsa o, yoksa sunucunun döndürdüğü taslak kullanılır
          const drafts = get().drafts;
          const localDraft = drafts[routeId] ?? null;
          const activeDraft = normalizeDetail(localDraft ?? data.draft ?? null);

          set({
            published: normalizeDetail(data.published),
            drafts:
              activeDraft && activeDraft !== localDraft ? { ...drafts, [routeId]: activeDraft } : drafts,
            isLoading: false,
          });

          // Taslağın navigasyonu yoksa (ör. yerel hafızadan geldiyse) asenkron OSRM rotalamasını tamamla
          if (activeDraft && !activeDraft.navigation && activeDraft.stops.length >= 2) {
            triggerDraftRouting(routeId, activeDraft.stops, activeDraft.vias, set, get);
          }
        } catch (err: unknown) {
          if (get().routeId !== routeId) return;
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Hat verisi yüklenemedi',
          });
        }
      },

      removeStopIntent: (stopId: string) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;
        if (draft.stops.length <= 2) return; // Güzergah en az 2 duraktan oluşmalıdır

        const nextStops = draft.stops.filter((s) => s.stopId !== stopId);
        const nextVias = draft.vias.filter((v) => v.fromStopId !== stopId && v.toStopId !== stopId);

        commitEdit(routeId, draft, nextStops, nextVias, set, get);
      },

      reorderStopsIntent: (fromIndex: number, toIndex: number) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        const nextStops = [...draft.stops];
        const [moved] = nextStops.splice(fromIndex, 1);
        nextStops.splice(toIndex, 0, moved);

        // Yeni durak dizilimine göre geçerli kalan (fromStopId -> toStopId) çiftlerini koru
        const validPairs = new Set<string>();
        for (let i = 0; i < nextStops.length - 1; i++) {
          validPairs.add(`${nextStops[i].stopId}->${nextStops[i + 1].stopId}`);
        }
        const nextVias = draft.vias.filter((v) => validPairs.has(`${v.fromStopId}->${v.toStopId}`));

        commitEdit(routeId, draft, nextStops, nextVias, set, get);
      },

      addStopIntent: (stop: Stop, slot?: LegSlot) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        // Bacak verildiyse araya ekle: aralıktaki via'lar yeni durağın iki yanına bölünür
        let nextStops: Stop[];
        let nextVias: Via[];
        if (slot) {
          const from = draft.stops[slot.segmentIndex];
          const to = draft.stops[slot.segmentIndex + 1];
          if (from?.stopId !== slot.fromStopId || to?.stopId !== slot.toStopId) return;
          nextStops = [...draft.stops];
          nextStops.splice(slot.segmentIndex + 1, 0, stop);
          nextVias = splitViasAtStop(draft.vias, slot, stop.stopId);
        } else {
          nextStops = [...draft.stops, stop];
          nextVias = draft.vias;
        }

        commitEdit(routeId, draft, nextStops, nextVias, set, get);
      },

      moveDraftStopIntent: (stopId: string, lat: number, lon: number) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        const nextStops = draft.stops.map((s) => (s.stopId === stopId ? { ...s, lat, lon } : s));

        commitEdit(routeId, draft, nextStops, draft.vias, set, get);
      },

      addViaIntent: (via: Via) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        // Aynı çiftte bu sıra ve sonrasındaki via'lar bir kayar
        const nextVias = insertVia(draft.vias, via);

        commitEdit(routeId, draft, draft.stops, nextVias, set, get);
      },

      moveViaIntent: (targetVia: Via, lat: number, lon: number) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        const nextVias = draft.vias.map((v) => (isSameVia(v, targetVia) ? { ...v, lat, lon } : v));

        commitEdit(routeId, draft, draft.stops, nextVias, set, get);
      },

      removeViaIntent: (targetVia: Via) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        // Silinen via'nın çiftindeki sonraki via'lar boşluksuz yeniden numaralanır
        const nextVias = normalizeViaSequences(draft.vias.filter((v) => !isSameVia(v, targetVia)));

        commitEdit(routeId, draft, draft.stops, nextVias, set, get);
      },

      snapViaIntent: (via: Via, targetStop: Stop) => {
        const working = ensureWorkingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        // Via'nın ait olduğu aralık durak çiftiyle aranır (aynı durak hatta iki kez geçebilir)
        const segmentIndex = draft.stops.findIndex(
          (s, i) => s.stopId === via.fromStopId && draft.stops[i + 1]?.stopId === via.toStopId
        );
        if (segmentIndex === -1) return;

        // Via durakla yer değiştirir: önceki via'lar (from -> durak), sonrakiler (durak -> to) çiftine geçer
        const remainingVias = normalizeViaSequences(draft.vias.filter((v) => !isSameVia(v, via)));
        const slot: LegSlot = {
          segmentIndex,
          fromStopId: via.fromStopId,
          toStopId: via.toStopId,
          viaSequence: via.viaSequence,
        };
        const nextVias = splitViasAtStop(remainingVias, slot, targetStop.stopId);
        const nextStops = [...draft.stops];
        nextStops.splice(segmentIndex + 1, 0, targetStop);

        commitEdit(routeId, draft, nextStops, nextVias, set, get);
      },

      undoIntent: () => {
        const { routeId, past, future } = get();
        const draft = selectActiveDraft(get());
        if (routeId === null || !draft || past.length === 0) return;

        const previousSnapshot = past[past.length - 1];
        restoreSnapshot(
          routeId,
          previousSnapshot,
          { past: past.slice(0, past.length - 1), future: [toSnapshot(draft), ...future] },
          set,
          get
        );
      },

      redoIntent: () => {
        const { routeId, past, future } = get();
        const draft = selectActiveDraft(get());
        if (routeId === null || !draft || future.length === 0) return;

        const nextSnapshot = future[0];
        restoreSnapshot(
          routeId,
          nextSnapshot,
          { past: [...past, toSnapshot(draft)], future: future.slice(1) },
          set,
          get
        );
      },

      resetToPublishedIntent: () => {
        routingPipeline.cancel();
        // Yalnızca seçili hattın taslağı silinir (hem hafızadan hem yerel diskten); diğer hatlar korunur
        const { routeId, drafts } = get();
        let nextDrafts = drafts;
        if (routeId !== null && routeId in drafts) {
          nextDrafts = { ...drafts };
          delete nextDrafts[routeId];
        }
        set({ drafts: nextDrafts, past: [], future: [], isRouting: false, error: null });
      },

      setDraftNavigation: (navigation) => {
        const { routeId, drafts } = get();
        const currentDraft = selectActiveDraft(get());
        if (routeId === null || !currentDraft) return;
        set({ drafts: { ...drafts, [routeId]: { ...currentDraft, navigation } } });
      },

      recalculateDraftRoutingIntent: () => {
        const routeId = get().routeId;
        const draft = selectActiveDraft(get());
        if (routeId === null || !draft || draft.stops.length < 2) return;
        triggerDraftRouting(routeId, draft.stops, draft.vias, set, get);
      },

      clearRoute: () => {
        routingPipeline.cancel();
        // Yalnızca seçim temizlenir; kaydedilmemiş hat taslakları (drafts) korunur
        set({
          routeId: null,
          published: null,
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
      // Sürüm 1: tek `draft` yerine hat kimliğine göre `drafts`
      version: 1,
      // Taslaklar navigation olmadan saklanır (bacak koordinatları büyük; hat seçilince yeniden hesaplanır)
      partialize: (state): PersistedRouteState => ({
        routeId: state.routeId,
        drafts: Object.fromEntries(
          Object.entries(state.drafts).map(([routeId, detail]) => [routeId, { ...detail, navigation: null }])
        ),
      }),
      // Eski biçim { routeId, draft } -> { routeId, drafts: { [routeId]: draft } }
      migrate: (persistedState, version) => {
        const persisted = (persistedState ?? {}) as {
          routeId?: string | null;
          draft?: RouteDetail | null;
          drafts?: Record<string, RouteDetail>;
        };
        if (version < 1) {
          const routeId = persisted.routeId ?? null;
          const drafts: Record<string, RouteDetail> =
            routeId !== null && persisted.draft ? { [routeId]: persisted.draft } : {};
          return { routeId, drafts } satisfies PersistedRouteState;
        }
        return persisted as PersistedRouteState;
      },
      // Yüklemede yinelenen via sıra numaralarını sessizce düzelt
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PersistedRouteState>;
        return {
          ...currentState,
          routeId: persisted.routeId ?? currentState.routeId,
          drafts: normalizeDrafts(persisted.drafts ?? currentState.drafts),
        };
      },
      // Sayfa yenilenince seçili hat yeniden yüklenir: published gelir, navigation'ı olmayan taslak yeniden hesaplanır
      onRehydrateStorage: () => (state) => {
        const routeId = state?.routeId;
        if (!state || !routeId) return;
        queueMicrotask(() => {
          void state.selectRouteIntent(routeId);
        });
      },
    }
  )
);

// Türetilmiş Durum Seçicileri (Selectors)
export const selectActiveRoute = (state: RouteStoreState): RouteDetail | null =>
  selectActiveDraft(state) ?? state.published;

export const selectIsRouteDirty = (state: RouteStoreState): boolean =>
  selectActiveDraft(state) !== null;

export const selectIsRouting = (state: RouteStoreState): boolean =>
  state.isRouting;

export const selectCanUndo = (state: RouteStoreState): boolean =>
  state.past.length > 0;

export const selectCanRedo = (state: RouteStoreState): boolean =>
  state.future.length > 0;
