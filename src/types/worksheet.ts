export interface WorksheetSyncPayload {
  packageId: string;
  routeId: string;
  shapeId: string;
  shapes: Array<{
    shapePtSequence: number;
    shapePtLat: number;
    shapePtLon: number;
    shapeDistTraveled: number;
  }>;
  stops: Array<{
    stopId: string;
    stopName: string;
    stopLat: number;
    stopLon: number;
    stopSequence: number;
    actionType: string;
  }>;
}

export interface PreFlightCheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
