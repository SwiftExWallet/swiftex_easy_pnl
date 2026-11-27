import { clampToMaxRange, getPresetRange, parseUtcDate, toApiDateParam } from "./date";
import { normalizeNumericInput, parseDecimalToScaledBigInt, scaledBigIntToDecimalString, addScaled } from "./math";
import type {
  GetPnlParams,
  StellarPnlAutoCostBasisEntry,
  StellarPnlChartPoint,
  StellarPnlClientOptions,
  StellarPnlDisposal,
  StellarPnlPosition,
  StellarPnlResponse,
  StellarPnlTrade,
} from "./types";
import { isValidStellarAddress } from "./validation";

export const DEFAULT_PNL_API_URL = "https://folioapi.swiftexwallet.com/pnl-public";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_CACHE_TTL_MS = 30_000;

export class StellarPnlError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string = "PNL_ERROR", status?: number) {
    super(message);
    this.name = "StellarPnlError";
    this.code = code;
    this.status = status;
  }
}

export class StellarPnlValidationError extends StellarPnlError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "StellarPnlValidationError";
  }
}

export class StellarPnlRateLimitError extends StellarPnlError {
  constructor(message: string = "Rate limit exceeded (429). Please wait a moment and retry.") {
    super(message, "RATE_LIMIT", 429);
    this.name = "StellarPnlRateLimitError";
  }
}

export class StellarPnlTimeoutError extends StellarPnlError {
  constructor(message: string = "Request timed out while fetching Stellar PnL data.") {
    super(message, "TIMEOUT");
    this.name = "StellarPnlTimeoutError";
  }
}

export class StellarPnlNetworkError extends StellarPnlError {
  constructor(message: string = "Network error while contacting Stellar PnL API.", status?: number) {
    super(message, "NETWORK_ERROR", status);
    this.name = "StellarPnlNetworkError";
  }
}

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, unknown>) : {};
}

function asString(val: unknown, fallback: string = ""): string {
  return typeof val === "string" ? val : fallback;
}

function asNullableString(val: unknown): string | null {
  return typeof val === "string" && val.trim() !== "" ? val : null;
}

function asSafeInt(val: unknown, fallback: number = 0): number {
  if (typeof val === "number" && Number.isFinite(val)) return Math.trunc(val);
  if (typeof val === "string") {
    const n = Number(val.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((item): item is string => typeof item === "string");
}

function normDec(val: unknown, fallback: string = "0"): string {
  return normalizeNumericInput(val) ?? fallback;
}

function normNullableDec(val: unknown): string | null {
  return normalizeNumericInput(val);
}

function extractLeadingDecimal(str: string): string {
  const match = /^[^\d+-]*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(str.trim());
  return match?.[1] ? (normalizeNumericInput(match[1]) ?? "0") : "0";
}

function normalizeTrade(raw: unknown): StellarPnlTrade {
  const r = asRecord(raw);
  const amountStr = asString(r.amount);
  const priceStr = asString(r.price);
  const usdcStr = asString(r.usdc);
  const typeStr = asString(r.type, "BUY").toUpperCase();
  const actionStr = asString(r.action);

  const inferredAsset =
    asString(r.asset) ||
    actionStr.replace(/^(BUY|SELL)\s+/i, "").trim() ||
    amountStr.replace(/^[+-]?\d+(?:\.\d+)?\s*/, "").trim() ||
    "XLM";

  const quantity = normDec(r.quantity, extractLeadingDecimal(amountStr));
  const priceUsd = normDec(r.priceUsd, extractLeadingDecimal(priceStr));
  const grossUsd = normDec(r.usdcValue ?? r.grossValue, extractLeadingDecimal(usdcStr));
  const pnlNum = normDec(r.pnlNum ?? r.realizedPnl, extractLeadingDecimal(asString(r.pnl)));
  const feeUsd = normDec(r.feeUsd ?? r.fee, "0");

  // Derive cost basis if not explicitly provided: for SELL, gross - realizedPnL; for BUY, gross
  let costBasisUsd = normNullableDec(r.costBasisUsd ?? r.costBasis);
  if (costBasisUsd === null) {
    const gScaled = parseDecimalToScaledBigInt(grossUsd, 18) ?? 0n;
    const pScaled = parseDecimalToScaledBigInt(pnlNum, 18) ?? 0n;
    const cbScaled = typeStr === "SELL" ? gScaled - pScaled : gScaled;
    costBasisUsd = scaledBigIntToDecimalString(cbScaled < 0n ? 0n : cbScaled, 18, 7, true);
  }

  return {
    date: asString(r.date),
    txHash: asString(r.txHash ?? r.hash ?? r.id),
    type: typeStr,
    action: actionStr || `${typeStr} ${inferredAsset}`,
    asset: inferredAsset,
    amount: amountStr || `${quantity} ${inferredAsset}`,
    quantity,
    price: priceStr || `$${priceUsd}`,
    priceUsd,
    usdc: usdcStr || `$${grossUsd}`,
    costBasisUsd,
    feeUsd,
    pnl: asString(r.pnl),
    pnlNum,
    source: asString(r.source, "unknown"),
  };
}

function normalizePosition(raw: unknown): StellarPnlPosition {
  const r = asRecord(raw);
  return {
    asset: asString(r.asset, "UNKNOWN"),
    issuer: asString(r.issuer),
    totalBought: normDec(r.totalBought, "0"),
    totalSold: normDec(r.totalSold, "0"),
    remaining: normDec(r.remaining, "0"),
    avgCost: normDec(r.avgCost, "0"),
    currentPrice: normNullableDec(r.currentPrice),
    priceSource: asNullableString(r.priceSource),
    unrealized: normNullableDec(r.unrealized),
    currentValue: normNullableDec(r.currentValue),
    illiquidWarning: Boolean(r.illiquidWarning),
    realizedPnL: normDec(r.realizedPnL, "0"),
  };
}

function normalizeDisposal(raw: unknown): StellarPnlDisposal {
  const r = asRecord(raw);
  return {
    date: asString(r.date),
    asset: asString(r.asset, "UNKNOWN"),
    issuer: asString(r.issuer),
    amount: normDec(r.amount, "0"),
    proceeds: normDec(r.proceeds, "0"),
    pnl: normDec(r.pnl, "0"),
    costBasisUnknown: Boolean(r.costBasisUnknown),
  };
}

function normalizeChartPoint(raw: unknown): StellarPnlChartPoint | null {
  const r = asRecord(raw);
  const date = asString(r.date);
  if (!date) return null;
  return {
    date,
    realizedPnl: normDec(r.realizedPnl, "0"),
    holdingsValue: normDec(r.holdingsValue, "0"),
  };
}

/**
 * Strictly normalizes any raw API payload into a safe, crash-proof StellarPnlResponse.
 */
export function normalizePnlResponse(
  raw: unknown,
  fallbackAddress: string,
  startDate: string,
  endDate: string
): StellarPnlResponse {
  const r = asRecord(raw);
  const excluded = asRecord(r.excludedTrades);
  const rawAuto = asRecord(r.autoCostBasis);
  const autoCostBasis: Record<string, StellarPnlAutoCostBasisEntry> = {};

  for (const [key, entryRaw] of Object.entries(rawAuto)) {
    const e = asRecord(entryRaw);
    autoCostBasis[key] = {
      asset: asString(e.asset, key),
      issuer: asString(e.issuer),
      price: normNullableDec(e.price),
      date: asString(e.date),
      amount: normDec(e.amount, "0"),
      source: asString(e.source),
    };
  }

  const trades = Array.isArray(r.trades) ? r.trades.map(normalizeTrade) : [];
  const positions = Array.isArray(r.positions) ? r.positions.map(normalizePosition) : [];
  const disposals = Array.isArray(r.disposals) ? r.disposals.map(normalizeDisposal) : [];

  const rawChart = asRecord(r.chart);
  const points = Array.isArray(rawChart.points)
    ? rawChart.points.map(normalizeChartPoint).filter((p): p is StellarPnlChartPoint => p !== null)
    : [];

  let totalFeesScaled = 0n;
  for (const t of trades) {
    const f = parseDecimalToScaledBigInt(t.feeUsd, 18);
    if (f !== null) totalFeesScaled = addScaled(totalFeesScaled, f);
  }
  const totalFees = normNullableDec(r.totalFees) ?? scaledBigIntToDecimalString(totalFeesScaled, 18, 7, true);

  const rawBest = asRecord(r.bestTrade);
  const bestTrade =
    r.bestTrade && typeof r.bestTrade === "object" && asString(rawBest.date)
      ? {
          date: asString(rawBest.date),
          asset: asString(rawBest.asset),
          pnl: normDec(rawBest.pnl, "0"),
        }
      : null;

  const rawWorst = asRecord(r.worstTrade);
  const worstTrade =
    r.worstTrade && typeof r.worstTrade === "object" && asString(rawWorst.date)
      ? {
          date: asString(rawWorst.date),
          asset: asString(rawWorst.asset),
          pnl: normDec(rawWorst.pnl, "0"),
        }
      : null;

  const rawLargest = asRecord(r.largestPosition);
  const largestPosition =
    r.largestPosition && typeof r.largestPosition === "object" && asString(rawLargest.asset)
      ? {
          asset: asString(rawLargest.asset),
          issuer: asString(rawLargest.issuer),
          remaining: normDec(rawLargest.remaining, "0"),
          currentValue: normNullableDec(rawLargest.currentValue),
        }
      : null;

  return {
    address: asString(r.address, fallbackAddress),
    startDate,
    endDate,
    rawCount: asSafeInt(r.rawCount, trades.length),
    collapsedCount: asSafeInt(r.collapsedCount, trades.length),
    skippedCount: asSafeInt(r.skippedCount, 0),
    filteredCount: asSafeInt(r.filteredCount, 0),
    noPriceCount: asSafeInt(r.noPriceCount, 0),
    unpricedAssets: asStringArray(r.unpricedAssets),
    scamCount: asSafeInt(r.scamCount, 0),
    possiblyScam: asStringArray(r.possiblyScam),
    excludedTrades: {
      scam: asSafeInt(excluded.scam, 0),
      filtered: asSafeInt(excluded.filtered, 0),
    },
    lowLiquidityAssets: asStringArray(r.lowLiquidityAssets),
    illiquidPositions: asStringArray(r.illiquidPositions),
    costBasisWarning: Boolean(r.costBasisWarning),
    autoCostBasis,
    usdcSpent: normDec(r.usdcSpent, "0"),
    usdcReceived: normDec(r.usdcReceived, "0"),
    netUSDCFlow: normDec(r.netUSDCFlow, "0"),
    totalRealized: normDec(r.totalRealized, "0"),
    totalUnrealized: normNullableDec(r.totalUnrealized),
    totalPnL: normDec(r.totalPnL, "0"),
    totalFees,
    winRate: normNullableDec(r.winRate),
    bestTrade,
    worstTrade,
    firstTradeDate: asNullableString(r.firstTradeDate),
    lastTradeDate: asNullableString(r.lastTradeDate),
    activeDays: asSafeInt(r.activeDays, 0),
    mostTradedAsset: asNullableString(r.mostTradedAsset),
    totalPortfolioValue: normNullableDec(r.totalPortfolioValue),
    totalCostBasis: normDec(r.totalCostBasis, "0"),
    openPnLPct: normNullableDec(r.openPnLPct),
    largestPosition,
    tradeCount: asSafeInt(r.tradeCount, trades.length),
    positionCount: asSafeInt(r.positionCount, positions.length),
    disposalCount: asSafeInt(r.disposalCount, disposals.length),
    trades,
    positions,
    disposals,
    chart: {
      from: asString(rawChart.from, startDate),
      to: asString(rawChart.to, endDate),
      granularity: asString(rawChart.granularity, "day"),
      points,
    },
  };
}

interface CacheEntry {
  expiresAt: number;
  data: StellarPnlResponse;
}

export class StellarPnlClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly retryOnRateLimit: boolean;
  private readonly rateLimitRetryDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: StellarPnlClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_PNL_API_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.retryOnRateLimit = options.retryOnRateLimit ?? true;
    this.rateLimitRetryDelayMs = options.rateLimitRetryDelayMs ?? 1500;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async getPnl(params: GetPnlParams): Promise<StellarPnlResponse> {
    const trimmedAddress = typeof params.address === "string" ? params.address.trim() : "";
    if (!isValidStellarAddress(trimmedAddress)) {
      throw new StellarPnlValidationError(
        "Invalid Stellar public key. Address must be 56 characters starting with 'G' (Base32 A-Z, 2-7)."
      );
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new StellarPnlNetworkError("You appear to be offline. Please check your internet connection.");
    }

    const range =
      params.startDate || params.endDate
        ? clampToMaxRange(params.startDate, params.endDate)
        : getPresetRange(params.timeframe ?? "30D");

    const summaryFlag = params.summary ?? false;
    const cacheKey = `${trimmedAddress}|${range.startDate}|${range.endDate}|${summaryFlag}`;

    if (!params.nocache && this.cacheTtlMs > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    const startDt = parseUtcDate(range.startDate)!;
    const endDt = parseUtcDate(range.endDate)!;

    const url = new URL(this.baseUrl);
    url.searchParams.set("address", trimmedAddress);
    url.searchParams.set("from", toApiDateParam(startDt));
    url.searchParams.set("to", toApiDateParam(endDt));
    url.searchParams.set("summary", String(summaryFlag));
    url.searchParams.set("excel", "false");
    if (params.nocache) {
      url.searchParams.set("nocache", "true");
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (params.signal) {
      if (params.signal.aborted) {
        clearTimeout(timer);
        controller.abort();
      } else {
        params.signal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    try {
      let response = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (response.status === 429 && this.retryOnRateLimit) {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(waitTimer);
            const abortErr = new Error("Aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          };
          const waitTimer = setTimeout(() => {
            controller.signal.removeEventListener("abort", onAbort);
            resolve();
          }, this.rateLimitRetryDelayMs);
          if (controller.signal.aborted) {
            onAbort();
          } else {
            controller.signal.addEventListener("abort", onAbort, { once: true });
          }
        });

        response = await this.fetchImpl(url.toString(), {
          method: "GET",
          headers,
          signal: controller.signal,
        });
      }

      if (response.status === 429) {
        throw new StellarPnlRateLimitError();
      }

      const rawText = await response.text();
      if (!response.ok) {
        throw new StellarPnlNetworkError(
          `Stellar PnL API returned HTTP ${response.status}.`,
          response.status
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new StellarPnlNetworkError(
          "Stellar PnL API returned a non-JSON response.",
          response.status
        );
      }

      const normalized = normalizePnlResponse(parsed, trimmedAddress, range.startDate, range.endDate);
      if (this.cacheTtlMs > 0) {
        this.cache.set(cacheKey, {
          expiresAt: Date.now() + this.cacheTtlMs,
          data: normalized,
        });
      }
      return normalized;
    } catch (err: unknown) {
      if (err instanceof StellarPnlError) {
        throw err;
      }
      if (timedOut) {
        throw new StellarPnlTimeoutError();
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      const message = err instanceof Error ? err.message : "Failed to fetch Stellar PnL data.";
      throw new StellarPnlNetworkError(message);
    } finally {
      clearTimeout(timer);
      if (params.signal) {
        params.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }
}

