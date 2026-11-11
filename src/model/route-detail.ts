import type { Stop } from './stop';
import type { Via } from './via';
import type { RouteNavigation } from './route-navigation';

export interface RouteDetail {
  stops: Stop[];
  vias: Via[];
  navigation: RouteNavigation | null;
}
