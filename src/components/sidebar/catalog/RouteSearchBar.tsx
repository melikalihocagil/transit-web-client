import React from 'react';
import { Search, X } from 'lucide-react';

interface RouteSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
  totalCount?: number;
}

export const RouteSearchBar: React.FC<RouteSearchBarProps> = ({
  value,
  onChange,
  resultCount,
  totalCount,
}) => {
  return (
    <div className="p-2.5 border-b border-slate-800/80 bg-slate-900/50">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Hat kodu veya adı ara (örn: 101, Otogar)..."
          className="w-full bg-slate-950/80 border border-slate-800 rounded-md pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all font-sans"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
            title="Aramayı temizle"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {totalCount !== undefined && totalCount > 0 && (
        <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-500 font-mono">
          <span>
            {value.trim() ? (
              <>
                Bulunan: <strong className="text-blue-400">{resultCount ?? 0}</strong> / {totalCount} hat
              </>
            ) : (
              <>Toplam: <strong className="text-slate-300">{totalCount}</strong> hat</>
            )}
          </span>
        </div>
      )}
    </div>
  );
};
