import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LegSlot, RouteDetail, RouteNavigation, Stop, Via } from '../model';
import {
  insertVia,
  splitViasAtStop,
  isSameVia,
  isSameCoordinate,
  normalizeViaSequences,
  snapViasToLegs,
} from '../model';
import { routeApi, queryClient } from '../api';
import { routingPipeline } from './routingPipeline';
import { useStopDraftStore, resolveStop, isStopDeleted, type StopDraftState } from './stopDraftStore';
import { recordEdit, registerHistorySource, type RouteDraft } from './editHistory';

export type { RouteDraft };

/**
 * Hat verisi:
 *
 * - published: Sunucunun döndürdüğü seçili hat (durak nesneleri + via'lar + navigasyon). Değiştirilmez.
 * - drafts:    SSoT. Yalnızca published'dan farklı hatlar; her biri yalnızca durak SIRASI (`stopIds`) ve via'lar.
 *              Durak KONUMU hat taslağında tutulmaz: her zaman durak store'undan (draft ?? published) çözümlenir.
 *              Yayındakiyle aynı hale gelen taslak silinir.
 * - navigation: Seçili hattın OSRM ile hesaplanmış güzergahı (türetilmiş önbellek, persist edilmez).
 *              Hat taslağı yoksa ve durak konumları yayındakiyle aynıysa `published.navigation` kullanılır.
 *
 * Geri al / ileri al ortak geçmiştedir (`editHistory`); hat pini taşımak bir durak değişikliğidir.
 */
export interface RouteStoreState {
  routeId: string | null;
  published: RouteDetail | null;
  /** Hat taslakları (anahtar: routeId). */
  drafts: Record<string, RouteDraft>;
  /**
   * Sunucuda kayıtlı olduğunu bildiğimiz hat taslakları (anahtar: routeId). Hat yüklenince ve kayıttan
   * sonra güncellenir. Kaydedilmemiş hatlar `drafts` ile karşılaştırılarak türetilir (`selectUnsavedRouteIds`).
   */
  saved: Record<string, RouteDraft>;
  navigation: RouteNavigation | null;
  isLoading: boolean;
  isRouting: boolean;
  error: string | null;

  // UDF Niyetleri (Intent Actions)
  selectRouteIntent: (routeId: string) => Promise<void>;
  /**
   * Hattın `index` sırasındaki durağını hattan çıkarır (durağın kendisine ve diğer hatlara dokunmaz).
   * Sıra numarasıyla çalışır: aynı durak hatta iki kez geçiyorsa yalnızca o sıra çıkar. Durağın iki
   * yanındaki bacakların via'ları silinir; komşular doğrudan bağlanır. Hat 2 duraktan aza düşemez.
   */
  removeStopIntent: (index: number) => void;
  reorderStopsIntent: (fromIndex: number, toIndex: number) => void;
  /** `slot` verilirse durak o bacağın içine eklenir (aralık ikiye bölünür); yoksa sona eklenir. */
  addStopIntent: (stop: Stop, slot?: LegSlot) => void;
  /** Via, tıklanan bacağın kimliğini (fromStopId, toStopId, viaSequence) taşır; sonrakiler kayar. */
  addViaIntent: (via: Via) => void;
  moveViaIntent: (via: Via, lat: number, lon: number) => void;
  removeViaIntent: (via: Via) => void;
  snapViaIntent: (via: Via, targetStop: Stop) => void;
  /** Tüm hat taslaklarını sunucudaki kayıtlı hale (`saved`) döndürür. Geçmişe yazılmaz (bkz. `discardLocalWork`). */
  discardDrafts: () => void;
  clearRoute: () => void;
}

/** Kalıcı hafızaya yazılan alanlar. Seçili hat (`routeId`) yazılmaz: adresten okunur (bkz. useRouteUrlSync). */
type PersistedRouteState = Pick<RouteStoreState, 'drafts' | 'saved'>;

/** Kayıt sürerken (durak + hat kaydı tek akışta; bkz. `saveAll`) hat taslakları da düzenlenemez. */
const isSaveLocked = (): boolean => useStopDraftStore.getState().status === 'saving';

// ---- Yardımcılar ----

/** Sunucudan gelen hat verisinin taslak biçimi (yalnızca sıra + via'lar; via sıraları normalize). */
export function toRouteDraft(detail: Pick<RouteDetail, 'stops' | 'vias'>): RouteDraft {
  return {
    stopIds: detail.stops.map((s) => s.stopId),
    vias: normalizeViaSequences(detail.vias ?? []),
  };
}

/**
 * İki hat taslağı aynı mı: durak id sırası ve via'lar (kimlik + konum).
 * Via sırası dizide farklı olabilir (sunucu sıralı döndürür); konumda ~1 m tolerans vardır (OSRM oturtması / DB yuvarlaması).
 */
export function isSameRouteDraft(a: RouteDraft, b: RouteDraft): boolean {
  return (
    a.stopIds.length === b.stopIds.length &&
    a.stopIds.every((id, i) => id === b.stopIds[i]) &&
    a.vias.length === b.vias.length &&
    a.vias.every((via) => b.vias.some((other) => isSameVia(via, other) && isSameCoordinate(via, other)))
  );
}

/**
 * Hat durak sırasını konumlu durak listesine çevirir. Konum durak store'undan (draft ?? published) gelir;
 * durak store'u henüz yüklenmediyse `fallback` (hattın sunucudan gelen durakları) kullanılır.
 * Silinmiş (tombstone) ve hiçbir yerde bulunamayan duraklar atlanır.
 */
export function resolveRouteStops(
  stopIds: string[],
  stopState: Pick<StopDraftState, 'published' | 'draft'>,
  fallback: Stop[] = []
): Stop[] {
  const fallbackById = new Map(fallback.map((s) => [s.stopId, s]));
  const result: Stop[] = [];
  for (const stopId of stopIds) {
    if (isStopDeleted(stopState, stopId)) continue;
    const stop = resolveStop(stopState, stopId) ?? fallbackById.get(stopId);
    if (stop) result.push(stop);
  }
  return result;
}

function normalizeRouteDraft(draft: RouteDraft): RouteDraft {
  const vias = normalizeViaSequences(draft.vias);
  return vias === draft.vias ? draft : { ...draft, vias };
}

function normalizeDrafts(drafts: Record<string, RouteDraft>): Record<string, RouteDraft> {
  let next: Record<string, RouteDraft> | null = null;
  for (const [routeId, draft] of Object.entries(drafts)) {
    const normalized = normalizeRouteDraft(draft);
    if (normalized !== draft) {
      next ??= { ...drafts };
      next[routeId] = normalized;
    }
  }
  return next ?? drafts;
}

function normalizePublished(detail: RouteDetail): RouteDetail {
  const vias = normalizeViaSequences(detail.vias ?? []);
  return vias === detail.vias ? detail : { ...detail, vias };
}

/** Eski biçimlerden ({ stops: Stop[], vias, navigation }) ya da yeni biçimden hat taslağı üretir. */
function fromPersistedDraft(value: unknown): RouteDraft | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { stopIds?: unknown; stops?: unknown; vias?: unknown };
  const vias = Array.isArray(v.vias) ? (v.vias as Via[]) : [];
  if (Array.isArray(v.stopIds)) return { stopIds: v.stopIds as string[], vias };
  if (Array.isArray(v.stops)) return { stopIds: (v.stops as Stop[]).map((s) => s.stopId), vias };
  return null;
}

function fromPersistedRecord(record: unknown): Record<string, RouteDraft> {
  const result: Record<string, RouteDraft> = {};
  if (!record || typeof record !== 'object') return result;
  for (const [routeId, value] of Object.entries(record as Record<string, unknown>)) {
    const draft = fromPersistedDraft(value);
    if (draft) result[routeId] = draft;
  }
  return result;
}

// ---- Aktif hat (seçili hattın sırası + çözümlenmiş durak konumları + navigasyon) ----

interface ActiveRouteResult {
  detail: RouteDetail;
  /** Hat taslağı yok ve durak konumları yayındakiyle aynı: published navigasyonu geçerli. */
  usesPublishedNavigation: boolean;
}

type ActiveRouteInput = Pick<RouteStoreState, 'routeId' | 'published' | 'drafts' | 'navigation'>;
type StopInput = Pick<StopDraftState, 'published' | 'draft'>;

let activeCache: {
  routeId: string | null;
  published: RouteDetail | null;
  draft: RouteDraft | undefined;
  navigation: RouteNavigation | null;
  stopPublished: StopInput['published'];
  stopDraft: StopInput['draft'];
  result: ActiveRouteResult | null;
} | null = null;

function isSameStopList(a: Stop[], b: Stop[]): boolean {
  return a.length === b.length && a.every((stop, i) => stop === b[i]);
}

function matchesPublishedPositions(stops: Stop[], publishedStops: Stop[]): boolean {
  return (
    stops.length === publishedStops.length &&
    stops.every(
      (stop, i) =>
        stop.stopId === publishedStops[i].stopId &&
        stop.lat === publishedStops[i].lat &&
        stop.lon === publishedStops[i].lon
    )
  );
}

function computeActive(routeState: ActiveRouteInput, stopState: StopInput): ActiveRouteResult | null {
  const { routeId, published, navigation } = routeState;
  const draft = routeId !== null ? routeState.drafts[routeId] : undefined;

  if (
    activeCache &&
    activeCache.routeId === routeId &&
    activeCache.published === published &&
    activeCache.draft === draft &&
    activeCache.navigation === navigation &&
    activeCache.stopPublished === stopState.published &&
    activeCache.stopDraft === stopState.draft
  ) {
    return activeCache.result;
  }

  let result: ActiveRouteResult | null = null;
  if (routeId !== null && published) {
    const stopIds = draft ? draft.stopIds : published.stops.map((s) => s.stopId);
    const vias = draft ? draft.vias : published.vias;
    let stops = resolveRouteStops(stopIds, stopState, published.stops);

    // Durak nesneleri değişmediyse dizi referansı korunur (gereksiz harita/panel yeniden çizimi olmasın)
    const previous = activeCache?.result?.detail;
    if (previous && isSameStopList(previous.stops, stops)) stops = previous.stops;

    const usesPublishedNavigation = !draft && matchesPublishedPositions(stops, published.stops);
    const nav = usesPublishedNavigation ? published.navigation : navigation;

    result =
      previous && previous.stops === stops && previous.vias === vias && previous.navigation === nav
        ? { detail: previous, usesPublishedNavigation }
        : { detail: { stops, vias, navigation: nav }, usesPublishedNavigation };
  }

  activeCache = {
    routeId,
    published,
    draft,
    navigation,
    stopPublished: stopState.published,
    stopDraft: stopState.draft,
    result,
  };
  return result;
}

/** Seçili hattın ekrandaki hali: sıra (taslak ?? yayındaki) + durak store'undan çözümlenmiş konumlar + navigasyon. */
export function computeActiveRoute(routeState: ActiveRouteInput, stopState: StopInput): RouteDetail | null {
  return computeActive(routeState, stopState)?.detail ?? null;
}

/** Bileşenler için: iki store'u birlikte izleyen, referansı kararlı aktif hat. */
export function useActiveRoute(): RouteDetail | null {
  const routeId = useRouteStore((s) => s.routeId);
  const published = useRouteStore((s) => s.published);
  const drafts = useRouteStore((s) => s.drafts);
  const navigation = useRouteStore((s) => s.navigation);
  const stopPublished = useStopDraftStore((s) => s.published);
  const stopDraft = useStopDraftStore((s) => s.draft);
  return computeActiveRoute(
    { routeId, published, drafts, navigation },
    { published: stopPublished, draft: stopDraft }
  );
}

// ---- Düzenleme ----

type SetState = (
  partial: Partial<RouteStoreState> | ((state: RouteStoreState) => Partial<RouteStoreState>)
) => void;
type GetState = () => RouteStoreState;

/** Seçili hattın çalışma taslağı: yerel taslak ya da yayındakinin sırası. */
function workingDraft(state: RouteStoreState): { routeId: string; draft: RouteDraft } | null {
  const { routeId, published } = state;
  if (routeId === null) return null;
  const existing = state.drafts[routeId];
  if (existing) return { routeId, draft: existing };
  if (published) return { routeId, draft: toRouteDraft(published) };
  return null;
}

/**
 * Düzenlemeyi seçili hattın taslağına yazar: ortak geçmişe ekler; yayındakiyle aynı hale geldiyse taslağı siler.
 * Rota hesabı abonelik (`syncRouting`) üzerinden tetiklenir.
 */
function commitRouteEdit(routeId: string, next: RouteDraft, set: SetState, get: GetState): void {
  if (isSaveLocked()) return;
  const { drafts, published } = get();
  const current = drafts[routeId];
  const normalized = normalizeRouteDraft(next);
  const isPublished = published !== null && isSameRouteDraft(normalized, toRouteDraft(published));

  if (isPublished ? current === undefined : current !== undefined && isSameRouteDraft(current, normalized)) {
    return;
  }

  recordEdit();
  const nextDrafts = { ...drafts };
  if (isPublished) delete nextDrafts[routeId];
  else nextDrafts[routeId] = normalized;
  set({ drafts: nextDrafts, error: null });
}

export const useRouteStore = create<RouteStoreState>()(
  persist(
    (set, get) => ({
      routeId: null,
      published: null,
      drafts: {},
      saved: {},
      navigation: null,
      isLoading: false,
      isRouting: false,
      error: null,

      selectRouteIntent: async (routeId: string) => {
        // Önceki hattın published verisi yeni hatta karışmasın diye yükleme süresince temizlenir
        set({
          isLoading: true,
          routeId,
          published: null,
          navigation: null,
          error: null,
          isRouting: false,
        });

        try {
          const data = await queryClient.ensureQueryData({
            queryKey: ['route', routeId],
            queryFn: () => routeApi.fetchRouteData(routeId),
          });

          // Yükleme sürerken başka hat seçildiyse bu cevap geçersizdir
          if (get().routeId !== routeId) return;

          const published = normalizePublished(data.published);
          const publishedDraft = toRouteDraft(published);
          const { drafts, saved } = get();

          // Sunucudaki taslak kayıtlı hal olarak tutulur; yoksa bu hat için kayıtlı taslak da yoktur
          const nextSaved = { ...saved };
          if (data.draft) nextSaved[routeId] = toRouteDraft(data.draft);
          else delete nextSaved[routeId];

          // Yerel taslak varsa o, yoksa sunucunun taslağı; yayındakiyle aynı olan taslak tutulmaz
          let nextDrafts = drafts;
          const local = drafts[routeId];
          if (local && isSameRouteDraft(local, publishedDraft)) {
            nextDrafts = { ...drafts };
            delete nextDrafts[routeId];
          } else if (!local && data.draft) {
            const serverDraft = toRouteDraft(data.draft);
            if (!isSameRouteDraft(serverDraft, publishedDraft)) {
              nextDrafts = { ...drafts, [routeId]: serverDraft };
            }
          }

          set({ published, drafts: nextDrafts, saved: nextSaved, isLoading: false });
        } catch (err: unknown) {
          if (get().routeId !== routeId) return;
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Hat verisi yüklenemedi',
          });
        }
      },

      removeStopIntent: (index: number) => {
        const working = workingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;
        const stopId = draft.stopIds[index];
        if (stopId === undefined) return;
        if (draft.stopIds.length <= 2) {
          set({ error: 'Hat en az 2 duraktan oluşmalıdır; durak çıkarılamadı' });
          return;
        }

        // Yalnızca bu sıranın iki yanındaki bacakların via'ları silinir
        const prevId = draft.stopIds[index - 1];
        const nextId = draft.stopIds[index + 1];
        const isAdjacentLeg = (v: Via) =>
          (v.fromStopId === prevId && v.toStopId === stopId) || (v.fromStopId === stopId && v.toStopId === nextId);

        commitRouteEdit(
          routeId,
          {
            stopIds: draft.stopIds.filter((_, i) => i !== index),
            vias: draft.vias.filter((v) => !isAdjacentLeg(v)),
          },
          set,
          get
        );
      },

      reorderStopsIntent: (fromIndex: number, toIndex: number) => {
        const working = workingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        const stopIds = [...draft.stopIds];
        const [moved] = stopIds.splice(fromIndex, 1);
        stopIds.splice(toIndex, 0, moved);

        // Yeni durak dizilimine göre geçerli kalan (fromStopId -> toStopId) çiftlerini koru
        const validPairs = new Set<string>();
        for (let i = 0; i < stopIds.length - 1; i++) {
          validPairs.add(`${stopIds[i]}->${stopIds[i + 1]}`);
        }
        const vias = draft.vias.filter((v) => validPairs.has(`${v.fromStopId}->${v.toStopId}`));

        commitRouteEdit(routeId, { stopIds, vias }, set, get);
      },

      addStopIntent: (stop: Stop, slot?: LegSlot) => {
        const working = workingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        // Bacak verildiyse araya ekle: aralıktaki via'lar yeni durağın iki yanına bölünür
        if (slot) {
          const from = draft.stopIds[slot.segmentIndex];
          const to = draft.stopIds[slot.segmentIndex + 1];
          if (from !== slot.fromStopId || to !== slot.toStopId) return;
          const stopIds = [...draft.stopIds];
          stopIds.splice(slot.segmentIndex + 1, 0, stop.stopId);
          commitRouteEdit(
            routeId,
            { stopIds, vias: splitViasAtStop(draft.vias, slot, stop.stopId) },
            set,
            get
          );
          return;
        }

        commitRouteEdit(routeId, { stopIds: [...draft.stopIds, stop.stopId], vias: draft.vias }, set, get);
      },

      addViaIntent: (via: Via) => {
        const working = workingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;
        // Aynı çiftte bu sıra ve sonrasındaki via'lar bir kayar
        commitRouteEdit(routeId, { ...draft, vias: insertVia(draft.vias, via) }, set, get);
      },

      moveViaIntent: (targetVia: Via, lat: number, lon: number) => {
        const working = workingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;
        const vias = draft.vias.map((v) => (isSameVia(v, targetVia) ? { ...v, lat, lon } : v));
        commitRouteEdit(routeId, { ...draft, vias }, set, get);
      },

      removeViaIntent: (targetVia: Via) => {
        const working = workingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;
        // Silinen via'nın çiftindeki sonraki via'lar boşluksuz yeniden numaralanır
        const vias = normalizeViaSequences(draft.vias.filter((v) => !isSameVia(v, targetVia)));
        commitRouteEdit(routeId, { ...draft, vias }, set, get);
      },

      snapViaIntent: (via: Via, targetStop: Stop) => {
        const working = workingDraft(get());
        if (!working) return;
        const { routeId, draft } = working;

        // Via'nın ait olduğu aralık durak çiftiyle aranır (aynı durak hatta iki kez geçebilir)
        const segmentIndex = draft.stopIds.findIndex(
          (id, i) => id === via.fromStopId && draft.stopIds[i + 1] === via.toStopId
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
        const stopIds = [...draft.stopIds];
        stopIds.splice(segmentIndex + 1, 0, targetStop.stopId);

        commitRouteEdit(
          routeId,
          { stopIds, vias: splitViasAtStop(remainingVias, slot, targetStop.stopId) },
          set,
          get
        );
      },

      discardDrafts: () => {
        set((state) => ({ drafts: { ...state.saved }, error: null }));
      },

      clearRoute: () => {
        // Yalnızca seçim temizlenir; kaydedilmemiş hat taslakları (drafts) korunur
        set({
          routeId: null,
          published: null,
          navigation: null,
          error: null,
          isLoading: false,
          isRouting: false,
        });
      },
    }),
    {
      name: 'transit-route-staging', // İstemci kalıcı hafıza anahtarı (Crash Recovery / Staging)
      // Sürüm 1: tek `draft` yerine hat kimliğine göre `drafts`
      // Sürüm 2: taslak yalnızca durak sırası (`stopIds`) + via'lar; koordinat ve navigation tutulmaz
      version: 2,
      partialize: (state): PersistedRouteState => ({
        drafts: state.drafts,
        saved: state.saved,
      }),
      migrate: (persistedState, version) => {
        const persisted = (persistedState ?? {}) as {
          routeId?: string | null;
          draft?: unknown;
          drafts?: unknown;
          saved?: unknown;
        };
        const routeId = persisted.routeId ?? null;
        // v0: { routeId, draft } -> { [routeId]: draft }
        const rawDrafts =
          version < 1 ? (routeId !== null && persisted.draft ? { [routeId]: persisted.draft } : {}) : persisted.drafts;
        return {
          drafts: fromPersistedRecord(rawDrafts),
          saved: version < 1 ? {} : fromPersistedRecord(persisted.saved),
        } satisfies PersistedRouteState;
      },
      // Yüklemede yinelenen via sıra numaralarını sessizce düzelt
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PersistedRouteState>;
        // Eski kayıtlardaki `routeId` yok sayılır; seçili hat adresten gelir
        return {
          ...currentState,
          drafts: normalizeDrafts(persisted.drafts ?? currentState.drafts),
          saved: persisted.saved ?? currentState.saved,
        };
      },
    }
  )
);

// ---- Ortak geçmiş: hat taslakları bu store'dan alınır / geri yüklenir ----
registerHistorySource('routes', {
  capture: () => useRouteStore.getState().drafts,
  restore: (drafts) => useRouteStore.setState({ drafts: normalizeDrafts(drafts), error: null }),
});

// ---- Rota hesabı: seçili hattın sırası, via'ları ya da durak konumları değişince ----

/** Son planlanan hesabın girdisi; aynı girdiyle tekrar hesap yapılmaz. */
let routingKey: string | null = null;
/** Hesap sonucunu yazarken (via'lar çizgiye oturtulurken) yeniden hesap tetiklenmesin. */
let isWritingRoutingResult = false;

function routingKeyOf(routeId: string, result: ActiveRouteResult): string {
  const { stops, vias } = result.detail;
  return [
    routeId,
    result.usesPublishedNavigation ? 'P' : 'R',
    stops.map((s) => `${s.stopId}:${s.lat},${s.lon}`).join(';'),
    vias.map((v) => `${v.fromStopId}>${v.toStopId}#${v.viaSequence}:${v.lat},${v.lon}`).join(';'),
  ].join('|');
}

function syncRouting(): void {
  if (isWritingRoutingResult) return;
  const state = useRouteStore.getState();
  const { routeId } = state;
  const active = computeActive(state, useStopDraftStore.getState());

  if (routeId === null || !active) {
    if (routingKey !== null) {
      routingKey = null;
      routingPipeline.cancel();
    }
    return;
  }

  const key = routingKeyOf(routeId, active);
  if (key === routingKey) return;
  routingKey = key;

  const { stops, vias } = active.detail;
  if (active.usesPublishedNavigation || stops.length < 2) {
    // Yayındaki güzergah geçerli: hesap gerekmez
    routingPipeline.cancel();
    if (state.navigation !== null || state.isRouting) {
      useRouteStore.setState({ navigation: null, isRouting: false });
    }
    return;
  }

  useRouteStore.setState({ navigation: null, isRouting: true });

  routingPipeline.schedule(stops, vias, {
    onStart: () => {
      if (routingKey === key) useRouteStore.setState({ isRouting: true });
    },
    onSuccess: (navigation) => {
      if (routingKey !== key) return;
      const current = useRouteStore.getState();
      const draft = current.drafts[routeId];

      // Via'ları OSRM'nin oturttuğu yol noktasına taşı (geçmişe yazılmaz, yeni hesap tetiklemez)
      let drafts = current.drafts;
      if (draft) {
        const snapped = snapViasToLegs(stops, draft.vias, navigation);
        if (snapped !== draft.vias) drafts = { ...drafts, [routeId]: { ...draft, vias: snapped } };
      }

      isWritingRoutingResult = true;
      try {
        useRouteStore.setState({ drafts, navigation, isRouting: false, error: null });
      } finally {
        isWritingRoutingResult = false;
      }
      const after = computeActive(useRouteStore.getState(), useStopDraftStore.getState());
      if (after) routingKey = routingKeyOf(routeId, after);
    },
    onError: (err) => {
      if (routingKey !== key) return;
      useRouteStore.setState({
        isRouting: false,
        error: err.message || 'Güzergah OSRM rotalaması hesaplanamadı',
      });
    },
    onSettled: () => {
      if (routingKey === key) useRouteStore.setState({ isRouting: false });
    },
  });
}

useRouteStore.subscribe((state, prev) => {
  if (state.routeId !== prev.routeId || state.published !== prev.published || state.drafts !== prev.drafts) {
    syncRouting();
  }
});

// Durak taşıma / geri al / ileri al / sıfırla / yükleme: seçili hattın konumları değiştiyse yeniden hesaplanır
useStopDraftStore.subscribe((state, prev) => {
  if (state.draft !== prev.draft || state.published !== prev.published) syncRouting();
});

// ---- Türetilmiş Durum Seçicileri (Selectors) ----

/** Seçili hattın taslağı (saklanan nesnenin kendisi). */
export const selectActiveDraft = (state: Pick<RouteStoreState, 'routeId' | 'drafts'>): RouteDraft | null =>
  state.routeId !== null ? state.drafts[state.routeId] ?? null : null;

export const selectIsRouteDirty = (state: RouteStoreState): boolean => selectActiveDraft(state) !== null;

let unsavedCache: {
  drafts: RouteStoreState['drafts'];
  saved: RouteStoreState['saved'];
  result: string[];
} | null = null;

/**
 * Sunucuya kaydedilmemiş hatlar: taslağı kayıtlı halinden farklı (ya da hiç kaydedilmemiş) olanlar ve
 * kayıtlı taslağı olup yerelde taslağı kalmayanlar (yayındakine dönülmüş; kayıtta sunucudan silinir).
 */
export function selectUnsavedRouteIds(state: Pick<RouteStoreState, 'drafts' | 'saved'>): string[] {
  const { drafts, saved } = state;
  if (unsavedCache?.drafts === drafts && unsavedCache.saved === saved) return unsavedCache.result;

  const result: string[] = [];
  for (const [routeId, draft] of Object.entries(drafts)) {
    const savedRoute = saved[routeId];
    if (!savedRoute || !isSameRouteDraft(draft, savedRoute)) result.push(routeId);
  }
  for (const routeId of Object.keys(saved)) {
    if (!drafts[routeId]) result.push(routeId);
  }

  unsavedCache = { drafts, saved, result };
  return result;
}

export const selectHasUnsavedRoutes = (state: RouteStoreState): boolean =>
  selectUnsavedRouteIds(state).length > 0;

export const selectIsRouting = (state: RouteStoreState): boolean => state.isRouting;
