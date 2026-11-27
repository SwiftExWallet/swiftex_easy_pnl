import type { StellarPnlDateRange, StellarPnlTimeframe } from "./types";

export const MAX_RANGE_DAYS = 90;
const DAY_MS = 86_400_000;

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function getTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(toUtcMidnight(date).getTime() + days * DAY_MS);
}

export function diffUtcDays(start: Date, end: Date): number {
  return Math.round((toUtcMidnight(end).getTime() - toUtcMidnight(start).getTime()) / DAY_MS);
}

export function toUtcIsoDate(date: Date): string {
  const d = toUtcMidnight(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formats a UTC date as DD/MM/YY for folioapi.swiftexwallet.com/pnl-public.
 */
export function toApiDateParam(date: Date): string {
  const d = toUtcMidnight(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Parses YYYY-MM-DD, DD/MM/YY, ISO timestamps, or Date instances into UTC midnight.
 * Returns null for invalid dates (including Feb 30, month 13, NaN, etc.).
 */
export function parseUtcDate(input: unknown): Date | null {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return toUtcMidnight(input);
  }
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return dt;
    }
    return null;
  }

  // DD/MM/YY
  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(trimmed);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = 2000 + Number(dmyMatch[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return dt;
    }
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return toUtcMidnight(parsed);
}

/**
 * Clamps any date range safely to:
 * 1. Valid UTC dates (falls back to last 30 days on invalid input)
 * 2. Not in the future (end <= today)
 * 3. Start <= End (swaps reversed ranges)
 * 4. Maximum span of 90 days (maxDays = 90)
 */
export function clampToMaxRange(
  startInput: unknown,
  endInput: unknown,
  maxDays: number = MAX_RANGE_DAYS,
  today: Date = getTodayUtc()
): StellarPnlDateRange {
  const safeToday = toUtcMidnight(today);
  let start = parseUtcDate(startInput);
  let end = parseUtcDate(endInput);

  if (!start && !end) {
    end = safeToday;
    start = addUtcDays(end, -(Math.min(30, maxDays) - 1));
  } else if (!start && end) {
    if (end.getTime() > safeToday.getTime()) end = safeToday;
    start = addUtcDays(end, -(Math.min(30, maxDays) - 1));
  } else if (start && !end) {
    if (start.getTime() > safeToday.getTime()) start = safeToday;
    end = safeToday;
  }

  // Both are non-null here
  let s = start!;
  let e = end!;

  if (s.getTime() > e.getTime()) {
    const tmp = s;
    s = e;
    e = tmp;
  }

  if (e.getTime() > safeToday.getTime()) {
    e = safeToday;
  }
  if (s.getTime() > safeToday.getTime()) {
    s = safeToday;
  }

  if (diffUtcDays(s, e) > maxDays) {
    s = addUtcDays(e, -maxDays);
  }

  return {
    startDate: toUtcIsoDate(s),
    endDate: toUtcIsoDate(e),
  };
}

export function validateDateRange(
  startInput: unknown,
  endInput: unknown,
  maxDays: number = MAX_RANGE_DAYS,
  today: Date = getTodayUtc()
): { valid: boolean; reason?: string; range: StellarPnlDateRange } {
  const safeToday = toUtcMidnight(today);
  const start = parseUtcDate(startInput);
  const end = parseUtcDate(endInput);

  if (!start || !end) {
    return {
      valid: false,
      reason: "Invalid start or end date; clamped to default range.",
      range: clampToMaxRange(startInput, endInput, maxDays, safeToday),
    };
  }

  if (start.getTime() > safeToday.getTime() || end.getTime() > safeToday.getTime()) {
    return {
      valid: false,
      reason: "Future dates are not allowed; clamped to today.",
      range: clampToMaxRange(start, end, maxDays, safeToday),
    };
  }

  const orderedStart = start.getTime() <= end.getTime() ? start : end;
  const orderedEnd = start.getTime() <= end.getTime() ? end : start;

  if (diffUtcDays(orderedStart, orderedEnd) > maxDays) {
    return {
      valid: false,
      reason: `Date range exceeds maximum of ${maxDays} days; clamped to ${maxDays} days.`,
      range: clampToMaxRange(orderedStart, orderedEnd, maxDays, safeToday),
    };
  }

  return {
    valid: true,
    range: {
      startDate: toUtcIsoDate(orderedStart),
      endDate: toUtcIsoDate(orderedEnd),
    },
  };
}

export function getPresetRange(
  timeframe: StellarPnlTimeframe,
  today: Date = getTodayUtc()
): StellarPnlDateRange {
  const safeToday = toUtcMidnight(today);
  const daysBack = timeframe === "7D" ? 6 : timeframe === "30D" ? 29 : 89;
  return {
    startDate: toUtcIsoDate(addUtcDays(safeToday, -daysBack)),
    endDate: toUtcIsoDate(safeToday),
  };
}

export function formatDisplayDateRange(startDate: string, endDate: string): string {
  const s = parseUtcDate(startDate);
  const e = parseUtcDate(endDate);
  if (!s || !e) return "Select range";
  const fmt = (d: Date) => `${MONTH_NAMES_SHORT[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
  if (toUtcIsoDate(s) === toUtcIsoDate(e)) {
    return fmt(s);
  }
  return `${fmt(s)} - ${fmt(e)}`;
}

