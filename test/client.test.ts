import { describe, expect, it, vi } from "vitest";
import {
  StellarPnlClient,
  StellarPnlNetworkError,
  StellarPnlRateLimitError,
  StellarPnlValidationError,
  normalizePnlResponse,
} from "../src/core/client";
import { SUPPORTED_CHAINS, buildSwapUrl } from "../src/core/legacy";
import { isValidStellarAddress } from "../src/core/validation";

const VALID_ADDR = "GBWVIPN7JDCG7TABH4RRNJ7DEEBTFNHZP63BLRPDUMHNKITKYEGQEOC5";

describe("StellarPnlClient, guards & normalizer", () => {
  it("validates Stellar G... Base32 addresses before hitting API", async () => {
    expect(isValidStellarAddress(VALID_ADDR)).toBe(true);
    expect(isValidStellarAddress("INVALID")).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);

    const fetchMock = vi.fn();
    const client = new StellarPnlClient({ fetchImpl: fetchMock as unknown as typeof fetch });

    await expect(client.getPnl({ address: "BAD_ADDRESS" })).rejects.toBeInstanceOf(
      StellarPnlValidationError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches successful responses for 30s and bypasses when nocache=true", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ address: VALID_ADDR, totalPnL: "12.5" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new StellarPnlClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      cacheTtlMs: 30_000,
    });

    const first = await client.getPnl({ address: VALID_ADDR, timeframe: "30D" });
    const second = await client.getPnl({ address: VALID_ADDR, timeframe: "30D" });
    expect(first.totalPnL).toBe("12.5");
    expect(second.totalPnL).toBe("12.5");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await client.getPnl({ address: VALID_ADDR, timeframe: "30D", nocache: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles 429 rate limit and malformed non-JSON HTML responses cleanly", async () => {
    const fetch429 = vi.fn().mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
    const client429 = new StellarPnlClient({
      fetchImpl: fetch429 as unknown as typeof fetch,
      retryOnRateLimit: false,
    });
    await expect(client429.getPnl({ address: VALID_ADDR })).rejects.toBeInstanceOf(
      StellarPnlRateLimitError
    );

    const fetchRetryOk = vi
      .fn()
      .mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ address: VALID_ADDR, totalPnL: "5" }), { status: 200 })
      );
    const clientRetry = new StellarPnlClient({
      fetchImpl: fetchRetryOk as unknown as typeof fetch,
      retryOnRateLimit: true,
      rateLimitRetryDelayMs: 10,
    });
    const retried = await clientRetry.getPnl({ address: VALID_ADDR });
    expect(retried.totalPnL).toBe("5");
    expect(fetchRetryOk).toHaveBeenCalledTimes(2);

    const fetchHtml = vi.fn().mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 200 }));
    const clientHtml = new StellarPnlClient({ fetchImpl: fetchHtml as unknown as typeof fetch });
    await expect(clientHtml.getPnl({ address: VALID_ADDR })).rejects.toBeInstanceOf(
      StellarPnlNetworkError
    );
  });

  it("normalizes null, undefined, NaN, and empty arrays without crashing", () => {
    const normalized = normalizePnlResponse(
      {
        totalPnL: "NaN",
        totalRealized: null,
        totalUnrealized: undefined,
        usdcSpent: Infinity,
        trades: null,
        positions: undefined,
        chart: { points: [{ date: "2026-11-27", holdingsValue: "NaN" }] },
      },
      VALID_ADDR,
      "2026-11-01",
      "2026-11-27"
    );

    expect(normalized.totalPnL).toBe("0");
    expect(normalized.totalRealized).toBe("0");
    expect(normalized.totalUnrealized).toBeNull();
    expect(normalized.usdcSpent).toBe("0");
    expect(normalized.trades).toEqual([]);
    expect(normalized.positions).toEqual([]);
    expect(normalized.chart.points[0]?.holdingsValue).toBe("0");
  });

  it("preserves legacy SwiftEx URL builders", () => {
    expect(
      buildSwapUrl({
        fromChainId: SUPPORTED_CHAINS.STELLAR,
        toChainId: SUPPORTED_CHAINS.STELLAR,
        sellAsset: "XLM",
        buyAsset: "USDC",
      })
    ).toBe(
      "https://app.swiftexchange.io/trading/swap?fromChainId=pubnet&toChainId=pubnet&sellAsset=XLM&buyAsset=USDC"
    );
  });
});

