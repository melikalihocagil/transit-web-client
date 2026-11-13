import { queryClient, routeApi, stopApi } from '../api';
import { isDeletedStop, type Stop } from '../model';
import { useStopDraftStore, resolveStop } from './stopDraftStore';
import { useRouteStore, selectUnsavedRouteIds, toRouteDraft } from './routeStore';
import { hasEditHistory, useEditHistoryStore } from './editHistory';

/** Durak taslağını sunucuya yazar: sunucuda olup taslakta olmayan kayıtları siler, kalanları tek istekte yazar. */
async function uploadStops(): Promise<void> {
  // Silme işaretleri backend'e gönderilemez (lat/lon primitive double); yerelde kalır.
  const toSave = Object.values(useStopDraftStore.getState().draft).filter(
    (s): s is Stop => !isDeletedStop(s)
  );
  const keepIds = new Set(toSave.map((s) => s.stopId));

  const server = await stopApi.fetchStops();
  const toDelete = (server.draft ?? []).map((s) => s.stopId).filter((id) => !keepIds.has(id));
  await Promise.all(toDelete.map((id) => stopApi.deleteStopDraft(id)));

  if (toSave.length > 0) {
    await stopApi.saveStops(toSave);
  }
}

/**
 * Hat taslağı yalnızca durak sırası tutar; backend ise `Stop` nesnesi bekler (koordinatı yok sayar, yalnızca
 * stopId + sırayı kaydeder). Nesne durak store'undan çözümlenir; bulunamazsa yalnızca id'si dolu bir nesne gider.
 */
function toPayloadStop(stopId: string): Stop {
  return (
    resolveStop(useStopDraftStore.getState(), stopId) ?? {
      stopId,
      stopName: '',
      lat: 0,
      lon: 0,
      locationType: 0,
    }
  );
}

/**
 * Kaydedilmemiş hatları sunucuya yazar: yerelde taslağı kalmayanları siler, farklı olanları tek istekte
 * yazar. Ardından kayıtlı hali (`saved`) ve hat önbelleğini sunucunun cevabıyla günceller.
 */
async function uploadRoutes(): Promise<void> {
  const state = useRouteStore.getState();
  const routeIds = selectUnsavedRouteIds(state);
  if (routeIds.length === 0) return;

  const toDelete = routeIds.filter((routeId) => !state.drafts[routeId]);
  const toSave = routeIds
    .filter((routeId) => state.drafts[routeId])
    .map((routeId) => ({
      routeId,
      stops: state.drafts[routeId].stopIds.map(toPayloadStop),
      vias: state.drafts[routeId].vias,
    }));

  await Promise.all(toDelete.map((routeId) => routeApi.deleteRouteDraft(routeId)));
  const results = toSave.length > 0 ? await routeApi.saveRouteDrafts(toSave) : [];

  // selectRouteIntent hat verisini önbellekten okur: eski sunucu taslağı geri gelmesin
  const saved = { ...useRouteStore.getState().saved };
  for (const routeId of toDelete) {
    delete saved[routeId];
    queryClient.removeQueries({ queryKey: ['route', routeId] });
  }
  for (const data of results) {
    if (data.draft) saved[data.routeId] = toRouteDraft(data.draft);
    else delete saved[data.routeId];
    queryClient.setQueryData(['route', data.routeId], data);
  }
  useRouteStore.setState({ saved });
}

/**
 * Header'daki Kaydet: durak taslağı, hat taslakları ve etkilenen hatlar sırayla sunucuya yazılır.
 *
 * Kayıt boyunca durak store'u `status: 'saving'` olur; iki store da ve ortak geçmiş bununla kilitlenir.
 * Geçmiş en son (her şey yazıldıktan sonra) temizlenir: bir adım hata verirse yerel veri olduğu gibi kalır,
 * Kaydet aktif kalır ve yeniden denenebilir (tüm adımlar tekrarlanabilir).
 */
export async function saveAll(): Promise<void> {
  const stopState = useStopDraftStore.getState();
  if (stopState.status !== 'idle') return;
  // Geçmişte adım varsa durak taslağı sunucudakinden farklı olabilir; yükleme idempotent olduğu için
  // yalnızca hat düzenlemesi yapılmış olsa da yazılır.
  const hasEdits = hasEditHistory();

  useStopDraftStore.setState({ status: 'saving', error: null });
  try {
    if (hasEdits) await uploadStops();
    await uploadRoutes();
    await routeApi.replaceAffectedRoutes(Object.values(useStopDraftStore.getState().affectedRoutes));

    if (hasEdits) {
      await useStopDraftStore.getState().finishStopSave(); // status'u idle'a döndürür
    } else {
      useStopDraftStore.setState({ status: 'idle' });
    }
    useEditHistoryStore.getState().clearHistory();
  } catch (err) {
    useStopDraftStore.setState({
      status: 'idle',
      error: err instanceof Error ? err.message : 'Değişiklikler kaydedilemedi',
    });
  }
}
