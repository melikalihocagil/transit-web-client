import type { Coordinate } from './coordinate';

export interface Leg {
  coordinates: Coordinate[];
  distance: number;
  duration: number;
}
