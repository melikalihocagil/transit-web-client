import { create } from 'zustand';
import type { RouteInfo, RouteLeg, RouteWaypointDto, ShapePoint, StopItem, ViaPointItem } from '../types/gtfs';
import type { OperatorProfile, RevisionPackage } from '../types/package';
import type { PreFlightCheckResult } from '../types/worksheet';
import {
  buildOrderedWaypoints,
  findNearestLegIndex,
  findNearestShapeIndex,
  recalculateShapeSequence,
  simplifyShape,
  spliceShapeSegment,
  validatePreFlight,
} from '../utils/geoUtils';
import { adminApi, type AdminRouteDto } from '../api/adminApi';
import { getRouteForStops, getRouteWithLegs } from '../utils/osrmService';

export type MapTool = 'pan' | 'add_stop';

export const DEFAULT_OPERATORS: OperatorProfile[] = [
  { id: 'op-1', name: 'Ahmet Yılmaz', role: 'PLANNER', title: 'Toplu Taşıma Planlama Uzmanı' },
  { id: 'op-2', name: 'Zeynep Kaya', role: 'ADMIN', title: 'Ulaşım Dairesi Şube Müdürü' },
  { id: 'op-3', name: 'Mehmet Demir', role: 'DIRECTOR', title: 'UKOME Daire Başkanı' },
];

export const DEFAULT_PACKAGE: RevisionPackage = {
  packageId: 'pkg-default',
  packageName: 'Erzurum UKOME Hat & Durak Düzenleme Taslağı',
  scopeType: 'SINGLE_ROUTE',
  status: 'DRAFT',
  ukomeDecisionNo: '2026/UKOME-01',
  createdBy: 'UKOME Planlama',
  createdAt: new Date().toISOString(),
};

interface HistorySnapshot {
  shapes: ShapePoint[];
  stops: StopItem[];
  viaPoints: ViaPointItem[];
  waypoints?: RouteWaypointDto[];
  legs?: RouteLeg[];
}


interface WorkspaceState {
  // Backend Connection
  backendConnected: boolean;
  checkBackendConnection: () => Promise<void>;

  // Operators
  operators: OperatorProfile[];
  currentOperator: OperatorProfile;
  setOperator: (op: OperatorProfile) => void;

  // Packages
  packages: RevisionPackage[];
  activePackageId: string;
  setActivePackageId: (id: string) => void;
  loadPackages: () => Promise<void>;
  createPackage: (name: string, decisionNo: string) => Promise<void>;

  // Routes (Real GTFS / Worksheet from Backend)
  routes: AdminRouteDto[];
  selectedRouteId: string | null;
  isLoadingRoutes: boolean;
  isLoadingRouteDetail: boolean;
  fetchRoutes: () => Promise<void>;
  selectRoute: (routeId: string) => Promise<void>;
  createNewRoute: (data: {
    routeShortName: string;
    routeLongName: string;
    routeColor?: string;
    routeTextColor?: string;
    agencyId?: string;
  }) => Promise<void>;

  // Selected Route Details
  route: RouteInfo | null;
  setDirection: (directionId: 0 | 1) => void;

  // GIS Data (Live vs Draft Worksheet)
  liveShapes: ShapePoint[];
  liveStops: StopItem[];
  liveViaPoints: ViaPointItem[];
  liveWaypoints: RouteWaypointDto[];
  draftShapes: ShapePoint[];
  draftLegs: RouteLeg[];
  draftStops: StopItem[];
  viaPoints: ViaPointItem[];
  draftWaypoints: RouteWaypointDto[];

  // Tools & State
  activeTool: MapTool;
  setActiveTool: (tool: MapTool) => void;
  routingMode: 'auto' | 'manual';
  setRoutingMode: (mode: 'auto' | 'manual') => void;
  isDirty: boolean;
  isRouting: boolean;
  isSaving: boolean;
  isPublishing: boolean;

  // Focus & Highlighting (Yeni eklenen veya listede tıklanan durak/via noktasına odaklanma)
  focusedWaypointSequence: number | null;
  setFocusedWaypointSequence: (seq: number | null) => void;
  mapFocusTarget: { lat: number; lon: number; sequence: number } | null;
  focusOnMap: (waypoint: { lat: number; lon: number; sequence: number }) => void;

  // History (Undo / Redo)
  history: HistorySnapshot[];
  historyIndex: number;
  undo: () => void;
  redo: () => void;

  // Waypoints, Stops & Via Operations (OSRM & Worksheet sync)
  syncWaypointsToRoute: (waypoints: RouteWaypointDto[]) => Promise<void>;
  syncRouteWithWaypoints: (stops: StopItem[], viaPoints: ViaPointItem[], customWaypoints?: RouteWaypointDto[]) => Promise<void>;
  syncRouteFromStops: (stops: StopItem[]) => Promise<void>;
  updateDraftShapes: (newShapes: Array<{ lat: number; lon: number }>) => void;
  snapShapePointToStreet: (vertexIndex: number, newLat: number, newLon: number) => Promise<void>;
  moveStop: (identifier: string | number, lat: number, lon: number) => Promise<void>;
  addStopOnMap: (lat: number, lon: number, customName?: string) => Promise<void>;
  addStopOnSegment: (segmentIndex: number, lat: number, lon: number, customName?: string) => Promise<void>;
  deleteStop: (identifier: string | number) => Promise<void>;
  deleteWaypoint: (sequence: number) => Promise<void>;
  reorderStops: (activeId: string, overId: string) => Promise<void>;
  reorderWaypoints: (oldIndex: number, newIndex: number) => Promise<void>;

  // Via Points / Route Bend Management
  addViaPointOnMap: (lat: number, lon: number) => Promise<void>;
  addViaPointOnSegment: (segmentIndex: number, lat: number, lon: number) => Promise<void>;
  moveViaPoint: (viaId: string, lat: number, lon: number) => Promise<void>;
  deleteViaPoint: (viaId: string) => Promise<void>;
  bendSegment: (fromWaypointId: string, toWaypointId: string, newLat: number, newLon: number) => Promise<void>;

  // Server Workflows
  saveDraftToWorksheet: () => Promise<{ success: boolean; message: string }>;
  publishCurrentPackage: () => Promise<PreFlightCheckResult>;
  rollbackCurrentPackage: () => Promise<{ success: boolean; message: string }>;
}


export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  backendConnected: false,

  checkBackendConnection: async () => {
    try {
      const pkgs = await adminApi.getPackages();
      if (pkgs && pkgs.length > 0) {
        const preferred = pkgs.find((p) => p.scopeType === 'NETWORK_WIDE') || pkgs[0];
        set({
          packages: pkgs,
          activePackageId: preferred.packageId,
          backendConnected: true,
        });
      } else {
        set({ backendConnected: true });
      }
    } catch {
      set({ backendConnected: false });
    }
  },

  operators: DEFAULT_OPERATORS,
  currentOperator: DEFAULT_OPERATORS[0],
  setOperator: (op) => set({ currentOperator: op }),

  packages: [DEFAULT_PACKAGE],
  activePackageId: DEFAULT_PACKAGE.packageId,
  setActivePackageId: (id) => set({ activePackageId: id }),

  loadPackages: async () => {
    try {
      const data = await adminApi.getPackages();
      if (data && data.length > 0) {
        const preferred = data.find((p) => p.scopeType === 'NETWORK_WIDE') || data[0];
        set({ packages: data, activePackageId: preferred.packageId, backendConnected: true });
      } else {
        set({ backendConnected: true });
      }
    } catch (err) {
      console.warn('Backend paketleri alınamadı:', err);
      set({ backendConnected: false });
    }
  },

  createPackage: async (name: string, decisionNo: string) => {
    const { currentOperator, packages } = get();
    try {
      const created = await adminApi.createPackage({
        packageName: name,
        ukomeDecisionNo: decisionNo,
        scopeType: 'SINGLE_ROUTE',
        createdBy: currentOperator.name,
      });
      set({
        packages: [created, ...packages],
        activePackageId: created.packageId,
        backendConnected: true,
      });
    } catch {
      const fallback: RevisionPackage = {
        packageId: `pkg-${Date.now()}`,
        packageName: name,
        ukomeDecisionNo: decisionNo,
        scopeType: 'SINGLE_ROUTE',
        status: 'DRAFT',
        createdBy: currentOperator.name,
        createdAt: new Date().toISOString(),
      };
      set({
        packages: [fallback, ...packages],
        activePackageId: fallback.packageId,
      });
    }
  },

  // Routes Management
  routes: [],
  selectedRouteId: null,
  isLoadingRoutes: false,
  isLoadingRouteDetail: false,

  fetchRoutes: async () => {
    const { activePackageId, selectedRouteId, selectRoute } = get();
    set({ isLoadingRoutes: true });
    try {
      const routeList = await adminApi.getRoutes(activePackageId !== 'pkg-default' ? activePackageId : undefined);
      set({ routes: routeList, backendConnected: true, isLoadingRoutes: false });

      if (routeList.length > 0) {
        const routeToSelect = selectedRouteId && routeList.some((r) => r.routeId === selectedRouteId)
          ? selectedRouteId
          : routeList[0].routeId;
        await selectRoute(routeToSelect);
      }
    } catch (err) {
      console.error('Gerçek hatlar backend üzerinden çekilemedi:', err);
      set({ isLoadingRoutes: false, backendConnected: false });
    }
  },

  selectRoute: async (routeId: string) => {
    set({ selectedRouteId: routeId, isLoadingRouteDetail: true });
    try {
      const detail = await adminApi.getRouteDetail(routeId);

      const routeInfo: RouteInfo = {
        routeId: detail.route.routeId,
        routeShortName: detail.route.routeShortName,
        routeLongName: detail.route.routeLongName,
        routeColor: detail.route.routeColor ? (detail.route.routeColor.startsWith('#') ? detail.route.routeColor : `#${detail.route.routeColor}`) : '#2563eb',
        routeTextColor: detail.route.routeTextColor ? (detail.route.routeTextColor.startsWith('#') ? detail.route.routeTextColor : `#${detail.route.routeTextColor}`) : '#ffffff',
        agencyId: detail.route.agencyId || 'EBB',
        directionId: 0,
      };

      let initialWaypoints: RouteWaypointDto[] = [];
      let stops: StopItem[] = [];
      const loadedViaPoints: ViaPointItem[] = [];

      if (detail.waypoints && detail.waypoints.length > 0) {
        // Backend'in yeni tekil ve sıralı Waypoint zinciri (SSoT)
        const stopMap = new Map((detail.stops || []).map((s) => [s.stopId, s]));
        initialWaypoints = [...detail.waypoints]
          .sort((a, b) => a.sequence - b.sequence)
          .map((w) => ({
            ...w,
            locationType: w.locationType ?? (w.stopId ? stopMap.get(w.stopId)?.locationType : null),
          }));

        stops = initialWaypoints
          .filter((w) => w.stopId != null)
          .map((w, idx) => ({
            stopId: w.stopId!,
            stopName: w.name || `Durak ${idx + 1}`,
            lat: w.lat,
            lon: w.lon,
            sequence: w.sequence || idx + 1,
            actionType: 'NONE' as const,
            locationType: w.locationType ?? null,
          }));

        let lastStopId = stops[0]?.stopId || '';
        initialWaypoints.forEach((w, idx) => {
          if (w.stopId != null) {
            lastStopId = w.stopId;
          } else {
            loadedViaPoints.push({
              id: `via-${w.sequence || idx}-${Date.now()}`,
              lat: w.lat,
              lon: w.lon,
              afterStopId: lastStopId,
              sequence: w.sequence,
            });
          }
        });
      } else if (detail.stops && detail.stops.length > 0) {
        // Geriye dönük uyumluluk (Legacy format)
        stops = detail.stops.map((s, idx) => ({
          stopId: s.stopId,
          stopName: s.stopName,
          lat: s.stopLat,
          lon: s.stopLon,
          sequence: idx + 1,
          actionType: 'NONE' as const,
        }));

        if (detail.viaPoints && detail.viaPoints.length > 0) {
          detail.viaPoints.forEach((vp, idx) => {
            loadedViaPoints.push({
              id: `via-${vp.sequence || idx}-${Date.now()}`,
              lat: vp.lat,
              lon: vp.lon,
              afterStopId: stops[0]?.stopId || '',
              sequence: vp.sequence,
            });
          });
        }

        initialWaypoints = buildOrderedWaypoints(stops, loadedViaPoints).map((w, idx) => ({
          sequence: idx + 1,
          stopId: w.isViaPoint ? null : w.id,
          name: w.isViaPoint ? null : w.name,
          lat: w.lat,
          lon: w.lon,
          distTraveled: null,
        }));
      }

      let rawCoords = (detail.shapeCoordinates || []).map(([lon, lat]) => ({ lat, lon }));
      let loadedLegs: RouteLeg[] = [];
      let finalShapeCoords: Array<{ lat: number; lon: number }> = [];

      if (initialWaypoints.length >= 2) {
        const routeResult = await getRouteWithLegs(
          initialWaypoints.map((w) => ({ lat: w.lat, lon: w.lon }))
        );
        loadedLegs = routeResult.legs;
        finalShapeCoords = routeResult.allCoordinates;
      } else if (rawCoords.length > 0) {
        finalShapeCoords = rawCoords;
      }

      const shapes: ShapePoint[] = recalculateShapeSequence(finalShapeCoords);

      // En yakın shape noktalarını via olarak damgala
      loadedViaPoints.forEach((vp) => {
        const nearestIdx = findNearestShapeIndex({ lat: vp.lat, lon: vp.lon }, shapes);
        if (shapes[nearestIdx]) {
          shapes[nearestIdx].isViaPoint = true;
        }
      });

      set({
        route: routeInfo,
        focusedWaypointSequence: null,
        mapFocusTarget: null,
        liveWaypoints: [...initialWaypoints],
        draftWaypoints: [...initialWaypoints],
        liveShapes: shapes,
        liveStops: stops,
        liveViaPoints: [...loadedViaPoints],
        draftShapes: [...shapes],
        draftLegs: [...loadedLegs],
        draftStops: [...stops],
        viaPoints: [...loadedViaPoints],
        history: [{
          shapes: [...shapes],
          stops: [...stops],
          viaPoints: [...loadedViaPoints],
          waypoints: [...initialWaypoints],
          legs: [...loadedLegs],
        }],
        historyIndex: 0,
        isDirty: false,
        isLoadingRouteDetail: false,
        backendConnected: true,
      });
    } catch (err) {
      console.error(`Hat detayı alınamadı (routeId: ${routeId}):`, err);
      set({ isLoadingRouteDetail: false });
    }
  },

  createNewRoute: async (data) => {
    const { routes, activePackageId } = get();
    const cleanShort = data.routeShortName.trim().toUpperCase();
    const cleanLong = data.routeLongName.trim();
    const routeColor = data.routeColor || '#2563eb';
    const routeTextColor = data.routeTextColor || '#ffffff';
    const agencyId = data.agencyId || 'EBB';
    const newRouteId = `RT-${cleanShort}-${Date.now().toString().slice(-4)}`;

    const newRouteDto: AdminRouteDto = {
      routeId: newRouteId,
      agencyId,
      routeShortName: cleanShort,
      routeLongName: cleanLong,
      routeType: 3,
      routeColor,
      routeTextColor,
      isDraft: true,
    };

    const newRouteInfo: RouteInfo = {
      routeId: newRouteId,
      routeShortName: cleanShort,
      routeLongName: cleanLong,
      routeColor,
      routeTextColor,
      agencyId,
      directionId: 0,
    };

    try {
      await adminApi.createRoute({
        routeId: newRouteId,
        agencyId,
        routeShortName: cleanShort,
        routeLongName: cleanLong,
        routeColor,
        routeTextColor,
        routeType: 3,
        packageId: activePackageId !== 'pkg-default' ? activePackageId : undefined,
      });
      set({ backendConnected: true });
    } catch {
      // Backend kapalıysa yerel çalışma tezgahı aktif kalır
    }

    set({
      routes: [newRouteDto, ...routes],
      selectedRouteId: newRouteId,
      route: newRouteInfo,
      draftStops: [],
      liveStops: [],
      draftShapes: [],
      liveShapes: [],
      viaPoints: [],
      liveViaPoints: [],
      history: [{ shapes: [], stops: [], viaPoints: [] }],
      historyIndex: 0,
      activeTool: 'add_stop',
      isDirty: true,
    });

  },

  route: null,
  setDirection: (directionId) =>
    set((state) => ({
      route: state.route ? { ...state.route, directionId } : null,
    })),

  liveShapes: [],
  liveStops: [],
  liveViaPoints: [],
  liveWaypoints: [],
  draftShapes: [],
  draftLegs: [],
  draftStops: [],
  viaPoints: [],
  draftWaypoints: [],

  activeTool: 'pan',
  setActiveTool: (tool) => set({ activeTool: tool }),
  routingMode: 'auto',
  setRoutingMode: (mode) => set({ routingMode: mode }),
  isDirty: false,
  isRouting: false,
  isSaving: false,
  isPublishing: false,

  focusedWaypointSequence: null,
  setFocusedWaypointSequence: (seq) => set({ focusedWaypointSequence: seq }),
  mapFocusTarget: null,
  focusOnMap: (wp) =>
    set({
      mapFocusTarget: { lat: wp.lat, lon: wp.lon, sequence: wp.sequence },
      focusedWaypointSequence: wp.sequence,
    }),

  history: [],
  historyIndex: 0,

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      set({
        draftShapes: prev.shapes,
        draftLegs: prev.legs || [],
        draftStops: prev.stops,
        viaPoints: prev.viaPoints || [],
        draftWaypoints: prev.waypoints || [],
        historyIndex: historyIndex - 1,
        isDirty: true,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      set({
        draftShapes: next.shapes,
        draftLegs: next.legs || [],
        draftStops: next.stops,
        viaPoints: next.viaPoints || [],
        draftWaypoints: next.waypoints || [],
        historyIndex: historyIndex + 1,
        isDirty: true,
      });
    }
  },

  /**
   * Yegane Doğruluk Kaynağı (SSoT) olan Waypoints dizisi üzerinden OSRM güzergahını çizer.
   * Hiçbir yapay afterStopId veya mesafe sıralaması yapmaz.
   * Durak ve Via listelerini doğrudan bu diziden türeterek state ile senkronize tutar.
   */
  syncWaypointsToRoute: async (waypoints: RouteWaypointDto[]) => {
    if (waypoints.length < 2) {
      const singleOrEmpty: ShapePoint[] = waypoints.map((w, idx) => ({
        sequence: idx + 1,
        lat: w.lat,
        lon: w.lon,
        distTraveled: 0,
        isViaPoint: w.stopId == null,
      }));
      const derivedStops: StopItem[] = waypoints
        .filter((w) => w.stopId != null)
        .map((w) => ({
          stopId: w.stopId!,
          stopName: w.name || 'Durak',
          lat: w.lat,
          lon: w.lon,
          sequence: w.sequence,
          actionType: 'NONE' as const,
          locationType: w.locationType ?? null,
        }));
      const derivedVias: ViaPointItem[] = waypoints
        .filter((w) => w.stopId == null)
        .map((w, idx) => ({
          id: w.stopId || `via-${w.sequence || idx}`,
          lat: w.lat,
          lon: w.lon,
          afterStopId: '',
          sequence: w.sequence,
        }));

      set({
        draftShapes: singleOrEmpty,
        draftLegs: [],
        draftWaypoints: waypoints,
        draftStops: derivedStops,
        viaPoints: derivedVias,
        isRouting: false,
        isDirty: true,
      });
      return;
    }

    set({ isRouting: true });
    const { history, historyIndex } = get();

    let newShapePoints: ShapePoint[] = [];
    let updatedLegs: RouteLeg[] = [];

    if (waypoints.length >= 2) {
      const routeResult = await getRouteWithLegs(
        waypoints.map((w) => ({ lat: w.lat, lon: w.lon }))
      );
      updatedLegs = routeResult.legs;
      newShapePoints = recalculateShapeSequence(routeResult.allCoordinates);

      // Via noktalarının en yakın shape koordinatını isViaPoint = true olarak damgala
      const viaWps = waypoints.filter((w) => w.stopId == null);
      for (const vp of viaWps) {
        const nearestIdx = findNearestShapeIndex({ lat: vp.lat, lon: vp.lon }, newShapePoints);
        if (newShapePoints[nearestIdx]) {
          newShapePoints[nearestIdx].isViaPoint = true;
        }
      }
    } else if (waypoints.length === 1) {
      newShapePoints = recalculateShapeSequence([
        { lat: waypoints[0].lat, lon: waypoints[0].lon },
      ]);
    }

    const derivedStops: StopItem[] = waypoints
      .filter((w) => w.stopId != null)
      .map((w) => ({
        stopId: w.stopId!,
        stopName: w.name || 'Durak',
        lat: w.lat,
        lon: w.lon,
        sequence: w.sequence,
        actionType: 'NONE' as const,
        locationType: w.locationType ?? null,
      }));

    const derivedVias: ViaPointItem[] = waypoints
      .filter((w) => w.stopId == null)
      .map((w, idx) => ({
        id: w.stopId || `via-${w.sequence || idx}`,
        lat: w.lat,
        lon: w.lon,
        afterStopId: '',
        sequence: w.sequence,
      }));

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      shapes: newShapePoints,
      stops: derivedStops,
      viaPoints: derivedVias,
      waypoints,
      legs: updatedLegs,
    });

    set({
      draftShapes: newShapePoints,
      draftLegs: updatedLegs,
      draftWaypoints: waypoints,
      draftStops: derivedStops,
      viaPoints: derivedVias,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isDirty: true,
      isRouting: false,
    });
  },

  syncRouteWithWaypoints: async (stops: StopItem[], viaPoints: ViaPointItem[], customWaypoints?: RouteWaypointDto[]) => {
    if (customWaypoints && customWaypoints.length > 0) {
      await get().syncWaypointsToRoute(customWaypoints);
      return;
    }
    const derived = buildOrderedWaypoints(stops, viaPoints).map((w, idx) => ({
      sequence: idx + 1,
      stopId: w.isViaPoint ? null : w.id,
      name: w.isViaPoint ? null : (w.name || null),
      lat: w.lat,
      lon: w.lon,
      distTraveled: null,
    }));
    await get().syncWaypointsToRoute(derived);
  },

  /**
   * Durak listesi güncellendiğinde tüm kilitlerle senkronize eder.
   */
  syncRouteFromStops: async (stops: StopItem[]) => {
    const { viaPoints, syncRouteWithWaypoints } = get();
    await syncRouteWithWaypoints(stops, viaPoints);
  },

  /**
   * Doğrudan ShapePoint koordinat dizisini günceller (Manuel vertex düzenlemeleri için).
   */
  updateDraftShapes: (newShapes) => {
    const { history, historyIndex, draftStops, viaPoints } = get();
    const calibrated = recalculateShapeSequence(newShapes);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ shapes: calibrated, stops: draftStops, viaPoints });

    set({
      draftShapes: calibrated,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isDirty: true,
    });
  },

  /**
   * Çizgi üzerindeki bir ShapePoint çekildiğinde, OSRM ile yalnızca o yerel aralığı sokaklara oturtur.
   */
  snapShapePointToStreet: async (vertexIndex: number, newLat: number, newLon: number) => {
    const { draftShapes, draftStops, viaPoints, history, historyIndex } = get();
    if (draftShapes.length === 0) return;

    set({ isRouting: true });

    const fromIdx = Math.max(0, vertexIndex - 25);
    const toIdx = Math.min(draftShapes.length - 1, vertexIndex + 25);

    const startPt = draftShapes[fromIdx];
    const endPt = draftShapes[toIdx];

    const waypoints = [
      { lat: startPt.lat, lon: startPt.lon },
      { lat: newLat, lon: newLon },
      { lat: endPt.lat, lon: endPt.lon },
    ];

    const rawCoords = await getRouteForStops(waypoints);
    const simplified = simplifyShape(rawCoords, 2.5);
    const newShapes = spliceShapeSegment(draftShapes, fromIdx, toIdx, simplified);

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ shapes: newShapes, stops: draftStops, viaPoints });

    set({
      draftShapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isDirty: true,
      isRouting: false,
    });
  },

  /**
   * Durak oynatıldığında doğrudan draftWaypoints güncellenir ve rota çizilir.
   * sequence veya stopId kabul eder; ring hatlarda sequence ile tekil durak taşınır.
   */
  moveStop: async (identifier, lat, lon) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    const wpIdx = typeof identifier === 'number'
      ? draftWaypoints.findIndex((w) => w.sequence === identifier)
      : draftWaypoints.findIndex((w) => w.stopId === identifier);
    if (wpIdx === -1) return;

    const targetWp = draftWaypoints[wpIdx];
    const roundedLat = Number(lat.toFixed(6));
    const roundedLon = Number(lon.toFixed(6));

    // Ring Hat ve Terminal Senkronizasyonu:
    // Eğer taşınan durak hattın terminali ise veya hattın başlangıç (1.) ve bitiş (N.)
    // waypoint'leri aynı stopId'ye sahipse (Ring Hat Hub), her iki ucu tek vücut olarak senkronize et.
    const firstWp = draftWaypoints[0];
    const lastWp = draftWaypoints[draftWaypoints.length - 1];
    const isRingHub =
      targetWp.stopId != null &&
      draftWaypoints.length > 1 &&
      firstWp?.stopId != null &&
      lastWp?.stopId != null &&
      firstWp.stopId === lastWp.stopId &&
      targetWp.stopId === firstWp.stopId;

    const updated = draftWaypoints.map((w, i) => {
      if (isRingHub && (i === 0 || i === draftWaypoints.length - 1)) {
        return {
          ...w,
          lat: roundedLat,
          lon: roundedLon,
        };
      }
      if (i === wpIdx) {
        return {
          ...w,
          lat: roundedLat,
          lon: roundedLon,
        };
      }
      return w;
    });

    await syncWaypointsToRoute(updated);
  },

  /**
   * Haritaya yeni durak ekleme.
   * draftLegs üzerinden tıklanan koordinata en yakın gerçek OSRM asfalt bacağına kilitlenir.
   */
  addStopOnMap: async (lat, lon, customName) => {
    const { draftWaypoints, draftLegs, addStopOnSegment, syncWaypointsToRoute } = get();
    if (draftWaypoints.length < 2) {
      const newStopId = `STP-ERZ-${Date.now().toString().slice(-4)}`;
      const newSeq = draftWaypoints.length + 1;
      const newStop: RouteWaypointDto = {
        sequence: newSeq,
        stopId: newStopId,
        name: customName || `Yeni Durak (${newSeq}. Sıra)`,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        distTraveled: null,
      };
      set({ activeTool: 'pan', focusedWaypointSequence: newSeq });
      await syncWaypointsToRoute([...draftWaypoints, newStop]);
      return;
    }

    const nearestLeg = findNearestLegIndex({ lat, lon }, draftLegs);
    await addStopOnSegment(nearestLeg, lat, lon, customName);
  },

  /**
   * Belirli bir segmentIndex (W_k -> W_{k+1}) arasına doğrudan yeni bir durak yerleştirir.
   * Kesinlikle 0 arama yapar; doğrudan k+1 indeksine splice eder.
   */
  addStopOnSegment: async (segmentIndex: number, lat: number, lon: number, customName?: string) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    const insertIdx = Math.max(1, Math.min(draftWaypoints.length - 1, segmentIndex + 1));
    const newStopId = `STP-ERZ-${Date.now().toString().slice(-4)}`;
    const newSeq = insertIdx + 1;
    const stopName = customName || `Yeni Durak (${newSeq}. Sıra)`;

    const newStop: RouteWaypointDto = {
      sequence: newSeq,
      stopId: newStopId,
      name: stopName,
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      distTraveled: null,
    };

    const updated = [...draftWaypoints];
    updated.splice(insertIdx, 0, newStop);
    const resequenced = updated.map((w, idx) => ({ ...w, sequence: idx + 1 }));

    set({ activeTool: 'pan', focusedWaypointSequence: newSeq });
    await syncWaypointsToRoute(resequenced);
  },

  /**
   * Durak silme. Tekil sıralı zincirden durak kaldırılır ve kalan noktalar resequence edilir.
   * sequence veya stopId kabul eder; ring hatlarda tek bir durağı silmek için sequence kullanılır.
   */
  deleteStop: async (identifier) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    const filtered = typeof identifier === 'number'
      ? draftWaypoints.filter((w) => w.sequence !== identifier)
      : draftWaypoints.filter((w) => w.stopId !== identifier);
    const resequenced = filtered.map((w, idx) => ({ ...w, sequence: idx + 1 }));
    await syncWaypointsToRoute(resequenced);
  },

  /**
   * Durak dizilimini sürükle-bırak ile yeniden sıralama.
   */
  reorderStops: async (activeId, overId) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    const oldIndex = draftWaypoints.findIndex((w) => w.stopId === activeId);
    const newIndex = draftWaypoints.findIndex((w) => w.stopId === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const updated = [...draftWaypoints];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);

    const resequenced = updated.map((w, idx) => ({ ...w, sequence: idx + 1 }));
    await syncWaypointsToRoute(resequenced);
  },

  /**
   * Tüm güzergah katarını (Duraklar ve Via kilitleri) sıralı zincirde serbestçe yeniden sıralama.
   */
  reorderWaypoints: async (oldIndex: number, newIndex: number) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    if (
      oldIndex === newIndex ||
      oldIndex < 0 ||
      newIndex < 0 ||
      oldIndex >= draftWaypoints.length ||
      newIndex >= draftWaypoints.length
    )
      return;

    const updated = [...draftWaypoints];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);

    const resequenced = updated.map((w, idx) => ({ ...w, sequence: idx + 1 }));
    await syncWaypointsToRoute(resequenced);
  },

  /**
   * Sıralı zincirden tek bir noktayı (durak veya via kilit noktası) kaldırır.
   */
  deleteWaypoint: async (sequence: number) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    const filtered = draftWaypoints.filter((w) => w.sequence !== sequence);
    const resequenced = filtered.map((w, idx) => ({ ...w, sequence: idx + 1 }));
    await syncWaypointsToRoute(resequenced);
  },

  // === GÜZERGAH BÜKÜM NOKTALARI (HAYALET TUTAMAÇ & SABİT BÜKÜM) YÖNETİMİ ===

  /**
   * İki ardışık kontrol noktası (durak veya büküm noktası) arasındaki segmenti
   * yeni bir koordinattan (sürüklenen hayalet nokta) geçecek şekilde büker.
   * KESİNLİKLE tüm 70 durağı baştan çizmez! Yalnızca o yerel segmenti OSRM ile hesaplar
   * ve spliceShapeSegment ile ana hatta diker. Şehrin geri kalan güzergahı donmuş kalır.
   */
  /**
   * İki ardışık kontrol noktası arasına yeni bir via kilit noktası ekler ve OSRM ile rotayı oturtur.
   * fromWaypointId'nin hemen arkasına (fromIdx + 1) eklenir; asla diğer şeride veya U dönüşüne sıçramaz.
   */
  bendSegment: async (fromWaypointId: string, _toWaypointId: string, newLat: number, newLon: number) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    if (draftWaypoints.length < 2) return;

    const fromIdx = draftWaypoints.findIndex((w) => (w.stopId || `via-${w.sequence}`) === fromWaypointId);
    if (fromIdx === -1) return;

    const newVia: RouteWaypointDto = {
      sequence: fromIdx + 2,
      stopId: null,
      name: null,
      lat: Number(newLat.toFixed(6)),
      lon: Number(newLon.toFixed(6)),
      distTraveled: null,
    };

    const updated = [...draftWaypoints];
    updated.splice(fromIdx + 1, 0, newVia);
    const resequenced = updated.map((w, idx) => ({ ...w, sequence: idx + 1 }));

    set({ focusedWaypointSequence: fromIdx + 2 });
    await syncWaypointsToRoute(resequenced);
  },

  /**
   * Haritada mavi hat çizgisine tıklandığında veya koordinat verildiğinde,
   * en yakın gerçek OSRM asfalt leg'ine kilitlenerek oraya via ekler.
   */
  addViaPointOnMap: async (lat: number, lon: number) => {
    const { draftWaypoints, draftLegs, addViaPointOnSegment } = get();
    if (draftWaypoints.length < 2) return;

    const nearestLeg = findNearestLegIndex({ lat, lon }, draftLegs);
    await addViaPointOnSegment(nearestLeg, lat, lon);
  },

  /**
   * Belirli bir segmentIndex (W_k -> W_{k+1}) arasına doğrudan yeni bir via kilit noktası ekler.
   * Kesinlikle 0 arama yapar; doğrudan k+1 indeksine splice eder.
   */
  addViaPointOnSegment: async (segmentIndex: number, lat: number, lon: number) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    if (draftWaypoints.length < 2) return;

    const insertIdx = Math.max(1, Math.min(draftWaypoints.length - 1, segmentIndex + 1));
    const newSeq = insertIdx + 1;

    const newVia: RouteWaypointDto = {
      sequence: newSeq,
      stopId: null,
      name: null,
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      distTraveled: null,
    };

    const updated = [...draftWaypoints];
    updated.splice(insertIdx, 0, newVia);
    const resequenced = updated.map((w, idx) => ({ ...w, sequence: idx + 1 }));

    set({ focusedWaypointSequence: newSeq });
    await syncWaypointsToRoute(resequenced);
  },

  /**
   * Var olan bir via kilit noktası sürüklendiğinde koordinatını günceller ve OSRM'i yeniler.
   */
  moveViaPoint: async (viaId: string, lat: number, lon: number) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    const wpIdx = draftWaypoints.findIndex((w) => (w.stopId || `via-${w.sequence}`) === viaId);
    if (wpIdx === -1) return;

    const updated = draftWaypoints.map((w, i) =>
      i === wpIdx
        ? {
            ...w,
            lat: Number(lat.toFixed(6)),
            lon: Number(lon.toFixed(6)),
          }
        : w
    );

    const resequenced = updated.map((w, idx) => ({ ...w, sequence: idx + 1 }));
    await syncWaypointsToRoute(resequenced);
  },

  /**
   * Via kilit noktası tıklandığında veya silindiğinde zincirden kaldırılır.
   */
  deleteViaPoint: async (viaId: string) => {
    const { draftWaypoints, syncWaypointsToRoute } = get();
    const filtered = draftWaypoints.filter((w) => (w.stopId || `via-${w.sequence}`) !== viaId);
    const resequenced = filtered.map((w, idx) => ({ ...w, sequence: idx + 1 }));
    await syncWaypointsToRoute(resequenced);
  },

  saveDraftToWorksheet: async () => {
    const { selectedRouteId, activePackageId, draftWaypoints, draftStops, draftShapes, viaPoints } = get();
    set({ isSaving: true });

    try {
      if (selectedRouteId) {
        try {
          const pkgId = activePackageId !== 'pkg-default' ? activePackageId : undefined;
          await adminApi.loadRouteToWorksheet(selectedRouteId, pkgId);
        } catch {
          // Eğer zaten yüklüyse devam et
        }
      }

      for (const stop of draftStops) {
        if (stop.actionType === 'INSERT') {
          await adminApi.createDraftStop({
            stopId: stop.stopId,
            stopName: stop.stopName,
            stopLat: stop.lat,
            stopLon: stop.lon,
          });
        } else if (stop.actionType === 'UPDATE') {
          await adminApi.updateDraftStop(stop.stopId, {
            stopName: stop.stopName,
            stopLat: stop.lat,
            stopLon: stop.lon,
          });
        }
      }

      // Yegane SSoT olan draftWaypoints doğrudan kullanılır
      const routeWaypoints: RouteWaypointDto[] = draftWaypoints.map((w, idx) => ({
        ...w,
        sequence: idx + 1,
      }));

      if (selectedRouteId && routeWaypoints.length > 0) {
        // 1. Backend waypoints_worksheet tablosuna sıralı kaydet
        await adminApi.saveRouteWaypoints(selectedRouteId, routeWaypoints);
        // 2. Backend'e OSRM şeklini doğrudan bu waypoints üzerinden derletmeyi dene
        try {
          await adminApi.generateShapeForRoute(selectedRouteId);
        } catch (shapeErr) {
          console.warn('Backend generateShapeForRoute çağrısı atlandı (taslak waypoints başarıyla kaydedildi):', shapeErr);
        }
      }

      const normalizedStops = draftStops.map((s) => ({ ...s, actionType: 'NONE' as const }));

      set({
        draftWaypoints: routeWaypoints,
        liveWaypoints: [...routeWaypoints],
        draftStops: normalizedStops,
        liveShapes: [...draftShapes],
        liveStops: [...normalizedStops],
        liveViaPoints: [...viaPoints],
        isSaving: false,
        isDirty: false,
        backendConnected: true,
      });

      return {
        success: true,
        message: 'Taslak revizyon (duraklar ve via kilit noktaları) başarıyla backend çalışma tezgahına (worksheet) kaydedildi.',
      };
    } catch (err) {
      console.warn('Backend taslak kaydetme hatası (yerel duruma geçildi):', err);
      set({ isSaving: false, isDirty: false });
      return {
        success: true,
        message: 'Taslak değişiklikler yerel hafızaya kaydedildi.',
      };
    }
  },

  publishCurrentPackage: async () => {
    const { draftShapes, draftStops, viaPoints, activePackageId, packages, currentOperator } = get();
    const validation = validatePreFlight(draftShapes, draftStops);

    if (!validation.valid) {
      return validation;
    }

    set({ isPublishing: true });

    try {
      await adminApi.publishPackage(activePackageId, {
        publishedBy: currentOperator.name,
        changeReason: 'UKOME Kararı gereği kalıcı olarak canlıya alındı',
      });
      set({ backendConnected: true });
    } catch (err) {
      console.warn('Backend publish çağrısı yanıt vermedi, yerel simülasyon tamamlanıyor:', err);
    }

    const updatedPackages = packages.map((pkg) =>
      pkg.packageId === activePackageId
        ? {
            ...pkg,
            status: 'PUBLISHED' as const,
            publishedBy: currentOperator.name,
            publishedAt: new Date().toISOString(),
          }
        : pkg
    );

    set({
      packages: updatedPackages,
      liveShapes: [...draftShapes],
      liveStops: [...draftStops],
      liveViaPoints: [...viaPoints],
      isPublishing: false,
      isDirty: false,
      activeTool: 'pan',
    });

    return validation;
  },

  rollbackCurrentPackage: async () => {
    const { activePackageId, packages, liveShapes, liveStops, liveViaPoints } = get();

    try {
      await adminApi.rollbackPackage(activePackageId);
      set({ backendConnected: true });
    } catch (err) {
      console.warn('Backend rollback çağrısı yanıt vermedi, yerel simülasyon tamamlanıyor:', err);
    }

    const updatedPackages = packages.map((pkg) =>
      pkg.packageId === activePackageId
        ? {
            ...pkg,
            status: 'ROLLED_BACK' as const,
            rolledBackAt: new Date().toISOString(),
          }
        : pkg
    );

    set({
      packages: updatedPackages,
      draftShapes: [...liveShapes],
      draftStops: [...liveStops],
      viaPoints: [...liveViaPoints],
      isDirty: false,
    });

    return {
      success: true,
      message: 'Paket geri alındı (Rollback). Harita önceki canlı sürüme döndürüldü.',
    };
  },
}));

