import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Crosshair, Flag, MapPin } from 'lucide-react';
import type { Stop } from '../../../model';
import { isTerminalStop } from '../../../model';

interface SortableStopRowProps {
  stop: Stop;
  index: number;
  canRemove: boolean;
  onRemove: (stopId: string) => void;
  onFocus: (stop: Stop) => void;
  isFirst: boolean;
  isLast: boolean;
}

export const SortableStopRow: React.FC<SortableStopRowProps> = ({
  stop,
  index,
  canRemove,
  onRemove,
  onFocus,
  isFirst,
  isLast,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.stopId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const isTerminal = isTerminalStop(stop);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-2 rounded-lg border transition-all text-sm ${
        isDragging
          ? 'bg-blue-950/60 border-blue-500 shadow-lg'
          : 'bg-slate-900/80 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
      }`}
    >
      {/* 1. Sürükleme Tutamacı */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-1 -m-1 rounded hover:bg-slate-800/80 transition-colors"
        title="Durağın sırasını değiştirmek için sürükleyin"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 2. Sıra Rozeti ve Terminal Göstergesi */}
      <div
        className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-mono font-bold shrink-0 border ${
          isTerminal
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
        }`}
        title={isTerminal ? 'Sevk Noktası (Terminal)' : 'Normal Durak'}
      >
        {isFirst ? (
          <Flag className="w-3.5 h-3.5 text-emerald-400" />
        ) : isLast ? (
          <MapPin className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          index + 1
        )}
      </div>

      {/* 3. Durak Bilgisi ve Haritaya Odaklanma Butonu */}
      <button
        type="button"
        onClick={() => onFocus(stop)}
        className="flex-1 min-w-0 text-left flex flex-col justify-center cursor-pointer group/focus"
        title="Haritada bu durağa odaklan"
      >
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate font-medium text-slate-200 group-hover/focus:text-blue-300 transition-colors">
            {stop.stopName}
          </span>
          <Crosshair className="w-3.5 h-3.5 text-transparent group-hover/focus:text-blue-400 shrink-0 transition-colors" />
        </div>
        <div className="text-xs font-mono text-slate-500 flex items-center gap-1">
          <span>#{stop.stopId}</span>
          {isTerminal && <span className="text-amber-400/90">&bull; Terminal</span>}
        </div>
      </button>

      {/* 4. Durak Silme Butonu */}
      <button
        type="button"
        disabled={!canRemove}
        onClick={() => onRemove(stop.stopId)}
        title={canRemove ? 'Durağı hattan çıkar' : 'Hat en az 2 duraktan oluşmalıdır'}
        className="text-slate-500 hover:text-rose-400 disabled:opacity-20 disabled:hover:text-slate-500 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
