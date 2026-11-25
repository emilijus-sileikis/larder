import type { Language } from '@/i18n/translations';

const DAY_SHORT: Record<Language, string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  lt: ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'],
};

const DAY_FULL: Record<Language, string[]> = {
  en: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  lt: [
    'Pirmadienis',
    'Antradienis',
    'Trečiadienis',
    'Ketvirtadienis',
    'Penktadienis',
    'Šeštadienis',
    'Sekmadienis',
  ],
};

const MONTH_SHORT: Record<Language, string[]> = {
  en: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  lt: [
    'Saus.',
    'Vas.',
    'Kov.',
    'Bal.',
    'Geg.',
    'Birž.',
    'Liep.',
    'Rugp.',
    'Rugs.',
    'Spal.',
    'Lapkr.',
    'Gruod.',
  ],
};

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
}

export function getTodayIso(): string {
  return toIsoDate(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const dt = parseIsoDate(iso) ?? new Date();
  dt.setDate(dt.getDate() + days);
  return toIsoDate(dt);
}

/**
 * Returns the ISO date of Monday for the week containing `date`.
 */
export function getWeekStartIso(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jsDay = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diffToMonday);
  return toIsoDate(d);
}

export function shiftWeekIso(weekStartIso: string, weekDelta: number): string {
  return addDaysIso(weekStartIso, weekDelta * 7);
}

export function formatWeekRange(weekStartIso: string, lang: Language = 'en'): string {
  const start = parseIsoDate(weekStartIso);
  if (!start) return weekStartIso;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const months = MONTH_SHORT[lang];
  const startMonth = months[start.getMonth()];
  const endMonth = months[end.getMonth()];
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}–${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
}

export function getDayLabel(
  weekStartIso: string,
  dayIndex: number,
  lang: Language = 'en'
): {
  shortName: string;
  fullName: string;
  dateLabel: string;
  iso: string;
  isToday: boolean;
} {
  const iso = addDaysIso(weekStartIso, dayIndex);
  const dt = parseIsoDate(iso) ?? new Date();
  const safeIdx = Math.max(0, Math.min(6, dayIndex));
  return {
    shortName: DAY_SHORT[lang][safeIdx],
    fullName: DAY_FULL[lang][safeIdx],
    dateLabel: `${MONTH_SHORT[lang][dt.getMonth()]} ${dt.getDate()}`,
    iso,
    isToday: iso === getTodayIso(),
  };
}

/**
 * Whole days from today until `expiresAt` (YYYY-MM-DD).
 * Negative = already expired, 0 = today, 1..3 = expiring soon.
 */
export function getDaysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const target = parseIsoDate(expiresAt);
  if (!target) return null;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - todayMidnight.getTime();
  return Math.round(diffMs / 86_400_000);
}

export function isExpiringSoon(expiresAt: string | null, windowDays = 3): boolean {
  const days = getDaysUntilExpiry(expiresAt);
  return days !== null && days <= windowDays;
}

export function formatExpiryLabel(
  expiresAt: string | null,
  lang: Language = 'en'
): string | null {
  const days = getDaysUntilExpiry(expiresAt);
  if (days === null) return null;
  if (lang === 'lt') {
    if (days < 0) return `Pasibaigė prieš ${Math.abs(days)} d.`;
    if (days === 0) return 'Baigiasi šiandien';
    if (days === 1) return 'Baigiasi rytoj';
    if (days <= 3) return `Liko ${days} d.`;
    const dt = parseIsoDate(expiresAt!);
    if (!dt) return expiresAt;
    return `Iki ${MONTH_SHORT.lt[dt.getMonth()]} ${dt.getDate()}`;
  }

  if (days < 0) {
    const abs = Math.abs(days);
    return abs === 1 ? 'Expired 1d ago' : `Expired ${abs}d ago`;
  }
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days <= 3) return `Expires in ${days}d`;
  const dt = parseIsoDate(expiresAt!);
  if (!dt) return expiresAt;
  return `Exp ${MONTH_SHORT.en[dt.getMonth()]} ${dt.getDate()}`;
}
