import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Resmi katalog ve duraklar seans boyunca statiktir
      gcTime: 1000 * 60 * 60, // 1 saat hafızada tut
      refetchOnWindowFocus: false, // Arka planda istem dışı yenilenip taslağı ezmeyi önler
      retry: 1,
    },
  },
});
