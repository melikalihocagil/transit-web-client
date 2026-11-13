import { create } from 'zustand';

/**
 * Durak ve hat katmanlarının paylaştığı geçici harita durumu.
 *
 * - highlightedStopId: Hayalet, şehir noktası ya da hat pini üzerine gelindiğinde vurgulanan durak.
 *   Durak katmanı aynı id'li hayaleti ve güncel konumu birlikte yanıp söndürür.
 * - draggingStopId: Hat pini sürüklenirken o durak. Durak katmanı şehir noktasını gizler ve published
 *   konumunu hayalet olarak gösterir (aynı id'li iki nokta kuralı sürüklemede de geçerli).
 */
interface MapHighlightState {
  highlightedStopId: string | null;
  draggingStopId: string | null;
  /** Haritadan yeni durak ekleme modu açık mı (bkz. useAddStopMode). */
  isAddingStop: boolean;
  setHighlightedStopId: (stopId: string | null) => void;
  setDraggingStopId: (stopId: string | null) => void;
  setAddingStop: (value: boolean) => void;
}

export const useMapHighlightStore = create<MapHighlightState>()((set) => ({
  highlightedStopId: null,
  draggingStopId: null,
  isAddingStop: false,
  setHighlightedStopId: (stopId) => set({ highlightedStopId: stopId }),
  setDraggingStopId: (stopId) => set({ draggingStopId: stopId }),
  setAddingStop: (value) => set({ isAddingStop: value }),
}));
