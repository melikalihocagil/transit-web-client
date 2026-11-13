import { useEffect } from 'react';
import L from 'leaflet';
import { useStopDraftStore, useMapHighlightStore, nextNewStopId } from '../../store';

/** Mod açıkken haritanın kapsayıcısına eklenen sınıf (bkz. index.css): imleç artı olur, hat/durak katmanları tıklama almaz. */
const ADDING_CLASS = 'transit-adding-stop';

/** Klavye kısayolu: modu açar/kapatır (metin alanına yazarken ve Ctrl/Alt/Meta ile çalışmaz). */
const SHORTCUT_KEY = 'n';

const LOCATION_TYPES: { value: number; label: string }[] = [
  { value: 0, label: 'Normal durak' },
  { value: 1, label: 'Sevk noktası' },
];

// lucide "map-pin-plus" simgesi
const PIN_PLUS_ICON = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738"/>
    <circle cx="12" cy="10" r="3"/>
    <path d="M16 18h6"/><path d="M19 15v6"/>
  </svg>`;

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

const setAddingStop = (value: boolean) => useMapHighlightStore.getState().setAddingStop(value);

/**
 * Haritadan yeni şehir durağı ekleme (tek seferlik mod).
 *
 * - Sağ altta, katman seçicinin solundaki ikon ya da N tuşu modu açar/kapatır; mod açıkken baloncuk talimatı gösterir.
 * - Mod açıkken haritaya tıklanan noktada form açılır: numara (5XXXX, otomatik), ad (zorunlu), tür.
 * - "Ekle" durağı taslağa yazar (`addStop`; geri alınabilir, Kaydet ile sunucuya gider) ve modu kapatır.
 *   Vazgeç, formun kapatma düğmesi ve Esc de modu kapatır.
 */
export function useAddStopMode(map: L.Map | null): void {
  const isAddingStop = useMapHighlightStore((state) => state.isAddingStop);

  // 1. Düğme ve kısayol: harita başına bir kez
  useEffect(() => {
    if (!map) return;

    // Sağ alttaki katman seçicinin eşi: aynı Leaflet kutusu (leaflet-control-layers), yazısız ikon,
    // üstüne gelince baloncuk. Katman seçici altlık dosyası kontrol edildikten sonra (asenkron) eklendiği
    // için köşede onun önüne yerleşir; CSS (clear: none) bu düğmeyi onun soluna, aynı satıra alır.
    const AddStopControl = L.Control.extend({
      onAdd() {
        const wrapper = L.DomUtil.create('div', 'leaflet-control-layers transit-add-stop-control');
        const button = L.DomUtil.create('button', 'transit-add-stop-button', wrapper);
        button.type = 'button';
        button.setAttribute('aria-label', 'Durak ekle (N)');
        button.innerHTML = `
          ${PIN_PLUS_ICON}
          <span class="transit-add-stop-tip" role="tooltip">
            <span class="transit-add-stop-label">Durak ekle</span>
            <kbd class="transit-add-stop-kbd">N</kbd>
          </span>`;
        L.DomEvent.disableClickPropagation(wrapper);
        L.DomEvent.disableScrollPropagation(wrapper);
        L.DomEvent.on(button, 'click', () => setAddingStop(!useMapHighlightStore.getState().isAddingStop));
        return wrapper;
      },
    });
    const control = new AddStopControl({ position: 'bottomright' }).addTo(map);

    const handleShortcut = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== SHORTCUT_KEY || e.repeat) return;
      if (e.ctrlKey || e.altKey || e.metaKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      setAddingStop(!useMapHighlightStore.getState().isAddingStop);
    };
    window.addEventListener('keydown', handleShortcut);

    return () => {
      window.removeEventListener('keydown', handleShortcut);
      control.remove();
      setAddingStop(false);
    };
  }, [map]);

  // 2. Mod açıkken: düğme durumu, imleç, ipucu, harita tıklaması ve form
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    const button = container.querySelector('.transit-add-stop-button');
    const label = container.querySelector('.transit-add-stop-label');
    const kbd = container.querySelector('.transit-add-stop-kbd');
    button?.classList.toggle('is-active', isAddingStop);
    button?.setAttribute('aria-pressed', String(isAddingStop));
    // Mod açıkken baloncuk sürekli görünür ve talimatı gösterir; düğmeye tıklamak (ya da Esc) vazgeçer
    if (label) label.textContent = isAddingStop ? 'Yeni durağın yerine tıklayın' : 'Durak ekle';
    if (kbd) kbd.textContent = isAddingStop ? 'Esc' : 'N';
    if (!isAddingStop) return;

    container.classList.add(ADDING_CLASS);

    let popup: L.Popup | null = null;
    // Form kapanınca (Ekle, Vazgeç, ✕) mod da kapanır
    const finish = () => setAddingStop(false);

    const openForm = (latlng: L.LatLng) => {
      // Form açıkken başka yere tıklanırsa form oraya taşınır (eski popup modu kapatmadan kaldırılır)
      const previous = popup;
      popup = null;
      previous?.remove();
      const stopId = nextNewStopId(useStopDraftStore.getState());
      const form = L.DomUtil.create('form', 'transit-add-stop-form');

      if (stopId === null) {
        form.innerHTML = '<div class="transit-add-stop-error">Yeni durak numaraları (50001–59999) doldu.</div>';
      } else {
        form.innerHTML = `
          <div class="transit-add-stop-title">Yeni durak <strong>#${escapeHtml(stopId)}</strong></div>
          <label>Durak adı
            <input name="stopName" type="text" required autocomplete="off" placeholder="ör. TEST 1 NOLU DURAĞI" />
          </label>
          <label>Tür
            <select name="locationType">
              ${LOCATION_TYPES.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('')}
            </select>
          </label>
          <div class="transit-add-stop-coords">${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</div>
          <div class="transit-add-stop-actions">
            <button type="button" data-action="cancel">Vazgeç</button>
            <button type="submit" data-action="submit" disabled>Ekle</button>
          </div>`;

        const nameInput = form.querySelector<HTMLInputElement>('input[name="stopName"]')!;
        const typeSelect = form.querySelector<HTMLSelectElement>('select[name="locationType"]')!;
        const submitButton = form.querySelector<HTMLButtonElement>('[data-action="submit"]')!;

        nameInput.addEventListener('input', () => {
          submitButton.disabled = nameInput.value.trim() === '';
        });
        form.querySelector('[data-action="cancel"]')!.addEventListener('click', finish);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = nameInput.value.trim();
          if (!name) return;
          useStopDraftStore.getState().addStop(name, latlng.lat, latlng.lng, Number(typeSelect.value));
          finish();
        });
        // Form içindeki tuşlar haritaya ve kısayollara ulaşmasın; Esc modu kapatır
        form.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Escape') finish();
        });
      }

      L.DomEvent.disableClickPropagation(form);
      L.DomEvent.disableScrollPropagation(form);

      const opened = L.popup({ autoClose: false, closeOnClick: false, className: 'transit-add-stop-popup' })
        .setLatLng(latlng)
        .setContent(form)
        .openOn(map);
      popup = opened;
      // ✕ ile kapatma da modu kapatır (temizlikte kaldırılan popup için tekrar tetiklenmez)
      opened.on('remove', () => {
        if (popup === opened) {
          popup = null;
          finish();
        }
      });
      form.querySelector<HTMLInputElement>('input[name="stopName"]')?.focus();
    };

    const handleMapClick = (e: L.LeafletMouseEvent) => openForm(e.latlng);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };

    map.on('click', handleMapClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      map.off('click', handleMapClick);
      window.removeEventListener('keydown', handleKeyDown);
      const open = popup;
      popup = null;
      open?.remove();
      container.classList.remove(ADDING_CLASS);
    };
  }, [map, isAddingStop]);
}
