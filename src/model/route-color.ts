/**
 * Hat renkleri: biçim, okunabilirlik (kontrast) ve kod grubuna göre ton dağıtımı.
 *
 * Renkler backend'de `#` olmadan, 6 haneli onaltılık tutulur. Yeni yazılan renkler büyük harfle yazılır
 * (`9696C0`); mevcut değerlere (ör. `9696c0`) kullanıcı değiştirmedikçe dokunulmaz.
 */

const HEX_PATTERN = /^[0-9A-F]{6}$/;

/** Girilen rengi `9696C0` biçimine getirir; geçersizse null. `#` ve 3 haneli yazım (`F80`) kabul edilir. */
export function normalizeHexColor(input: string): string | null {
  let hex = input.trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) hex = [...hex].map((c) => c + c).join('');
  return HEX_PATTERN.test(hex) ? hex : null;
}

/** Saklanan rengi CSS rengine çevirir (`#9696c0`); geçersizse `fallback`. */
export function toCssColor(color: string | undefined | null, fallback: string): string {
  const hex = color ? normalizeHexColor(color) : null;
  return hex ? `#${hex}` : fallback;
}

export const DEFAULT_ROUTE_COLOR = '#2563eb';
export const DEFAULT_ROUTE_TEXT_COLOR = '#ffffff';

// ---- Kontrast (WCAG 2.x) ----

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** İki rengin kontrast oranı (1–21). Geçersiz renkte null. */
export function contrastRatio(a: string, b: string): number | null {
  const ha = normalizeHexColor(a);
  const hb = normalizeHexColor(b);
  if (!ha || !hb) return null;
  const la = luminance(ha);
  const lb = luminance(hb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Normal metin için WCAG AA eşiği. */
export const MIN_TEXT_CONTRAST = 4.5;

/** Hat rengi üzerinde daha okunur olan yazı rengi: beyaz ya da siyah. */
export function suggestTextColor(background: string): string {
  const white = contrastRatio(background, 'FFFFFF') ?? 0;
  const black = contrastRatio(background, '000000') ?? 0;
  return white >= black ? 'FFFFFF' : '000000';
}

// ---- HSL ----

function hexToHsl(hex: string): [number, number, number] {
  const n = Number.parseInt(hex, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Üzerine gelinen çizgi için aynı tonun açığı. */
export function lightenColor(color: string, amount = 0.15): string {
  const hex = normalizeHexColor(color);
  if (!hex) return color;
  const [h, s, l] = hexToHsl(hex);
  return `#${hslToHex(h, s, Math.min(0.85, l + amount))}`;
}

/** Rengin koyu tonu (aynı ton, düşük açıklık). Hat çizgisinin kenarlığında kullanılır. */
export function darkenColor(color: string, amount = 0.2): string {
  const hex = normalizeHexColor(color);
  if (!hex) return color;
  const [h, s, l] = hexToHsl(hex);
  return `#${hslToHex(h, s, Math.max(0.08, l - amount))}`;
}

// ---- Kod grupları ----

/**
 * Hat kodu önekine göre grupların ana rengi. Gruplar ton (hue) ile ayrılır; grup içindeki hatlar aynı tonun
 * açıklık kademeleriyle. En kalabalık gruplar (M, G, K) birbirinden en uzak tonlardadır.
 */
export const ROUTE_COLOR_GROUPS: Readonly<Record<string, string>> = {
  M: 'D32F2F', // Kırmızı
  G: '2E9D4F', // Yeşil
  K: '1F6FD1', // Mavi
  B: '7B3FC4', // Mor
  D: 'F28C1B', // Turuncu
  NA: '0FA3A3', // Turkuaz
  NAO: 'D63A8A', // Pembe
  T: '8D5A2B', // Kahverengi
  A: 'C9A400', // Hardal
  '16': '7CB518', // Limon yeşili
};

/** Grupların gösterim sırası (nesne anahtarlarında `16` gibi sayısal anahtarlar hep başa geçer). */
export const ROUTE_COLOR_GROUP_ORDER: readonly string[] = ['M', 'G', 'K', 'B', 'D', 'NA', 'NAO', 'T', 'A', '16'];

/** Kademelerin açıklık aralığı: 1 numara en koyu. Gri harita üzerinde kaybolmayacak, siyaha yaklaşmayacak. */
const TONE_LIGHTNESS_MIN = 0.3;
const TONE_LIGHTNESS_MAX = 0.62;

/**
 * Hat kodunun grubu ve numarası. Harfle başlayan kodda grup baştaki harflerdir (G4/A -> G, 4; NAO -> NAO, yok;
 * T-G -> T, yok); rakamla başlayanda baştaki sayıdır (16/A -> 16, yok). Grup tablosunda yoksa null.
 */
export function parseRouteCode(code: string): { group: string; number: number | null } | null {
  const trimmed = code.trim().toLocaleUpperCase('tr');
  const letters = /^\p{L}+/u.exec(trimmed)?.[0];
  if (letters) {
    if (!(letters in ROUTE_COLOR_GROUPS)) return null;
    const digits = /^\d+/.exec(trimmed.slice(letters.length))?.[0];
    return { group: letters, number: digits ? Number(digits) : null };
  }
  const digits = /^\d+/.exec(trimmed)?.[0];
  if (digits && digits in ROUTE_COLOR_GROUPS) return { group: digits, number: null };
  return null;
}

export function routeColorGroup(code: string): string | null {
  return parseRouteCode(code)?.group ?? null;
}

/**
 * Gruptaki hatlara ton dağıtır. Gruptaki farklı numara sayısı kadar kademe oluşur ve numara sırasıyla
 * koyudan açığa dağıtılır; kollar (G4/A, G4/B) numarasının tonunu paylaşır, numarasız kodlar en sona.
 * Tek kademe varsa ana renk kullanılır. Yazı rengi her ton için önerilir.
 */
export function distributeGroupColors(
  group: string,
  routes: readonly { routeId: string; routeShortName: string }[]
): Map<string, { routeColor: string; routeTextColor: string }> {
  const base = ROUTE_COLOR_GROUPS[group];
  const result = new Map<string, { routeColor: string; routeTextColor: string }>();
  if (!base) return result;

  const members = routes
    .map((r) => ({ routeId: r.routeId, parsed: parseRouteCode(r.routeShortName) }))
    .filter((m) => m.parsed?.group === group);

  // Numara tipleri: artan sayılar, numarasızlar en sonda tek tip
  const numbers = [...new Set(members.map((m) => m.parsed?.number ?? Number.POSITIVE_INFINITY))].sort(
    (a, b) => a - b
  );
  const [h, s] = hexToHsl(base);

  const toneOf = (number: number): string => {
    if (numbers.length <= 1) return base;
    const t = numbers.indexOf(number) / (numbers.length - 1);
    return hslToHex(h, s, TONE_LIGHTNESS_MIN + t * (TONE_LIGHTNESS_MAX - TONE_LIGHTNESS_MIN));
  };

  for (const m of members) {
    const routeColor = toneOf(m.parsed?.number ?? Number.POSITIVE_INFINITY);
    result.set(m.routeId, { routeColor, routeTextColor: suggestTextColor(routeColor) });
  }
  return result;
}
