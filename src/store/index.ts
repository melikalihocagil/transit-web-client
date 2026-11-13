export {
  useRouteStore,
  useActiveRoute,
  computeActiveRoute,
  resolveRouteStops,
  selectActiveDraft,
  selectIsRouteDirty,
  selectUnsavedRouteIds,
  selectHasUnsavedRoutes,
  selectIsRouting,
  type RouteStoreState,
  type RouteDraft,
} from './routeStore';

export {
  useStopDraftStore,
  normalizeDraft,
  nextNewStopId,
  resolveStop,
  selectEffectiveStops,
  selectStopChangeCount,
  selectAffectedRouteIds,
  selectAffectedRoutes,
  type AffectedRoutes,
  type StopDraftState,
  type StopDraft,
  type StopRecord,
} from './stopDraftStore';

export { useEditHistoryStore, selectCanUndo, selectCanRedo } from './editHistory';
export { useMapHighlightStore } from './mapHighlight';
export { routingPipeline } from './routingPipeline';
export { saveAll, discardLocalWork } from './saveAll';
export {
  useRouteInfoStore,
  isNewRouteId,
  selectEffectiveRouteInfos,
  selectRouteInfo,
  selectRouteInfoChangeCount,
  selectHasUnsavedRouteInfos,
  selectIsRouteInfoChanged,
  selectIsNewRoute,
  selectCanUndoRouteInfo,
  selectCanRedoRouteInfo,
  type RouteInfoState,
  type RouteInfoInput,
  type RouteInfoPatch,
} from './routeInfoStore';
export { useCatalogRoutes } from './useCatalogRoutes';
