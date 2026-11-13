import L from 'leaflet';

/**
 * Aktif hatta ait durak pini: hattın renginde dairesel rozet, sıra numarası hattın yazı renginde.
 * Sevk noktası (terminal) aynı renkte, kehribar çerçeve ve biraz daha büyük.
 */
export function createRouteStopIcon(
  sequence: number,
  isTerminal: boolean,
  color = '#2563eb',
  textColor = '#ffffff'
): L.DivIcon {
  const size = isTerminal ? 26 : 24;
  const border = isTerminal ? '3px solid #f59e0b' : '2px solid #ffffff';

  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: ${size}px;
      height: ${size}px;
      box-sizing: border-box;
      border-radius: 9999px;
      background-color: ${color};
      border: ${border};
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      color: ${textColor};
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
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Rota çizgisi üzerindeki ara kılavuz nokta (Via) tutamacı.
 * Küçük beyaz daire, mavi çerçeveli, sürüklenebilir.
 */
export function createViaHandleIcon(color = '#3b82f6'): L.DivIcon {
  const html = `
    <div style="
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background-color: #ffffff;
      border: 2.5px solid ${color};
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
 * Rota çizgisi üzerine gelindiğinde veya çizgi sürüklenirken beliren işaret noktası.
 * Canlı mavi merkez, beyaz çerçeve, parlak dış gölge. Yalnızca görseldir: fare olaylarını
 * yakalamaz (olaylar alttaki yakalama çizgisine düşer), bu yüzden haritada takılı kalamaz.
 */
export function createLineDragHandleIcon(color = '#3b82f6'): L.DivIcon {
  const html = `
    <div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background-color: ${color};
      border: 2.5px solid #ffffff;
      box-shadow: 0 0 0 2px ${color}80, 0 2px 6px rgba(0, 0, 0, 0.45);
      user-select: none;
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

/**
 * Hayaletin üzerine gelindiğinde aynı id'li hayalet ve draft noktasının üzerinde yanıp sönen halka.
 * Animasyon iç div'dedir: Leaflet konumlandırmayı dış elemanın transform'u ile yapar.
 */
export function createBlinkRingIcon(): L.DivIcon {
  return L.divIcon({
    html: '<div class="transit-blink-ring"></div>',
    className: 'transit-blink-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export interface DiffBubbleValue {
  /** Taslağın değeri (biçimlenmiş). */
  value: string;
  /** Yayındakine göre fark (biçimlenmiş, işaretli); fark yoksa null. */
  delta: string | null;
  /** Fark artış mı? (true: kırmızı, false: yeşil) */
  increased: boolean;
}

/** Fark baloncuklarının ölçeği; pane üzerinde zoom'a göre güncellenir. */
export const DIFF_BUBBLE_SCALE_VAR = '--diff-bubble-scale';

/**
 * Taslağın yayındakinden ayrıştığı bölgenin baloncuğu: taslağın mesafe ve süresi, yanlarında
 * parantez içinde fark. Nokta baloncuğun alt ucudur (çizgi üzerinde). Boyutu pane'deki
 * `DIFF_BUBBLE_SCALE_VAR` değişkeniyle ölçeklenir (alt uç sabit kalır).
 */
export function createDiffBubbleIcon(
  distance: DiffBubbleValue,
  duration: DiffBubbleValue,
  increaseColor: string,
  decreaseColor: string
): L.DivIcon {
  const part = ({ value, delta, increased }: DiffBubbleValue) =>
    delta === null
      ? value
      : `${value} <span style="color: ${increased ? increaseColor : decreaseColor}; font-weight: 700;">(${delta})</span>`;

  const html = `
    <div style="
      position: absolute;
      left: 0;
      bottom: 0;
      padding-bottom: 8px;
      transform: translateX(-50%) scale(var(${DIFF_BUBBLE_SCALE_VAR}, 1));
      transform-origin: 50% 100%;
    ">
      <div style="
        position: relative;
        white-space: nowrap;
        padding: 4px 8px;
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid #334155;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        color: #e2e8f0;
        font-family: sans-serif;
        font-size: 11px;
        line-height: 1.35;
        user-select: none;
      ">
        ${part(distance)} &middot; ${part(duration)}
        <div style="
          position: absolute;
          left: 50%;
          bottom: -5px;
          width: 8px;
          height: 8px;
          transform: translateX(-50%) rotate(45deg);
          background: rgba(15, 23, 42, 0.92);
          border-right: 1px solid #334155;
          border-bottom: 1px solid #334155;
        "></div>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'transit-diff-bubble',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
