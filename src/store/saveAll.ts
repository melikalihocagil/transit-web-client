import { queryClient, routeApi, stopApi } from '../api';
import { isDeletedStop, type Stop } from '../model';
import { useStopDraftStore, selectHasUnsavedStops } from './stopDraftStore';
import { useRouteStore, selectUnsavedRouteIds, toSavedRoute } from './routeStore';

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
      stops: state.drafts[routeId].stops,
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
    if (data.draft) saved[data.routeId] = toSavedRoute(data.draft);
    else delete saved[data.routeId];
    queryClient.setQueryData(['route', data.routeId], data);
  }
  useRouteStore.setState({ saved });
}

/**
 * Header'daki Kaydet: durak taslağı, hat taslakları ve etkilenen hatlar sırayla sunucuya yazılır.
 *
 * Kayıt boyunca durak store'u `status: 'saving'` olur; iki store da bununla düzenlemeyi kilitler.
 * Durak geçmişi en son (her şey yazıldıktan sonra) temizlenir: bir adım hata verirse yerel veri
 * olduğu gibi kalır, Kaydet aktif kalır ve yeniden denenebilir (tüm adımlar tekrarlanabilir).
 */
export async function saveAll(): Promise<void> {
  const stopState = useStopDraftStore.getState();
  if (stopState.status !== 'idle') return;
  const hasStopChanges = selectHasUnsavedStops(stopState);

  useStopDraftStore.setState({ status: 'saving', error: null });
  try {
    if (hasStopChanges) await uploadStops();
    await uploadRoutes();
    await routeApi.replaceAffectedRoutes(Object.values(useStopDraftStore.getState().affectedRoutes));

    if (hasStopChanges) {
      await useStopDraftStore.getState().finishStopSave(); // status'u idle'a döndürür
    } else {
      useStopDraftStore.setState({ status: 'idle' });
    }
  } catch (err) {
    useStopDraftStore.setState({
      status: 'idle',
      error: err instanceof Error ? err.message : 'Değişiklikler kaydedilemedi',
    });
  }
}
