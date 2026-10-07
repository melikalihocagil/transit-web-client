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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, MapPin, Milestone, Building2 } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { buildOrderedWaypoints } from '../../utils/geoUtils';
import type { RouteWaypointDto } from '../../types/gtfs';

interface SortableWaypointRowProps {
  waypoint: RouteWaypointDto;
  onDelete: (sequence: number) => void;
  onSelect: (waypoint: RouteWaypointDto) => void;
  isTerminalHub?: boolean;
  isFocused?: boolean;
}

const getItemId = (wp: RouteWaypointDto): string =>
  wp.stopId ? `stop-${wp.stopId}-${wp.sequence}` : `via-${wp.sequence}`;

const SortableWaypointRow: React.FC<SortableWaypointRowProps> = ({
  waypoint,
  onDelete,
  onSelect,
  isTerminalHub,
  isFocused,
}) => {
  const isStop = waypoint.stopId != null;
  const isStation = isStop && (waypoint.locationType === 1 || isTerminalHub);
  const itemId = getItemId(waypoint);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : isFocused ? 20 : 'auto',
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      id={`waypoint-row-${waypoint.sequence}`}
      style={style}
      onClick={() => onSelect(waypoint)}
      title="Haritada bu noktaya odaklanmak ve detaylarını görmek için tıklayın"
      className={`group flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all duration-300 select-none cursor-pointer ${
        isDragging
          ? 'bg-blue-950/80 border-blue-500 shadow-lg'
          : isFocused
          ? 'ring-2 ring-emerald-400 bg-emerald-950/70 border-emerald-500 shadow-lg shadow-emerald-900/40 scale-[1.01]'
          : isStation
          ? 'bg-indigo-950/40 border-amber-500/40 hover:border-amber-400 hover:bg-indigo-950/60'
          : isStop
          ? 'bg-slate-900 border-slate-800 hover:border-blue-500/70 hover:bg-slate-800/80'
          : 'bg-amber-950/20 border-amber-900/40 hover:border-amber-600/70 hover:bg-amber-950/40'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Sürükleme Tutamacı */}
        <button
          {...attributes}
          {...listeners}
          className="text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing p-0.5 rounded touch-none"
          title="Sırayı değiştirmek için sürükleyin"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Sıra Numarası Rozeti */}
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 text-white ${
            isFocused
              ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 animate-pulse'
              : isStation
              ? 'bg-amber-600 text-amber-100 ring-1 ring-amber-400'
              : isStop
              ? 'bg-blue-600'
              : 'bg-amber-600'
          }`}
        >
          {waypoint.sequence}
        </div>

        {/* Nokta Tanımı ve Koordinatlar */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-semibold truncate ${isFocused ? 'text-emerald-200' : 'text-slate-200'}`}>
              {isStop ? waypoint.name || 'İsimsiz Durak' : 'Güzergah / Şerit Kilidi'}
            </span>

            {isFocused && (
              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 rounded shrink-0 animate-pulse">
                YENİ
              </span>
            )}

            {isStation ? (
              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded shrink-0 flex items-center gap-1">
                <Building2 className="w-2.5 h-2.5" />
                SEVK İDARE / TERMİNAL
              </span>
            ) : isStop ? (
              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded shrink-0">
                DURAK
              </span>
            ) : (
              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded shrink-0 flex items-center gap-0.5">
                <Milestone className="w-2.5 h-2.5 inline" />
                VİA KİLİDİ
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {waypoint.lat.toFixed(4)}, {waypoint.lon.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Silme Butonu */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(waypoint.sequence);
        }}
        title={isStation ? 'Terminal Durağını Kaldır' : isStop ? 'Durağı Kaldır' : 'Kilit Noktasını Kaldır'}
        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded transition cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const StopList: React.FC = () => {
  const {
    draftWaypoints,
    draftStops,
    viaPoints,
    reorderWaypoints,
    deleteWaypoint,
    activeTool,
    setActiveTool,
    focusedWaypointSequence,
    setFocusedWaypointSequence,
    focusOnMap,
  } = useWorkspaceStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Yeni bir durak veya via noktası eklendiğinde (veya haritada tıklandığında) listeyi oraya kaydır ve odaklan
  React.useEffect(() => {
    if (focusedWaypointSequence == null) return;

    const scrollTimer = setTimeout(() => {
      const rowEl = document.getElementById(`waypoint-row-${focusedWaypointSequence}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);

    const clearTimer = setTimeout(() => {
      setFocusedWaypointSequence(null);
    }, 4000);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [focusedWaypointSequence, setFocusedWaypointSequence]);

  // SSoT Waypoint Dizisi: draftWaypoints veya stops+vias türetimi
  const waypoints: RouteWaypointDto[] =
    draftWaypoints && draftWaypoints.length > 0
      ? draftWaypoints
      : buildOrderedWaypoints(draftStops, viaPoints).map((w, idx) => ({
          sequence: idx + 1,
          stopId: w.isViaPoint ? null : w.id,
          name: w.isViaPoint ? null : w.name || null,
          lat: w.lat,
          lon: w.lon,
          distTraveled: null,
          locationType: w.isViaPoint ? null : (draftStops.find((s) => s.stopId === w.id)?.locationType ?? null),
        }));

  const stopCount = waypoints.filter((w) => w.stopId != null).length;
  const viaCount = waypoints.filter((w) => w.stopId == null).length;

  const firstWp = waypoints[0];
  const lastWp = waypoints[waypoints.length - 1];
  const isRingTerminalHub =
    firstWp?.stopId != null &&
    lastWp?.stopId != null &&
    firstWp.stopId === lastWp.stopId &&
    waypoints.length > 1;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = waypoints.findIndex((w) => getItemId(w) === active.id);
      const newIndex = waypoints.findIndex((w) => getItemId(w) === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderWaypoints(oldIndex, newIndex);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
      {/* Başlık ve Ekle Butonu */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Güzergah Tasarım Zinciri
          </h3>
          <p className="text-[11px] text-slate-500">
            {waypoints.length} Nokta ({stopCount} Durak{viaCount > 0 ? `, ${viaCount} Via` : ''}) • Sürükleyip sıralayın
          </p>
        </div>

        <button
          onClick={() => setActiveTool(activeTool === 'add_stop' ? 'pan' : 'add_stop')}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition border cursor-pointer ${
            activeTool === 'add_stop'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
          title="Haritaya Tıklayarak Yeni Yolcu Durağı Ekle"
        >
          <MapPin className="w-3.5 h-3.5 text-emerald-400" />
          <span>+ Durak</span>
        </button>
      </div>

      {/* Sürüklenebilir Sıralı Zincir Listesi */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={waypoints.map(getItemId)} strategy={verticalListSortingStrategy}>
            {waypoints.map((wp) => {
              const isHub =
                isRingTerminalHub && (wp.sequence === firstWp.sequence || wp.sequence === lastWp.sequence);
              const isFocused = wp.sequence === focusedWaypointSequence;
              return (
                <SortableWaypointRow
                  key={getItemId(wp)}
                  waypoint={wp}
                  isTerminalHub={isHub}
                  isFocused={isFocused}
                  onDelete={deleteWaypoint}
                  onSelect={focusOnMap}
                />
              );
            })}
          </SortableContext>
        </DndContext>

        {waypoints.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-xs space-y-1">
            <p>Hatta henüz durak veya güzergah kilidi bulunmuyor.</p>
            <p className="text-[10px] text-slate-600">
              Yukarıdaki "+ Durak" butonu ile haritaya tıklayarak durak ekleyebilir veya mavi çizgiye tıklayarak kilit oluşturabilirsiniz.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
