import { describe, expect, it } from "vitest";
import {
  MAX_RANGE_DAYS,
  clampToMaxRange,
  getPresetRange,
  parseUtcDate,
  toApiDateParam,
  validateDateRange,
} from "../src/core/date";

describe("date & calendar utilities", () => {
  const today = new Date(Date.UTC(2026, 10, 27)); // 2026-11-27

  it("enforces 90-day maximum range", () => {
    const res = validateDateRange("2026-01-01", "2026-11-27", MAX_RANGE_DAYS, today);
    expect(res.valid).toBe(false);
    expect(res.range).toEqual({
      startDate: "2026-08-29",
      endDate: "2026-11-27",
    });
  });

  it("automatically swaps reversed start and end dates", () => {
    const clamped = clampToMaxRange("2026-11-20", "2026-11-01", MAX_RANGE_DAYS, today);
    expect(clamped).toEqual({
      startDate: "2026-11-01",
      endDate: "2026-11-20",
    });
  });

  it("supports same-day selection cleanly", () => {
    const res = validateDateRange("2026-11-15", "2026-11-15", MAX_RANGE_DAYS, today);
    expect(res.valid).toBe(true);
    expect(res.range).toEqual({
      startDate: "2026-11-15",
      endDate: "2026-11-15",
    });
  });

  it("blocks and clamps future dates to today", () => {
    const res = validateDateRange("2026-11-20", "2026-12-15", MAX_RANGE_DAYS, today);
    expect(res.valid).toBe(false);
    expect(res.range.endDate).toBe("2026-11-27");
  });

  it("handles leap years and month-end boundaries without off-by-one shifts", () => {
    const leap = parseUtcDate("2024-02-29");
    expect(leap).not.toBeNull();
    expect(toApiDateParam(leap!)).toBe("29/02/24");

    // Invalid calendar date (Feb 30) returns null and clamps safely
    expect(parseUtcDate("2026-02-30")).toBeNull();
    const safe = clampToMaxRange("2026-02-30", "2026-11-27", MAX_RANGE_DAYS, today);
    expect(safe).toEqual({
      startDate: "2026-10-29",
      endDate: "2026-11-27",
    });

    // Jan 31 -> Apr 30 is 89 days in non-leap year 2026 (within 90-day cap)
    const apr30 = new Date(Date.UTC(2026, 3, 30));
    const janToApr = validateDateRange("2026-01-31", "2026-04-30", MAX_RANGE_DAYS, apr30);
    expect(janToApr.valid).toBe(true);
    expect(janToApr.range).toEqual({
      startDate: "2026-01-31",
      endDate: "2026-04-30",
    });
  });

  it("computes 7D, 30D, and 90D presets accurately", () => {
    expect(getPresetRange("7D", today)).toEqual({
      startDate: "2026-11-21",
      endDate: "2026-11-27",
    });
    expect(getPresetRange("30D", today)).toEqual({
      startDate: "2026-10-29",
      endDate: "2026-11-27",
    });
    expect(getPresetRange("90D", today)).toEqual({
      startDate: "2026-08-30",
      endDate: "2026-11-27",
    });
  });
});

