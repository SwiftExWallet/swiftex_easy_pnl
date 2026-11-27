import { describe, expect, it } from "vitest";
import { normalizePnlResponse } from "../src/core/client";
import { generatePnlJson } from "../src/core/export";
import { generatePnlShareCardSvg, getPnlShareXUrl } from "../src/core/shareCard";
import { computePnlStats, formatPnlDigest } from "../src/core/stats";

const ADDR = "GBWVIPN7JDCG7TABH4RRNJ7DEEBTFNHZP63BLRPDUMHNKITKYEGQEOC5";

const data = normalizePnlResponse(
  {
    address: ADDR,
    totalPnL: "42.50",
    openPnLPct: "12.5",
    totalPortfolioValue: "340.00",
    winRate: "60",
    tradeCount: 5,
    disposalCount: 2,
    scamCount: 3,
    bestTrade: { date: "2026-11-23", asset: "XLM", pnl: "25.00" },
    positions: [
      { asset: "XLM", remaining: "100", currentValue: "340.00", realizedPnL: "30.00" },
      { asset: "GMB", remaining: "0", realizedPnL: "-5.00" },
    ],
    disposals: [
      { date: "2026-11-22", asset: "XLM", amount: "50", proceeds: "100", pnl: "30", costBasisUnknown: false },
      { date: "2026-11-23", asset: "GMB", amount: "10", proceeds: "20", pnl: "-5", costBasisUnknown: true },
    ],
    chart: {
      from: "2026-11-20",
      to: "2026-11-24",
      granularity: "day",
      points: [
        { date: "2026-11-20", realizedPnl: "10", holdingsValue: "300" },
        { date: "2026-11-21", realizedPnl: "5", holdingsValue: "310" },
        { date: "2026-11-22", realizedPnl: "-2", holdingsValue: "305" },
        { date: "2026-11-23", realizedPnl: "12", holdingsValue: "340" },
      ],
    },
  },
  ADDR,
  "2026-11-20",
  "2026-11-24"
);

describe("stats, digest, share card SVG, and JSON export", () => {
  it("computes streaks, disposal totals, and asset distribution", () => {
    const stats = computePnlStats(data);
    expect(stats.greenDays).toBe(3);
    expect(stats.redDays).toBe(1);
    expect(stats.longestWinStreak).toBe(2);
    expect(stats.currentWinStreak).toBe(1);
    expect(stats.totalDisposalProceeds).toBe("120.00");
    expect(stats.totalDisposalPnl).toBe("25.00");
    expect(stats.unknownCostBasisCount).toBe(1);
    expect(stats.assetDistribution[0]?.asset).toBe("XLM");
  });

  it("formats compact Markdown digest", () => {
    const md = formatPnlDigest(data);
    expect(md).toContain("SwiftEx Stellar PnL — GBWV...EOC5");
    expect(md).toContain("$42.50");
    expect(md).toContain("3 spam filtered");
  });

  it("generates self-contained SVG share card with concentric contour arrow and custom options", () => {
    const svg = generatePnlShareCardSvg(data, "dark", {
      brandName: "MyWallet",
      showContourArrow: true,
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("$42.50");
    expect(svg).toContain("<path d=");
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg).toContain("MyWallet");
    expect(svg).toContain("swiftexchange.io");

    const xUrl = getPnlShareXUrl(data);
    expect(xUrl.startsWith("https://twitter.com/intent/tweet?text=")).toBe(true);
    expect(decodeURIComponent(xUrl)).toContain("$42.50");
  });

  it("exports valid formatted JSON", () => {
    const json = generatePnlJson(data);
    const parsed = JSON.parse(json);
    expect(parsed.address).toBe(ADDR);
    expect(parsed.totalPnL).toBe("42.5");
  });
});

