import React, { useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { RouteEditorPage } from './pages/RouteEditorPage';
import { HOME_PATH, isRoutesPath, navigate, usePathname } from './routing/location';

/**
 * Sayfa seçimi (adres katmanı: routing/location.ts):
 *   /                 -> ana sayfa (çalışma alanı kartları)
 *   /routes[/{kod}]   -> haritalı hat düzenleyici
 *   diğer             -> ana sayfaya yönlendirilir
 */
export const App: React.FC = () => {
  const pathname = usePathname();
  const isEditor = isRoutesPath(pathname);
  const isHome = pathname === HOME_PATH;

  useEffect(() => {
    if (!isEditor && !isHome) navigate(HOME_PATH, { replace: true });
  }, [isEditor, isHome]);

  return isEditor ? <RouteEditorPage /> : <HomePage />;
};

export default App;
