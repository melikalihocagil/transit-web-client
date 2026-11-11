export interface Route {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  routeTextColor: string;
  directionId: number;
  tripHeadsign: string;
  hasDraft: boolean;
}

export function formatRouteTitle(route: Route): string {
  return `${route.routeShortName} - ${route.routeLongName}`;
}
