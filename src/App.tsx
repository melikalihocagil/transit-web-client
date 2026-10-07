import React, { useEffect } from 'react';
import { Header } from './components/layout/Header';
import { RouteDetailsPanel } from './components/editor/RouteDetailsPanel';
import { StopList } from './components/editor/StopList';
import { GisMap } from './components/map/GisMap';
import { useWorkspaceStore } from './stores/useWorkspaceStore';

export const App: React.FC = () => {
  const { isDirty } = useWorkspaceStore();

  // Unsaved Changes Guard: Kullanıcı sayfayı kapatırken veya yenilerken uyar
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'Kaydedilmemiş taslak değişiklikleriniz var. Sayfadan ayrılmak istediğinize emin misiniz?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Keyboard Shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useWorkspaceStore.getState().redo();
        } else {
          useWorkspaceStore.getState().undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useWorkspaceStore.getState().redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* Üst Yönetim Barı */}
      <Header />

      {/* Ana Çalışma Alanı (Split-View) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sol Panel: Hat Özeti & Durak Dizilimi (DnD) */}
        <aside className="w-80 sm:w-96 h-full flex flex-col border-r border-slate-800 bg-slate-900 z-20 shadow-xl">
          <RouteDetailsPanel />
          <StopList />
        </aside>

        {/* Sağ Panel: Etkileşimli GIS Harita Tuvali */}
        <main className="flex-1 h-full relative z-10">
          <GisMap />
        </main>
      </div>
    </div>
  );
};

export default App;
