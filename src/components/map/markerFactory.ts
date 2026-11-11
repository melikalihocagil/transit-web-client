import L from 'leaflet';

/**
 * Aktif hatta ait durak pini üretir.
 * - Normal Durak: Mavi dairesel rozet, sıra numarası yazar
 * - Sevk Noktası (Terminal): Kehribar (Amber) rozet
 */
export function createRouteStopIcon(sequence: number, isTerminal: boolean): L.DivIcon {
  const bg = isTerminal ? '#f59e0b' : '#2563eb';
  const border = isTerminal ? '#fde68a' : '#ffffff';

  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 9999px;
      background-color: ${bg};
      border: 2px solid ${border};
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      color: #ffffff;
      font-family: monospace;
      font-size: 10px;
      font-weight: 700;
      cursor: grab;
      user-select: none;
    ">
      ${sequence}
    </div>
  `;

  return L.divIcon({
    html,
    className: 'transit-stop-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/**
 * Rota çizgisi üzerindeki ara kılavuz nokta (Via) tutamacı.
 * Küçük beyaz daire, mavi çerçeveli, sürüklenebilir.
 */
export function createViaHandleIcon(): L.DivIcon {
  const html = `
    <div style="
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background-color: #ffffff;
      border: 2.5px solid #3b82f6;
      box-shadow: 0 2px 4px rgba(0,0,0,0.35);
      cursor: grab;
      user-select: none;
    "></div>
  `;

  return L.divIcon({
    html,
    className: 'transit-via-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/**
 * Şehir genelindeki durak pini (738 durak).
 * - Normal: 10px slate daire
 * - Terminal: 12px amber daire
 * - Konumu Değişmiş (Dirty): 12px mavi daire
 */
export function createCityStopIcon(isTerminal: boolean, isMoved: boolean): L.DivIcon {
  const bg = isMoved ? '#2563eb' : isTerminal ? '#f59e0b' : '#64748b';
  const border = isMoved ? '#93c5fd' : isTerminal ? '#fde68a' : '#cbd5e1';
  const size = isMoved ? 13 : isTerminal ? 12 : 10;

  const html = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 9999px;
      background-color: ${bg};
      border: 1.5px solid ${border};
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      cursor: grab;
      user-select: none;
    "></div>
  `;

  return L.divIcon({
    html,
    className: 'city-stop-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Konumu taşınmış bir durağın orijinal (published) konumunda altta kalan hayalet pini.
 * Kesikli gri/soluk çerçeveli, tıklanamaz.
 */
export function createGhostStopIcon(sequence?: number): L.DivIcon {
  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 9999px;
      background-color: rgba(30, 41, 59, 0.65);
      border: 2px dashed #94a3b8;
      color: #cbd5e1;
      font-family: monospace;
      font-size: 10px;
      font-weight: 700;
      pointer-events: none;
      user-select: none;
    ">
      ${sequence !== undefined ? sequence : ''}
    </div>
  `;

  return L.divIcon({
    html,
    className: 'transit-ghost-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/**
 * Rota çizgisi üzerine gelindiğinde veya çizgi sürüklenirken beliren dinamik tutamaç pini.
 * Canlı mavi merkez, beyaz çerçeve, parlak dış gölge, 'grab' imleç.
 */
export function createLineDragHandleIcon(): L.DivIcon {
  const html = `
    <div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background-color: #3b82f6;
      border: 2.5px solid #ffffff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5), 0 2px 6px rgba(0, 0, 0, 0.45);
      cursor: grab;
      user-select: none;
      pointer-events: auto;
      transform-origin: center;
      transition: transform 0.12s ease-out;
    "></div>
  `;

  return L.divIcon({
    html,
    className: 'transit-line-drag-handle',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}
