import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { stopApi } from '../api/stopApi';
import { routeApi } from '../api/routeApi';
import {
  isDeletedStop,
  isSameStopData,
  type AffectedRoute,
  type DraftStop,
  type Stop,
} from '../model';
import {
  hasEditHistory,
  recordEdit,
  registerHistoryLock,
  registerHistorySource,
} from './editHistory';

/**
 * Durak verisi iki katmandan oluşur:
 *
 * - published: Sunucunun döndürdüğü veri. İstemcide asla değiştirilmez, persist edilmez.
 * - draft:     SSoT. Sadece published'dan farklı olan duraklar (farklı / yeni / silinmiş).
 *              Persist edilir; sunucudaki `draft.stops` tablosuyla aynı şekildedir.
 *
 * Ekranda görünen durak: draft[id] ?? published[id]
 */

export type StopRecord = Record<string, Stop>;
export type StopDraft = Record<string, DraftStop>;
/** Etkilenen hatlar (anahtar: routeId). Değerler sunucudaki satırla birebir; kayıtta `Object.values` gönderilir. */
export type AffectedRoutes = Record<string, AffectedRoute>;

const STORAGE_KEY = 'transit-stops';
const LEGACY_STORAGE_KEY = 'transit-stops-staging';

export interface StopDraftState {
  published: StopRecord;
  draft: StopDraft;
  status: 'idle' | 'loading' | 'saving';
  error: string | null;
  /** Hat → o hattın geometrisini değiştiren durak id'leri. Draft her değiştiğinde `/api/stops/move` sonucuyla güncellenir. */
  affectedRoutes: AffectedRoutes;

  loadStops: () => Promise<void>;
  /** Sunucudaki etkilenen hat listesini duraklardan bağımsız çeker (yerelde liste ya da geçmiş varsa çekmez). */
  loadAffectedRoutes: () => Promise<void>;
  moveStop: (stopId: string, lat: number, lon: number) => void;
  /**
   * Haritadan yeni (test) durak ekler: numara `nextNewStopId` ile üretilir, durak taslağa yazılır
   * (geri alınabilir, Kaydet ile sunucuya gider). Eklenen durağın id'sini döner; aralık dolduysa null.
   */
  addStop: (stopName: string, lat: number, lon: number, locationType: number) => string | null;
  /**
   * Bu tarayıcıda verilen son yeni durak numarası. Geri alma numarayı geri vermez; böylece aynı numara
   * iki farklı durağa verilmez (persist edilir).
   */
  lastNewStopNumber: number;
  resetDraft: () => void;
  /**
   * Kaydın son adımı (bkz. `saveAll`): sunucunun güncel durak verisini yazar ve
   * `status`'u idle'a döndürür (geçmişi `saveAll` temizler). Silme işaretleri yerelde kalır. Hata olursa fırlatır, state'e dokunmaz.
   */
  finishStopSave: () => Promise<void>;
}

function toRecord(stops: Stop[] | null | undefined): StopRecord {
  const record: StopRecord = {};
  for (const stop of stops ?? []) {
    record[stop.stopId] = stop;
  }
  return record;
}

/**
 * Draft'tan anlamsız kayıtları atar:
 * - published ile birebir aynı olan duraklar,
 * - published'da hiç olmayan bir durağın silme işareti.
 */
export function normalizeDraft(draft: StopDraft, published: StopRecord): StopDraft {
  const result: StopDraft = {};
  for (const [stopId, entry] of Object.entries(draft)) {
    const original = published[stopId];
    if (isDeletedStop(entry)) {
      if (original) result[stopId] = entry;
    } else if (!original || !isSameStopData(original, entry)) {
      result[stopId] = entry;
    }
  }
  return result;
}

function isSameDraft(a: StopDraft, b: StopDraft): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/**
 * Bir durağın etkilenen hat kayıtlarını verilen hatlarla değiştirir; diğer durakların kayıtlarına
 * dokunmaz. Durağı kalmayan hat listeden düşer. `routeIds` boşsa durağın kayıtları silinir.
 */
function setAffectedForStop(
  current: AffectedRoutes,
  stopId: string,
  routeIds: string[]
): AffectedRoutes {
  const next: AffectedRoutes = {};
  for (const [routeId, entry] of Object.entries(current)) {
    const rest = entry.stopIds.filter((id) => id !== stopId);
    if (rest.length === entry.stopIds.length) next[routeId] = entry;
    else if (rest.length > 0) next[routeId] = { routeId, stopIds: rest };
  }
  for (const routeId of routeIds) {
    next[routeId] = { routeId, stopIds: [...(next[routeId]?.stopIds ?? []), stopId] };
  }
  return next;
}

function toAffectedRecord(rows: AffectedRoute[]): AffectedRoutes {
  const record: AffectedRoutes = {};
  for (const row of rows) {
    record[row.routeId] = row;
  }
  return record;
}

/** İki draft kaydı aynı durak verisini mi taşıyor (ikisi de yok / ikisi de silinmiş / alanlar aynı). */
function isSameEntry(a: DraftStop | undefined, b: DraftStop | undefined): boolean {
  if (!a || !b) return a === b;
  if (isDeletedStop(a) || isDeletedStop(b)) return isDeletedStop(a) && isDeletedStop(b);
  return isSameStopData(a, b);
}

// ---- Yeni (test) durak numaraları: 5XXXX, bu tarayıcıda artarak verilir ----
const NEW_STOP_MIN = 50001;
const NEW_STOP_MAX = 59999;
const NEW_STOP_ID = /^5\d{4}$/;

/**
 * Sıradaki yeni durak numarası: bu tarayıcıda verilen son numara ile yayında / taslakta görülen en büyük
 * 5XXXX numaradan büyük olanın bir fazlası. Aralık dolduysa null.
 */
export function nextNewStopId(
  state: Pick<StopDraftState, 'published' | 'draft' | 'lastNewStopNumber'>
): string | null {
  let max = Math.max(state.lastNewStopNumber, NEW_STOP_MIN - 1);
  for (const stopId of [...Object.keys(state.published), ...Object.keys(state.draft)]) {
    if (NEW_STOP_ID.test(stopId)) max = Math.max(max, Number(stopId));
  }
  return max + 1 <= NEW_STOP_MAX ? String(max + 1) : null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Eski store'un 738 durağın tam kopyasını tuttuğu anahtar; yeni modelde kullanılmıyor.
try {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
} catch {
  // localStorage erişilemiyorsa yapılacak bir şey yok
}

export const useStopDraftStore = create<StopDraftState>()(
  persist(
    (set, get) => {
      /** Tüm draft değişiklikleri buradan geçer: ortak geçmişe ekler, normalize edip yazar. */
      const commit = (nextDraft: StopDraft) => {
        const { draft, published, status } = get();
        // Kayıt sürerken draft kilitli: kayıt sonunda sunucu verisi yazılacağı için değişiklik kaybolurdu
        if (status === 'saving') return;
        const normalized = normalizeDraft(nextDraft, published);
        if (isSameDraft(draft, normalized)) return;
        recordEdit();
        set({ draft: normalized, error: null });
      };

      return {
        published: {},
        draft: {},
        status: 'idle',
        error: null,
        affectedRoutes: {},
        lastNewStopNumber: 0,

        loadStops: async () => {
          set({ status: 'loading', error: null });
          try {
            const data = await stopApi.fetchStops();
            const published = toRecord(data.published);
            const { draft } = get();
            const hasLocalWork = Object.keys(draft).length > 0 || hasEditHistory();

            // Draft, `status` ile aynı set'te yazılır: subscribe bunu sunucu verisi sayar (bkz. aşağısı)
            if (hasLocalWork) {
              // Kaydedilmemiş yerel iş korunur; published'a geçmiş kayıtlar normalize ile düşer.
              set({ published, draft: normalizeDraft(draft, published), status: 'idle' });
            } else {
              set({
                published,
                draft: normalizeDraft(toRecord(data.draft), published),
                status: 'idle',
              });
            }
          } catch (err) {
            set({ status: 'idle', error: errorMessage(err, 'Duraklar yüklenemedi') });
          }
        },

        loadAffectedRoutes: async () => {
          // Durak kuralıyla aynı: yerel liste boş ve geçmiş yoksa sunucudaki alınır
          const hasLocalAffected = () =>
            Object.keys(get().affectedRoutes).length > 0 || hasEditHistory();
          if (hasLocalAffected()) return;
          try {
            const rows = await routeApi.fetchAffectedRoutes();
            // Yükleme sürerken yerelde değişiklik olduysa sunucu listesi yazılmaz
            if (hasLocalAffected()) return;
            set({ affectedRoutes: toAffectedRecord(rows) });
          } catch (err) {
            set({ error: errorMessage(err, 'Etkilenen hatlar yüklenemedi') });
          }
        },

        moveStop: (stopId, lat, lon) => {
          const { draft, published } = get();
          const entry = draft[stopId];
          const current = entry && !isDeletedStop(entry) ? entry : published[stopId];
          if (!current) return;
          commit({ ...draft, [stopId]: { ...current, lat, lon } });
        },

        addStop: (stopName, lat, lon, locationType) => {
          if (get().status === 'saving') return null;
          const stopId = nextNewStopId(get());
          if (stopId === null) {
            set({ error: `Yeni durak numaraları (${NEW_STOP_MIN}–${NEW_STOP_MAX}) doldu` });
            return null;
          }
          set({ lastNewStopNumber: Number(stopId) });
          commit({ ...get().draft, [stopId]: { stopId, stopName, lat, lon, locationType } });
          return stopId;
        },

        resetDraft: () => commit({}),

        finishStopSave: async () => {
          const fresh = await stopApi.fetchStops();
          const published = toRecord(fresh.published);
          const nextDraft: StopDraft = { ...toRecord(fresh.draft) };
          // Silme işaretleri backend'e gönderilemez (lat/lon primitive double); yerelde kalır.
          for (const entry of Object.values(get().draft)) {
            if (isDeletedStop(entry)) nextDraft[entry.stopId] = entry;
          }
          set({
            published,
            draft: normalizeDraft(nextDraft, published),
            status: 'idle',
          });
        },
      };
    },
    {
      name: STORAGE_KEY,
      // v4: geri al geçmişi ortak `editHistory` modülüne taşındı (past/future artık burada tutulmuyor)
      version: 4,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, version) => {
        const state = persisted as Partial<StopDraftState> & {
          affectedRouteIds?: unknown;
          past?: unknown;
          future?: unknown;
        };
        // v1'deki düz hat listesinde durak bilgisi yoktu; taşınamaz, boş başlar
        if (version < 2) {
          delete state.affectedRouteIds;
          state.affectedRoutes = {};
        }
        // v2: Record<routeId, stopId[]> -> v3: Record<routeId, { routeId, stopIds }>
        if (version === 2) {
          const legacy = (state.affectedRoutes ?? {}) as unknown as Record<string, string[]>;
          state.affectedRoutes = Object.fromEntries(
            Object.entries(legacy).map(([routeId, stopIds]) => [routeId, { routeId, stopIds }])
          );
        }
        // v3 -> v4: eski durak geçmişi ortak geçmişe taşınamaz (hat bilgisi yok); atılır
        delete state.past;
        delete state.future;
        return state as StopDraftState;
      },
      partialize: (state) => ({
        draft: state.draft,
        affectedRoutes: state.affectedRoutes,
        lastNewStopNumber: state.lastNewStopNumber,
      }),
    }
  )
);

// ---- Ortak geçmiş: durak taslağı bu store'dan alınır / geri yüklenir ----
registerHistorySource('stops', {
  capture: () => useStopDraftStore.getState().draft,
  restore: (draft) => {
    const { published } = useStopDraftStore.getState();
    useStopDraftStore.setState({ draft: normalizeDraft(draft, published), error: null });
  },
});
registerHistoryLock(() => useStopDraftStore.getState().status === 'saving');

// ---- Etkilenen hatlar: draft'ın her değişimini (taşıma, geri al, ileri al, sıfırla, yükleme) izler ----

// Durak başına istek sırası: aynı durak için yalnızca en son isteğin cevabı yazılır
const affectedRequestSeq: Record<string, number> = {};

useStopDraftStore.subscribe((state, prev) => {
  if (state.draft === prev.draft) return;

  // Yükleme / kayıt sonucu sunucu verisi yazılıyor (`status` aynı set'te idle'a döner): etkilenen hatlar
  // sunucudan alındı ya da az önce sunucuya gönderildi; yeniden hesaplanmaz, yalnızca taslaktan düşen
  // duraklar listeden çıkar. Böylece yüklemede taslaktaki her durak için istek atılmaz.
  const isServerWrite = prev.status !== 'idle' && state.status === 'idle';

  const stopIds = new Set([...Object.keys(prev.draft), ...Object.keys(state.draft)]);
  for (const stopId of stopIds) {
    const before = prev.draft[stopId];
    const after = state.draft[stopId];
    if (isSameEntry(before, after)) continue;

    const seq = (affectedRequestSeq[stopId] ?? 0) + 1;
    affectedRequestSeq[stopId] = seq;

    // Taslaktan düşen ya da silinen durak hiçbir hattı etkilemez: kayıtları hemen silinir
    if (!after || isDeletedStop(after)) {
      useStopDraftStore.setState((s) => ({
        affectedRoutes: setAffectedForStop(s.affectedRoutes, stopId, []),
      }));
      continue;
    }
    if (isServerWrite) continue;

    stopApi
      .moveStop(after)
      .then((routeIds) => {
        if (affectedRequestSeq[stopId] !== seq) return;
        useStopDraftStore.setState((s) => ({
          affectedRoutes: setAffectedForStop(s.affectedRoutes, stopId, routeIds),
        }));
      })
      .catch((err) => {
        if (affectedRequestSeq[stopId] !== seq) return;
        useStopDraftStore.setState({ error: errorMessage(err, 'Etkilenen hatlar hesaplanamadı') });
      });
  }
});

// ---- Seçiciler ----

/** Bir durağın ekrandaki hali: draft ?? published. Silinmiş ya da bilinmeyen durak için undefined. */
export function resolveStop(state: Pick<StopDraftState, 'published' | 'draft'>, stopId: string): Stop | undefined {
  const entry = state.draft[stopId];
  if (entry) return isDeletedStop(entry) ? undefined : entry;
  return state.published[stopId];
}

/** Durak silinmiş mi (taslakta silme işareti var). */
export function isStopDeleted(state: Pick<StopDraftState, 'draft'>, stopId: string): boolean {
  const entry = state.draft[stopId];
  return entry !== undefined && isDeletedStop(entry);
}

let effectiveCache: { published: StopRecord; draft: StopDraft; result: Stop[] } | null = null;

/** Ekranda görünen duraklar: draft ?? published; silinenler hariç, yeni duraklar dahil. */
export function selectEffectiveStops(state: StopDraftState): Stop[] {
  const { published, draft } = state;
  if (effectiveCache?.published === published && effectiveCache.draft === draft) {
    return effectiveCache.result;
  }

  const result: Stop[] = [];
  for (const [stopId, original] of Object.entries(published)) {
    const entry = draft[stopId];
    if (!entry) result.push(original);
    else if (!isDeletedStop(entry)) result.push(entry);
  }
  for (const [stopId, entry] of Object.entries(draft)) {
    if (!published[stopId] && !isDeletedStop(entry)) result.push(entry);
  }

  effectiveCache = { published, draft, result };
  return result;
}

export const selectStopChangeCount = (state: StopDraftState): number =>
  Object.keys(state.draft).length;

let affectedIdsCache: { source: AffectedRoutes; result: string[] } | null = null;

export function selectAffectedRouteIds(state: StopDraftState): string[] {
  if (affectedIdsCache?.source !== state.affectedRoutes) {
    affectedIdsCache = { source: state.affectedRoutes, result: Object.keys(state.affectedRoutes) };
  }
  return affectedIdsCache.result;
}

export const selectAffectedRoutes = (state: StopDraftState): AffectedRoutes =>
  state.affectedRoutes;
