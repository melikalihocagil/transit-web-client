import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableStopRow } from './SortableStopRow';
import { RouteViaBadge } from './RouteViaBadge';
import { MapPin, AlertCircle } from 'lucide-react';
import type { LegTotals, Stop, Via } from '../../../model';
import { isViaBetween, sortViasBySequence, formatDistance, formatDuration } from '../../../model';

interface SortableStopListProps {
  stops: Stop[];
  vias: Via[];
  /** Her durak aralığının (i -> i+1) toplam mesafe/süresi; `null` ise (hesap sürüyor) gösterilmez. */
  segmentTotals?: LegTotals[] | null;
  canRemove: boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemoveStop: (stopId: string) => void;
  onRemoveVia: (via: Via) => void;
  onFocusStop: (stop: Stop) => void;
}

export const SortableStopList: React.FC<SortableStopListProps> = ({
  stops,
  vias,
  segmentTotals,
  canRemove,
  onReorder,
  onRemoveStop,
  onRemoveVia,
  onFocusStop,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4, // 4 piksel hareket etmeden sürükleme başlatılmaz (tıklama ile sürükleme ayrımı)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stops.findIndex((s) => s.stopId === active.id);
    const newIndex = stops.findIndex((s) => s.stopId === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(oldIndex, newIndex);
    }
  };

  if (stops.length === 0) {
    return (
      <div className="flex-1 p-4 flex flex-col items-center justify-center text-center text-slate-500">
        <MapPin className="w-8 h-8 mb-2 stroke-1 text-slate-600" />
        <p className="text-xs font-medium text-slate-400">Bu hatta ait durak bulunamadı</p>
        <p className="text-[11px] text-slate-600 mt-1">Haritadan durak ekleyebilirsiniz</p>
      </div>
    );
  }

  const stopIds = stops.map((s) => s.stopId);

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col">
      <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 px-1 pb-2 flex items-center justify-between">
        <span>Güzergah Durak Sırası</span>
        <span className="text-slate-600">Sürükle-Bırak</span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {stops.map((stop, index) => {
              // İki durak arasındaki via'ları tespit et
              const nextStop = stops[index + 1];
              const segmentVias = nextStop
                ? sortViasBySequence(
                    vias.filter((v) => isViaBetween(v, stop.stopId, nextStop.stopId))
                  )
                : [];
              const segmentTotal = nextStop ? segmentTotals?.[index] : undefined;

              return (
                <React.Fragment key={stop.stopId}>
                  <SortableStopRow
                    stop={stop}
                    index={index}
                    canRemove={canRemove}
                    onRemove={onRemoveStop}
                    onFocus={onFocusStop}
                    isFirst={index === 0}
                    isLast={index === stops.length - 1}
                  />

                  {/* İki durak arasındaki via noktaları */}
                  {segmentVias.map((via) => (
                    <RouteViaBadge
                      key={`${via.fromStopId}-${via.toStopId}-${via.viaSequence}`}
                      via={via}
                      onRemove={onRemoveVia}
                    />
                  ))}

                  {/* Bir sonraki durağa kadar aradaki tüm bacakların toplamı */}
                  {segmentTotal && (
                    <div className="ml-4 pl-4 py-0.5 border-l-2 border-dotted border-slate-700 text-[10px] font-mono text-slate-500">
                      {formatDistance(segmentTotal.distance)} &middot; {formatDuration(segmentTotal.duration)}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {!canRemove && (
        <div className="mt-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Güzergah geçerliliği için en az 2 durak bulunmalıdır.</span>
        </div>
      )}
    </div>
  );
};
