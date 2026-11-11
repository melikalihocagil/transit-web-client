import type { RouteDetail } from './route-detail';

export interface RouteData {
  routeId: string;
  published: RouteDetail;
  draft: RouteDetail | null;
}
