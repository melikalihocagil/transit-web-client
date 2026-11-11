import type { Stop } from './stop';

export interface StopsData {
  published: Stop[];
  draft: Stop[] | null;
}
