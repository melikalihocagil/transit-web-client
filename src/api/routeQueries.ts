import { useQuery } from '@tanstack/react-query';
import { routeApi } from './routeApi';
import type { Route } from '../model';

export function useRoutesQuery() {
  return useQuery<Route[], Error>({
    queryKey: ['routes'],
    queryFn: routeApi.fetchRouteList,
    staleTime: Infinity,
  });
}
