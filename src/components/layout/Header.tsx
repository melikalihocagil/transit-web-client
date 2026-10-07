import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Save,
  Send,
  History,
  UserCheck,
  AlertTriangle,
  CheckCircle,
  Bus,
  Server,
  Layers,
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import type { PreFlightCheckResult } from '../../types/worksheet';

export const Header: React.FC = () => {
  const {
    backendConnected,
    checkBackendConnection,
    fetchRoutes,
    packages,
    activePackageId,
    operators,
    currentOperator,
    setOperator,
    isDirty,
    isSaving,
    isPublishing,
    historyIndex,
    history,
    undo,
    redo,
    saveDraftToWorksheet,
    publishCurrentPackage,
    rollbackCurrentPackage,
  } = useWorkspaceStore();

  const [validationModal, setValidationModal] = useState<PreFlightCheckResult | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    checkBackendConnection();
    fetchRoutes();
  }, [checkBackendConnection, fetchRoutes]);

  const activePackage = packages.find((p) => p.packageId === activePackageId) || packages[0];
  const isPublished = activePackage?.status === 'PUBLISHED';
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleSaveDraft = async () => {
    const res = await saveDraftToWorksheet();
    if (res.success) {
      showNotification(res.message, 'success');
    }
  };

  const handlePublish = async () => {
    const result = await publishCurrentPackage();
    if (!result.valid) {
      setValidationModal(result);
    } else {
      showNotification('Çalışma tezgahı başarıyla canlı GTFS katmanına alındı!', 'success');
    }
  };

  const handleRollback = async () => {
    if (window.confirm('Bu güzergahı canlıdan geri alıp önceki sürüme döndürmek istediğinize emin misiniz?')) {
      const res = await rollbackCurrentPackage();
      showNotification(res.message, 'success');
    }
  };

  return (
    <>
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-4 border-b border-slate-800 shrink-0 z-30 shadow-md">
        {/* Sol Alan: Logo, Bağlantı Durumu ve Çalışma Tezgahı (Worksheet) Rozeti */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-lg text-blue-400">
            <div className="p-1.5 bg-blue-600/30 rounded-lg border border-blue-500/40">
              <Bus className="w-5 h-5 text-blue-400" />
            </div>
            <span className="hidden sm:inline tracking-tight">TRANSIT ADMIN</span>
          </div>

          {/* Backend Port 8081 Bağlantı Göstergesi */}
          <div
            className={`hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              backendConnected
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title={backendConnected ? 'Backend Port 8081 Aktif & Bağlı' : 'Port 8081 Bekleniyor'}
          >
            <Server className={`w-3 h-3 ${backendConnected ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span>{backendConnected ? 'Port 8081 Bağlı' : 'Port 8081 Bekleniyor'}</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                backendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Çalışma Tezgahı (Worksheet) Durum Alanı (Yapay Paket Katmanı Kaldırıldı) */}
          <div
            className="flex items-center gap-2.5 px-3 py-1 bg-slate-800/70 border border-slate-700/80 rounded-lg text-xs"
            title="Tüm düzenlemeler canlı sistemi etkilemeden doğrudan çalışma tezgahı (worksheet) tablolarında kalıcı olarak saklanır."
          >
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Çalışma Tezgahı</span>
            </div>

            {isDirty ? (
              <span className="text-[11px] bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded animate-pulse">
                Kaydedilmedi
              </span>
            ) : (
              <span className="text-[11px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold px-2 py-0.5 rounded">
                Kalıcı Taslak
              </span>
            )}
          </div>
        </div>

        {/* Sağ Alan: Araçlar, Operatör ve Eylemler */}
        <div className="flex items-center gap-3">
          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Geri Al (Ctrl+Z)"
              className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="İleri Al (Ctrl+Y)"
              className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {/* Operatör Seçici (Denetim & Tarihçe İzleme İçin) */}
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
            <UserCheck className="w-4 h-4 text-blue-400" />
            <select
              value={currentOperator.id}
              onChange={(e) => {
                const op = operators.find((o) => o.id === e.target.value);
                if (op) setOperator(op);
              }}
              className="bg-transparent text-slate-300 font-medium focus:outline-none cursor-pointer"
            >
              {operators.map((op) => (
                <option key={op.id} value={op.id} className="bg-slate-800 text-white">
                  {op.name} ({op.role})
                </option>
              ))}
            </select>
          </div>

          {/* Taslağı Kaydet Butonu */}
          <button
            onClick={handleSaveDraft}
            disabled={!isDirty || isSaving || isPublished}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-white text-xs sm:text-sm font-medium rounded-lg transition shadow-sm border border-slate-600 cursor-pointer disabled:cursor-not-allowed"
            title="Taslağı çalışma tezgahı (worksheet) tablolarına kalıcı kaydeder"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isSaving ? 'Kaydediliyor...' : 'Taslağı Kaydet'}
            </span>
          </button>

          {/* Canlıya Al (Yayınla) veya Geri Al */}
          {isPublished ? (
            <button
              onClick={handleRollback}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-semibold rounded-lg transition shadow-md cursor-pointer"
            >
              <History className="w-4 h-4" />
              <span>Geri Al (Rollback)</span>
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg transition shadow-md shadow-blue-900/30 cursor-pointer"
              title="Çalışma tezgahındaki güzergahı canlı GTFS katmanına aktarır"
            >
              <Send className="w-4 h-4" />
              <span>{isPublishing ? 'Yayınlanıyor...' : 'Canlıya Al'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Bildirim Toast */}
      {feedbackMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 border transition-all animate-bounce ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
              : 'bg-red-950 text-red-200 border-red-700'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Pre-Flight Doğrulama Modalı */}
      {validationModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-800/60 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertTriangle className="w-7 h-7" />
              <h3 className="font-bold text-lg text-white">Canlıya Alma Kuralları İhlal Edildi</h3>
            </div>
            <p className="text-slate-300 text-xs mb-4">
              Toplu taşıma veri güvenliği ve GTFS bütünlüğü için aşağıdaki hatalar giderilmeden paket canlıya alınamaz:
            </p>
            <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
              {validationModal.errors.map((err, i) => (
                <div key={i} className="text-xs bg-red-950/60 border border-red-800 text-red-200 p-2.5 rounded-lg flex items-start gap-2">
                  <span className="font-bold">•</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setValidationModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
              >
                Anladım, Düzenlemeye Devam Et
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
