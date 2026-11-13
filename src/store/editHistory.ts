import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DraftStop, Via } from '../model';

/**
 * Durak ve hat düzenlemeleri için tek geri al / ileri al geçmişi.
 *
 * Bir adım, düzenlemeden önceki iki taslağın birlikte fotoğrafıdır: durak taslağı (yalnızca published'dan
 * farklı duraklar) ve hat taslakları (yalnızca durak sırası + via'lar). Konum bilgisi yalnızca durak
 * taslağında olduğu için hat pini taşımak da bir durak değişikliği olarak buraya düşer.
 *
 * Bu modül store'ları import etmez (döngüsel import olmasın diye); store'lar kendilerini
 * `registerHistorySource` ile kaydeder.
 */

/** Hat taslağı: yalnızca durak sırası ve via'lar. Durak konumları durak store'undan çözümlenir. */
export interface RouteDraft {
  stopIds: string[];
  vias: Via[];
}

export interface EditSnapshot {
  stops: Record<string, DraftStop>;
  routes: Record<string, RouteDraft>;
}

interface HistorySource<K extends keyof EditSnapshot> {
  capture: () => EditSnapshot[K];
  restore: (value: EditSnapshot[K]) => void;
}

const HISTORY_LIMIT = 50;

const sources: { stops?: HistorySource<'stops'>; routes?: HistorySource<'routes'> } = {};
let isLocked: () => boolean = () => false;

export function registerHistorySource<K extends keyof EditSnapshot>(key: K, source: HistorySource<K>): void {
  (sources as Record<K, HistorySource<K>>)[key] = source;
}

/** Düzenleme kilidi (kayıt sürerken geri al / ileri al çalışmaz). */
export function registerHistoryLock(check: () => boolean): void {
  isLocked = check;
}

function capture(): EditSnapshot {
  return {
    stops: sources.stops?.capture() ?? {},
    routes: sources.routes?.capture() ?? {},
  };
}

function restore(snapshot: EditSnapshot): void {
  sources.stops?.restore(snapshot.stops ?? {});
  sources.routes?.restore(snapshot.routes ?? {});
}

export interface EditHistoryState {
  past: EditSnapshot[];
  future: EditSnapshot[];
  /** Bir düzenleme uygulanmadan hemen önce çağrılır: mevcut hali geçmişe yazar, ileri al listesini siler. */
  recordEdit: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

export const useEditHistoryStore = create<EditHistoryState>()(
  persist(
    (set, get) => ({
      past: [],
      future: [],

      recordEdit: () => {
        set({ past: [...get().past, capture()].slice(-HISTORY_LIMIT), future: [] });
      },

      undo: () => {
        const { past, future } = get();
        if (past.length === 0 || isLocked()) return;
        const current = capture();
        set({ past: past.slice(0, -1), future: [current, ...future].slice(0, HISTORY_LIMIT) });
        restore(past[past.length - 1]);
      },

      redo: () => {
        const { past, future } = get();
        if (future.length === 0 || isLocked()) return;
        const current = capture();
        set({ past: [...past, current].slice(-HISTORY_LIMIT), future: future.slice(1) });
        restore(future[0]);
      },

      clearHistory: () => set({ past: [], future: [] }),
    }),
    {
      name: 'transit-edit-history',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ past: state.past, future: state.future }),
    }
  )
);

/** Geri alınacak adım var mı (aynı zamanda: sunucuya yazılmamış düzenleme var mı). */
export const selectCanUndo = (state: EditHistoryState): boolean => state.past.length > 0;

export const selectCanRedo = (state: EditHistoryState): boolean => state.future.length > 0;

/** Store dışından (stop/route store'ları) geçmiş uzunluğunu okumak için. */
export const hasEditHistory = (): boolean => useEditHistoryStore.getState().past.length > 0;

export const recordEdit = (): void => useEditHistoryStore.getState().recordEdit();
