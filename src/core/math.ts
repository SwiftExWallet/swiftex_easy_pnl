const DEFAULT_SCALE = 18;

function pow10(exp: number): bigint {
  return 10n ** BigInt(exp);
}

/**
 * Normalizes any numeric string (including scientific notation like "1e-7")
 * into a fixed-point decimal string without floating-point drift.
 */
export function normalizeNumericInput(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    // Convert finite number to string; handle scientific notation below
    return normalizeNumericInput(String(input));
  }
  if (typeof input !== "string") return null;

  const trimmed = input.trim().replace(/[$,\s]/g, "");
  if (!trimmed) return null;

  const match = /^([+-])?(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(trimmed);
  if (!match) return null;

  const sign = match[1] === "-" ? "-" : "";
  const mantissa = match[2] ?? "";
  const exp = match[3] ? parseInt(match[3], 10) : 0;
  if (!Number.isFinite(exp)) return null;

  const dotIdx = mantissa.indexOf(".");
  const rawDigits = (dotIdx === -1 ? mantissa : mantissa.slice(0, dotIdx) + mantissa.slice(dotIdx + 1)).replace(/^0+/, "") || "0";
  if (rawDigits === "0") return "0";

  const fracLen = dotIdx === -1 ? 0 : mantissa.length - dotIdx - 1;
  const shift = exp - fracLen;

  let result: string;
  if (shift >= 0) {
    result = rawDigits + "0".repeat(shift);
  } else {
    const pos = rawDigits.length + shift;
    if (pos > 0) {
      result = rawDigits.slice(0, pos) + "." + rawDigits.slice(pos);
    } else {
      result = "0." + "0".repeat(-pos) + rawDigits;
    }
  }

  if (result.includes(".")) {
    result = result.replace(/\.?0+$/, "");
  }
  return result === "0" ? "0" : sign + result;
}

/**
 * Parses a decimal string or finite number into a BigInt scaled by 10^scale.
 * Splits on "." directly without passing through parseFloat.
 */
export function parseDecimalToScaledBigInt(input: unknown, scale: number = DEFAULT_SCALE): bigint | null {
  const normalized = normalizeNumericInput(input);
  if (normalized === null) return null;

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw || "0";

  let scaledStr: string;
  if (fracPartRaw.length <= scale) {
    scaledStr = intPart + fracPartRaw.padEnd(scale, "0");
  } else {
    // Round half-up at the scale boundary
    const kept = fracPartRaw.slice(0, scale);
    const nextDigit = Number(fracPartRaw[scale] ?? "0");
    let base = BigInt(intPart + kept);
    if (nextDigit >= 5) {
      base += 1n;
    }
    return negative && base !== 0n ? -base : base;
  }

  const value = BigInt(scaledStr);
  return negative && value !== 0n ? -value : value;
}

/**
 * Converts a scaled BigInt back into a fixed-point decimal string with
 * deterministic half-up rounding and zero scientific notation.
 */
export function scaledBigIntToDecimalString(
  value: bigint,
  scale: number = DEFAULT_SCALE,
  decimals: number = 7,
  trimTrailingZeros: boolean = false
): string {
  const negative = value < 0n;
  let absVal = negative ? -value : value;

  if (decimals < scale) {
    const drop = scale - decimals;
    const divisor = pow10(drop);
    const rem = absVal % divisor;
    const half = divisor / 2n;
    absVal = absVal / divisor;
    if (rem >= half) {
      absVal += 1n;
    }
  } else if (decimals > scale) {
    absVal = absVal * pow10(decimals - scale);
  }

  const factor = pow10(decimals);
  const intPart = absVal / factor;
  const fracPart = decimals > 0 ? (absVal % factor).toString().padStart(decimals, "0") : "";

  let out = decimals > 0 ? `${intPart.toString()}.${fracPart}` : intPart.toString();
  if (trimTrailingZeros && decimals > 0) {
    out = out.replace(/\.?0+$/, "");
  }

  if (absVal === 0n) return out;
  return negative ? `-${out}` : out;
}

export function addScaled(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subScaled(a: bigint, b: bigint): bigint {
  return a - b;
}

export function mulScaled(a: bigint, b: bigint, scale: number = DEFAULT_SCALE): bigint {
  const factor = pow10(scale);
  const prod = a * b;
  const negative = prod < 0n;
  const absProd = negative ? -prod : prod;
  let q = absProd / factor;
  if (absProd % factor >= factor / 2n) {
    q += 1n;
  }
  return negative && q !== 0n ? -q : q;
}

export function divScaled(a: bigint, b: bigint, scale: number = DEFAULT_SCALE): bigint | null {
  if (b === 0n) return null;
  const factor = pow10(scale);
  const negative = (a < 0n) !== (b < 0n);
  const absA = (a < 0n ? -a : a) * factor;
  const absB = b < 0n ? -b : b;
  let q = absA / absB;
  if ((absA % absB) * 2n >= absB) {
    q += 1n;
  }
  return negative && q !== 0n ? -q : q;
}

function addGroupingCommas(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Formats a USD amount with deterministic half-up rounding, comma grouping,
 * and negative sign placed before "$": "-$14.20". Returns "—" if invalid.
 */
export function formatUsdFromDecimal(input: unknown, decimals: number = 2): string {
  const scaled = parseDecimalToScaledBigInt(input, DEFAULT_SCALE);
  if (scaled === null) return "—";

  const str = scaledBigIntToDecimalString(scaled, DEFAULT_SCALE, decimals, false);
  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [intPart = "0", fracPart] = unsigned.split(".");
  const grouped = fracPart !== undefined ? `${addGroupingCommas(intPart)}.${fracPart}` : addGroupingCommas(intPart);
  return negative ? `-$${grouped}` : `$${grouped}`;
}

/**
 * Formats a percentage value (e.g. "1.03" -> "1.03%", "-100" -> "-100.00%").
 */
export function formatPercentFromDecimal(input: unknown, decimals: number = 2, showPlus: boolean = false): string {
  const scaled = parseDecimalToScaledBigInt(input, DEFAULT_SCALE);
  if (scaled === null) return "—";

  const str = scaledBigIntToDecimalString(scaled, DEFAULT_SCALE, decimals, false);
  if (showPlus && scaled > 0n) {
    return `+${str}%`;
  }
  return `${str}%`;
}

/**
 * Formats a token quantity up to maxDecimals (default 7 for Stellar),
 * trimming trailing zeros and never producing scientific notation.
 */
export function formatTokenAmount(input: unknown, maxDecimals: number = 7): string {
  const scaled = parseDecimalToScaledBigInt(input, DEFAULT_SCALE);
  if (scaled === null) return "—";

  const str = scaledBigIntToDecimalString(scaled, DEFAULT_SCALE, maxDecimals, true);
  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [intPart = "0", fracPart] = unsigned.split(".");
  const grouped = fracPart !== undefined ? `${addGroupingCommas(intPart)}.${fracPart}` : addGroupingCommas(intPart);
  return negative ? `-${grouped}` : grouped;
}

/**
 * Converts a decimal value to a finite JS Number ONLY for final chart/Excel cell writes.
 */
export function toSafeNumber(input: unknown, fallback: number = 0): number {
  const normalized = normalizeNumericInput(input);
  if (normalized === null) return fallback;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}
