import { describe, expect, it } from "vitest";
import {
  formatPercentFromDecimal,
  formatTokenAmount,
  formatUsdFromDecimal,
  normalizeNumericInput,
  parseDecimalToScaledBigInt,
  scaledBigIntToDecimalString,
} from "../src/core/math";

describe("BigInt fixed-point math & formatting", () => {
  it("performs deterministic half-up rounding", () => {
    expect(formatUsdFromDecimal("1.005")).toBe("$1.01");
    expect(formatUsdFromDecimal("1.004")).toBe("$1.00");
    expect(formatUsdFromDecimal("-14.205")).toBe("-$14.21");
  });

  it("places negative sign before currency symbol", () => {
    expect(formatUsdFromDecimal("-14.2")).toBe("-$14.20");
    expect(formatUsdFromDecimal("-0.004")).toBe("$0.00");
  });

  it("never outputs scientific notation (1e-7 -> 0.0000001)", () => {
    expect(normalizeNumericInput("1e-7")).toBe("0.0000001");
    expect(formatTokenAmount("1e-7", 7)).toBe("0.0000001");
    const scaled = parseDecimalToScaledBigInt("0.0000001", 18)!;
    expect(scaledBigIntToDecimalString(scaled, 18, 7, true)).toBe("0.0000001");
  });

  it("handles extreme values beyond Number.MAX_SAFE_INTEGER without overflow", () => {
    const huge = "9007199254740993123.1234567";
    expect(formatTokenAmount(huge, 7)).toBe("9,007,199,254,740,993,123.1234567");
    expect(formatUsdFromDecimal(huge, 2)).toBe("$9,007,199,254,740,993,123.12");
  });

  it("returns safe fallback for invalid, NaN, Infinity, or null inputs", () => {
    expect(formatUsdFromDecimal(null)).toBe("—");
    expect(formatUsdFromDecimal(undefined)).toBe("—");
    expect(formatUsdFromDecimal(NaN)).toBe("—");
    expect(formatUsdFromDecimal(Infinity)).toBe("—");
    expect(formatUsdFromDecimal("not-a-number")).toBe("—");
    expect(formatPercentFromDecimal(null)).toBe("—");
  });
});

