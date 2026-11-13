import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { routeInfoApi } from '../api';
import {
  distributeGroupColors,
  isSameRouteInfo,
  isSameRouteInfoList,
  type RouteInfo,
  type RouteInfoData,
} from '../model';
import { useRouteStore } from './routeStore';

/**
 * Hat bilgisi (kod, ad, tür, ajans, renk) taslağı. Durak ve hat sırası düzenlemelerinden ayrıdır:
 * kendi geri al / ileri al geçmişi ve kendi Kaydet'i vardır.
 *
 * - published: Sunucudaki yayın listesi. Yalnızca kayıt ve "yayındakine döndür" için kullanılır.
 * - draft:     Çalışılan TAM liste (backend sözleşmesi: listede olmayan yayındaki hat silinmiş, yeni hat
 *              geçici `yeni-N` kimliğiyle). Yayındakiyle aynıysa null. Gösterilen her yerde `draft ?? published`.
 * - saved:     Sunucuda kayıtlı olduğunu bildiğimiz taslak; kaydedilmemiş değişiklik `draft` ile kıyaslanır.
 *
 * Kaydedilmemiş taslak tarayıcıda saklanır; sayfa açılınca sunucu verisi yüklenir, kaydedilmemiş taslak
 * varsa o korunur.
 */

const HISTORY_LIMIT = 50;
const NEW_ROUTE_PREFIX = 'yeni-';

export type RouteInfoInput = Omit<RouteInfo, 'routeId'>;
export type RouteInfoPatch = Partial<RouteInfoInput>;

export interface RouteInfoState {
  published: RouteInfo[];
  draft: RouteInfo[] | null;
  saved: RouteInfo[] | null;
  isLoaded: boolean;
  status: 'idle' | 'loading' | 'saving';
  error: string | null;
  past: (RouteInfo[] | null)[];
  future: (RouteInfo[] | null)[];
  lastNewRouteNumber: number;

  loadRouteInfos: () => Promise<void>;
  /** Hattın alanlarını değiştirir. Kod başka bir hatta kullanılıyorsa o hat listeden çıkar (bu hat kalır). */
  updateRoute: (routeId: string, patch: RouteInfoPatch) => void;
  /** Yeni hat ekler (geçici kimlikle) ve kimliğini döndürür. Kod çakışmasında diğer hat listeden çıkar. */
  createRoute: (input: RouteInfoInput) => string;
  deleteRoute: (routeId: string) => void;
  /** Hattın bilgilerini yayındakine döndürür (yeni hatta: hat kaldırılır). */
  revertRoute: (routeId: string) => void;
  /** Kod grubundaki tüm hatlara numara sırasıyla ayrı tonlar dağıtır (tek adım). */
  recolorGroup: (group: string) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
}

// ---- Yardımcılar ----

export function isNewRouteId(routeId: string): boolean {
  return routeId.startsWith(NEW_ROUTE_PREFIX);
}

/** Gösterilen liste. */
export function selectEffectiveRouteInfos(state: Pick<RouteInfoState, 'draft' | 'published'>): RouteInfo[] {
  return state.draft ?? state.published;
}

export function selectRouteInfo(state: RouteInfoState, routeId: string | null): RouteInfo | null {
  if (routeId === null) return null;
  return selectEffectiveRouteInfos(state).find((r) => r.routeId === routeId) ?? null;
}

/** Yayındakinden farklı (değişen, yeni ya da silinen) hat sayısı. */
export function selectRouteInfoChangeCount(state: RouteInfoState): number {
  if (state.draft === null) return 0;
  const published = new Map(state.published.map((r) => [r.routeId, r]));
  const draftIds = new Set(state.draft.map((r) => r.routeId));
  let count = 0;
  for (const r of state.draft) {
    const original = published.get(r.routeId);
    if (!original || !isSameRouteInfo(r, original)) count++;
  }
  for (const id of published.keys()) if (!draftIds.has(id)) count++;
  return count;
}

export function selectHasUnsavedRouteInfos(state: RouteInfoState): boolean {
  return !isSameRouteInfoList(state.draft, state.saved);
}

/** Hattın bilgisi yayındakinden farklı mı (yeni hat dahil). */
export function selectIsRouteInfoChanged(state: RouteInfoState, routeId: string): boolean {
  if (state.draft === null) return false;
  const current = state.draft.find((r) => r.routeId === routeId);
  if (!current) return false;
  const original = state.published.find((r) => r.routeId === routeId);
  return !original || !isSameRouteInfo(current, original);
}

export function selectIsNewRoute(state: RouteInfoState, routeId: string): boolean {
  return state.isLoaded && !state.published.some((r) => r.routeId === routeId);
}

/** Yayındakiyle aynı olan taslak tutulmaz. */
function normalizeDraft(draft: RouteInfo[] | null, published: RouteInfo[]): RouteInfo[] | null {
  if (draft === null || isSameRouteInfoList(draft, published)) return null;
  return draft;
}

/** Aynı kodu kullanan diğer hatları listeden çıkarır (değiştirilen / eklenen hat kalır). */
function dropCodeConflicts(list: RouteInfo[], keepId: string): RouteInfo[] {
  const kept = list.find((r) => r.routeId === keepId);
  if (!kept) return list;
  const code = kept.routeShortName.trim();
  return list.filter((r) => r.routeId === keepId || r.routeShortName.trim() !== code);
}

function sameFields(a: RouteInfoInput, b: RouteInfoInput): boolean {
  return isSameRouteInfo({ ...a, routeId: '' }, { ...b, routeId: '' });
}

/**
 * Kayıttan sonra geçici kimlikli yeni hatların sunucunun verdiği kimliklerle eşlenmesi: sunucu taslağında
 * gönderilmemiş kimlikli kayıtlar, alanları aynı olan yeni hatla eşleşir.
 */
function mapNewRouteIds(sent: RouteInfo[], serverDraft: RouteInfo[] | null): Map<string, string> {
  const mapping = new Map<string, string>();
  if (!serverDraft) return mapping;
  const sentIds = new Set(sent.map((r) => r.routeId));
  const candidates = serverDraft.filter((r) => !sentIds.has(r.routeId));
  for (const route of sent) {
    if (!isNewRouteId(route.routeId)) continue;
    const index = candidates.findIndex((c) => sameFields(c, route));
    if (index === -1) continue;
    mapping.set(route.routeId, candidates[index].routeId);
    candidates.splice(index, 1);
  }
  return mapping;
}

function applyServerData(data: RouteInfoData): Pick<RouteInfoState, 'published' | 'saved'> {
  const published = data.published ?? [];
  return { published, saved: normalizeDraft(data.draft, published) };
}

export const useRouteInfoStore = create<RouteInfoState>()(
  persist(
    (set, get) => {
      /** Düzenlemeyi tek geçmiş adımı olarak uygular. */
      const commit = (next: RouteInfo[]) => {
        const { draft, published, past, status } = get();
        if (status === 'saving') return;
        const normalized = normalizeDraft(next, published);
        if (isSameRouteInfoList(normalized, draft)) return;
        set({
          draft: normalized,
          past: [...past, draft].slice(-HISTORY_LIMIT),
          future: [],
          error: null,
        });
      };

      const working = (): RouteInfo[] => selectEffectiveRouteInfos(get());

      return {
        published: [],
        draft: null,
        saved: null,
        isLoaded: false,
        status: 'idle',
        error: null,
        past: [],
        future: [],
        lastNewRouteNumber: 0,

        loadRouteInfos: async () => {
          if (get().status !== 'idle') return;
          set({ status: 'loading', error: null });
          try {
            const data = await routeInfoApi.fetchRouteInfos();
            const { draft, saved: previousSaved } = get();
            const server = applyServerData(data);
            // Kaydedilmemiş yerel taslak korunur; yoksa sunucunun taslağı çalışılan liste olur
            const hasLocalChanges = !isSameRouteInfoList(draft, previousSaved);
            const nextDraft = hasLocalChanges ? normalizeDraft(draft, server.published) : server.saved;
            set({ ...server, draft: nextDraft, isLoaded: true, status: 'idle' });
          } catch (err: unknown) {
            set({
              status: 'idle',
              error: err instanceof Error ? `Hat bilgileri yüklenemedi: ${err.message}` : 'Hat bilgileri yüklenemedi',
            });
          }
        },

        updateRoute: (routeId, patch) => {
          const list = working();
          if (!list.some((r) => r.routeId === routeId)) return;
          const next = list.map((r) => (r.routeId === routeId ? { ...r, ...patch, routeId } : r));
          commit(dropCodeConflicts(next, routeId));
        },

        createRoute: (input) => {
          const number = get().lastNewRouteNumber + 1;
          const routeId = `${NEW_ROUTE_PREFIX}${number}`;
          set({ lastNewRouteNumber: number });
          commit(dropCodeConflicts([...working(), { ...input, routeId }], routeId));
          return routeId;
        },

        deleteRoute: (routeId) => {
          commit(working().filter((r) => r.routeId !== routeId));
        },

        revertRoute: (routeId) => {
          const original = get().published.find((r) => r.routeId === routeId);
          const list = working();
          if (!original) {
            commit(list.filter((r) => r.routeId !== routeId));
            return;
          }
          const exists = list.some((r) => r.routeId === routeId);
          commit(exists ? list.map((r) => (r.routeId === routeId ? original : r)) : [...list, original]);
        },

        recolorGroup: (group) => {
          const list = working();
          const colors = distributeGroupColors(group, list);
          if (colors.size === 0) return;
          commit(list.map((r) => (colors.has(r.routeId) ? { ...r, ...colors.get(r.routeId) } : r)));
        },

        undo: () => {
          const { past, future, draft, status } = get();
          if (past.length === 0 || status === 'saving') return;
          set({
            draft: past[past.length - 1],
            past: past.slice(0, -1),
            future: [draft, ...future].slice(0, HISTORY_LIMIT),
            error: null,
          });
        },

        redo: () => {
          const { past, future, draft, status } = get();
          if (future.length === 0 || status === 'saving') return;
          set({
            draft: future[0],
            past: [...past, draft].slice(-HISTORY_LIMIT),
            future: future.slice(1),
            error: null,
          });
        },

        save: async () => {
          const { draft, status } = get();
          if (status !== 'idle' || !selectHasUnsavedRouteInfos(get())) return;
          set({ status: 'saving', error: null });
          try {
            // Taslak yoksa `[]` gider: sunucudaki taslak temizlenir (yayındaki hale dönülür)
            const sent = draft ?? [];
            const payload = sent.map((r) => (isNewRouteId(r.routeId) ? { ...r, routeId: '' } : r));
            const data = await routeInfoApi.saveRouteInfos(payload);
            const server = applyServerData(data);
            const idMap = mapNewRouteIds(sent, data.draft);

            // Geçmiş geçici kimlikler taşıdığı için kayıttan sonra temizlenir
            set({ ...server, draft: server.saved, past: [], future: [], status: 'idle' });

            // Açık olan yeni hat sunucunun verdiği kimlikle yeniden açılır
            const selected = useRouteStore.getState().routeId;
            const mapped = selected === null ? undefined : idMap.get(selected);
            if (mapped) void useRouteStore.getState().selectRouteIntent(mapped);
          } catch (err: unknown) {
            const detail =
              (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
              (err instanceof Error ? err.message : null);
            set({ status: 'idle', error: detail ? `Hat bilgileri kaydedilemedi: ${detail}` : 'Hat bilgileri kaydedilemedi' });
          }
        },
      };
    },
    {
      name: 'transit-route-info',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        draft: state.draft,
        saved: state.saved,
        past: state.past,
        future: state.future,
        lastNewRouteNumber: state.lastNewRouteNumber,
      }),
    }
  )
);

export const selectCanUndoRouteInfo = (state: RouteInfoState): boolean => state.past.length > 0;
export const selectCanRedoRouteInfo = (state: RouteInfoState): boolean => state.future.length > 0;
