import React, { useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { RouteEditorPage } from './pages/RouteEditorPage';
import { RouteInfoPage } from './pages/RouteInfoPage';
import { HOME_PATH, isRouteInfoPath, isRoutesPath, navigate, usePathname } from './routing/location';

/**
 * Sayfa seçimi (adres katmanı: routing/location.ts):
 *   /                     -> ana sayfa (çalışma alanı kartları)
 *   /routes[/{kod}]       -> haritalı hat düzenleyici
 *   /route-info[/{kod}]   -> hat bilgileri (kod, ad, tür, renk; yeni / silinen hatlar)
 *   diğer                 -> ana sayfaya yönlendirilir
 */
export const App: React.FC = () => {
  const pathname = usePathname();
  const isEditor = isRoutesPath(pathname);
  const isRouteInfo = isRouteInfoPath(pathname);
  const isHome = pathname === HOME_PATH;

  useEffect(() => {
    if (!isEditor && !isRouteInfo && !isHome) navigate(HOME_PATH, { replace: true });
  }, [isEditor, isRouteInfo, isHome]);

  if (isEditor) return <RouteEditorPage />;
  if (isRouteInfo) return <RouteInfoPage />;
  return <HomePage />;
};

export default App;
