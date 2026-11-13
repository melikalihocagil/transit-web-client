import React, { useEffect } from 'react';
import { Header } from './components/layout/Header';
import { StatusBar } from './components/layout/StatusBar';
import { RouteCatalogPanel } from './components/sidebar/RouteCatalogPanel';
import { GisMapCanvas } from './components/map/GisMapCanvas';
import { useEditHistoryStore } from './store';

export const App: React.FC = () => {
  // Global klavye kısayolları: Ctrl+Z (geri al), Ctrl+Y / Ctrl+Shift+Z (ileri al).
  // Durak ve hat düzenlemeleri tek ortak geçmişi kullanır (editHistory).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bir input veya textarea içerisindeyken harita undo/redo'sunu çalıştırma
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            useEditHistoryStore.getState().redo();
          } else {
            useEditHistoryStore.getState().undo();
          }
        } else if (key === 'y') {
          e.preventDefault();
          useEditHistoryStore.getState().redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none text-slate-100">
      {/* 1. Üst Bar Bileşeni */}
      <Header operatorId="operator-1" />

      {/* 2. Ana Çalışma Alanı: Sol Panel (Katalog) + Sağ Panel (Harita) */}
      <div className="flex flex-1 overflow-hidden relative">
        <RouteCatalogPanel />

        <main className="flex-1 h-full relative z-0 bg-slate-950">
          <GisMapCanvas />
        </main>
      </div>

      {/* 3. Alt Durum Çubuğu Bileşeni */}
      <StatusBar statusText="Sistem Hazır" />
    </div>
  );
};

export default App;
