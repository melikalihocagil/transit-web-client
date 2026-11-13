import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Wand2, X } from 'lucide-react';
import {
  ROUTE_TYPES,
  MIN_TEXT_CONTRAST,
  contrastRatio,
  normalizeHexColor,
  suggestTextColor,
  toCssColor,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_ROUTE_TEXT_COLOR,
} from '../../model';
import { useRouteInfoStore, selectEffectiveRouteInfos, type RouteInfoInput } from '../../store';

interface RouteInfoFormProps {
  mode: 'create' | 'edit';
  /** Düzenlenen hat (oluşturmada yok); kod çakışması denetiminde kendisi hariç tutulur. */
  routeId?: string;
  initial: RouteInfoInput;
  onSubmit: (input: RouteInfoInput) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full px-2 py-1.5 rounded-md bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500';
const labelClass = 'text-xs font-medium uppercase tracking-wider text-slate-500';

/** Renk seçici + onaltılık kod alanı. Alan serbest yazılır; geçersizken seçici son geçerli rengi gösterir. */
const ColorField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  action?: React.ReactNode;
}> = ({ label, value, onChange, action }) => {
  const isValid = normalizeHexColor(value) !== null;
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={toCssColor(value, '#000000').toLowerCase()}
          onChange={(e) => onChange(e.target.value.slice(1).toUpperCase())}
          className="w-9 h-9 shrink-0 rounded-md bg-slate-950 border border-slate-700 p-0.5 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
          spellCheck={false}
          className={`${inputClass} font-mono uppercase ${isValid ? '' : 'border-rose-500 focus:border-rose-500'}`}
        />
        {action}
      </div>
    </label>
  );
};

/** Kayıtta: kullanıcının değiştirmediği renk olduğu gibi kalır, yeni yazılan renk `9696C0` biçimine getirilir. */
function finalColor(value: string, initial: string): string {
  const normalized = normalizeHexColor(value) ?? value;
  return normalized === normalizeHexColor(initial) ? initial : normalized;
}

/**
 * Hat bilgisi formu: kod, ad, tür, ajans, hat rengi, yazı rengi ve canlı rozet önizlemesi.
 * Yazı rengi, kullanıcı elle değiştirene kadar hat rengine göre önerilir. Kod başka bir hatta
 * kullanılıyorsa uyarı gösterilir: uygulanınca o hat listeden çıkar.
 */
export const RouteInfoForm: React.FC<RouteInfoFormProps> = ({ mode, routeId, initial, onSubmit, onCancel }) => {
  const [form, setForm] = useState<RouteInfoInput>(initial);
  const [isTextColorTouched, setTextColorTouched] = useState(mode === 'edit');

  const routes = useRouteInfoStore((state) => selectEffectiveRouteInfos(state));
  const conflicts = useMemo(() => {
    const code = form.routeShortName.trim();
    return code ? routes.filter((r) => r.routeId !== routeId && r.routeShortName.trim() === code) : [];
  }, [routes, form.routeShortName, routeId]);

  const update = (patch: Partial<RouteInfoInput>) => setForm((prev) => ({ ...prev, ...patch }));

  const setRouteColor = (value: string) => {
    const hex = normalizeHexColor(value);
    update(
      !isTextColorTouched && hex ? { routeColor: value, routeTextColor: suggestTextColor(hex) } : { routeColor: value }
    );
  };

  const isColorValid = normalizeHexColor(form.routeColor) !== null;
  const isTextColorValid = normalizeHexColor(form.routeTextColor) !== null;
  const contrast = contrastRatio(form.routeColor, form.routeTextColor);
  const canSubmit =
    form.routeShortName.trim() !== '' &&
    form.routeLongName.trim() !== '' &&
    form.agencyId.trim() !== '' &&
    isColorValid &&
    isTextColorValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      ...form,
      agencyId: form.agencyId.trim(),
      routeShortName: form.routeShortName.trim(),
      routeLongName: form.routeLongName.trim(),
      routeColor: finalColor(form.routeColor, initial.routeColor),
      routeTextColor: finalColor(form.routeTextColor, initial.routeTextColor),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="flex flex-col gap-3 p-3 rounded-lg bg-slate-900 border border-slate-700 select-text"
    >
      {/* Canlı önizleme */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          style={{
            backgroundColor: toCssColor(form.routeColor, DEFAULT_ROUTE_COLOR),
            color: toCssColor(form.routeTextColor, DEFAULT_ROUTE_TEXT_COLOR),
          }}
          className="px-2 py-0.5 rounded font-mono font-bold text-sm shadow-xs shrink-0"
        >
          {form.routeShortName.trim() || 'KOD'}
        </span>
        <span className="text-sm font-semibold text-slate-100 truncate">
          {form.routeLongName.trim() || (mode === 'create' ? 'Yeni hat' : 'Hat adı')}
        </span>
      </div>

      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Kod</span>
          <input
            autoFocus
            value={form.routeShortName}
            onChange={(e) => update({ routeShortName: e.target.value })}
            placeholder="G15"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Hat adı</span>
          <input
            value={form.routeLongName}
            onChange={(e) => update({ routeLongName: e.target.value })}
            placeholder="BAŞLANGIÇ-VARIŞ"
            className={inputClass}
          />
        </label>
      </div>

      {conflicts.length > 0 && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-amber-950/40 border border-amber-500/40 text-[13px] text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-amber-300">"{form.routeShortName.trim()}"</strong> kodu{' '}
            {conflicts.map((r) => r.routeLongName || r.routeId).join(', ')} hattında kullanılıyor. Uygulanınca o
            hat listeden çıkar, bu hat kalır (geri alınabilir).
          </span>
        </div>
      )}

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Tür</span>
          <select
            value={form.routeType}
            onChange={(e) => update({ routeType: Number(e.target.value) })}
            className={`${inputClass} cursor-pointer`}
          >
            {!ROUTE_TYPES.some((t) => t.value === form.routeType) && (
              <option value={form.routeType}>Tür {form.routeType}</option>
            )}
            {ROUTE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.value} · {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Ajans</span>
          <input
            value={form.agencyId}
            onChange={(e) => update({ agencyId: e.target.value })}
            className={`${inputClass} font-mono`}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Hat rengi" value={form.routeColor} onChange={setRouteColor} />
        <ColorField
          label="Yazı rengi"
          value={form.routeTextColor}
          onChange={(value) => {
            setTextColorTouched(true);
            update({ routeTextColor: value });
          }}
          action={
            <button
              type="button"
              disabled={!isColorValid}
              onClick={() => {
                setTextColorTouched(false);
                update({ routeTextColor: suggestTextColor(form.routeColor) });
              }}
              className="p-2 shrink-0 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              title="Hat rengine göre okunur yazı rengini öner"
            >
              <Wand2 className="w-4 h-4" />
            </button>
          }
        />
      </div>

      {contrast !== null && (
        <div className={`text-[13px] font-mono ${contrast < MIN_TEXT_CONTRAST ? 'text-amber-400' : 'text-slate-500'}`}>
          Kontrast {contrast.toFixed(1)}:1
          {contrast < MIN_TEXT_CONTRAST && ' · yazı zor okunur (en az 4.5:1 önerilir)'}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-sm text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white disabled:opacity-30 disabled:hover:bg-blue-600 cursor-pointer disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" />
          {mode === 'create' ? 'Hattı ekle' : 'Uygula'}
        </button>
      </div>
    </form>
  );
};
