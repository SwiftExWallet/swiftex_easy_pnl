import {
  addScaled,
  formatPercentFromDecimal,
  formatTokenAmount,
  formatUsdFromDecimal,
  parseDecimalToScaledBigInt,
  scaledBigIntToDecimalString,
} from "./math";
import type { StellarPnlResponse } from "./types";
import { truncateStellarAddress } from "./validation";

export interface PnlAssetImpact {
  asset: string;
  realizedPnL: string;
  absSharePct: number;
  isPositive: boolean;
}

export interface PnlStats {
  greenDays: number;
  redDays: number;
  flatDays: number;
  longestWinStreak: number;
  currentWinStreak: number;
  bestDay: { date: string; realizedPnl: string } | null;
  worstDay: { date: string; realizedPnl: string } | null;
  totalDisposalProceeds: string;
  totalDisposalPnl: string;
  unknownCostBasisCount: number;
  assetDistribution: PnlAssetImpact[];
}

export function computePnlStats(data: StellarPnlResponse): PnlStats {
  let greenDays = 0;
  let redDays = 0;
  let flatDays = 0;
  let longestWinStreak = 0;
  let runningStreak = 0;

  let bestDay: { date: string; realizedPnl: string } | null = null;
  let bestScaled: bigint | null = null;
  let worstDay: { date: string; realizedPnl: string } | null = null;
  let worstScaled: bigint | null = null;

  for (const pt of data.chart.points) {
    const val = parseDecimalToScaledBigInt(pt.realizedPnl, 18) ?? 0n;
    if (val > 0n) {
      greenDays += 1;
      runningStreak += 1;
      if (runningStreak > longestWinStreak) longestWinStreak = runningStreak;
    } else if (val < 0n) {
      redDays += 1;
      runningStreak = 0;
    } else {
      flatDays += 1;
    }

    if (bestScaled === null || val > bestScaled) {
      bestScaled = val;
      bestDay = { date: pt.date, realizedPnl: pt.realizedPnl };
    }
    if (worstScaled === null || val < worstScaled) {
      worstScaled = val;
      worstDay = { date: pt.date, realizedPnl: pt.realizedPnl };
    }
  }

  let proceedsScaled = 0n;
  let disposalPnlScaled = 0n;
  let unknownCostBasisCount = 0;

  for (const d of data.disposals) {
    proceedsScaled = addScaled(proceedsScaled, parseDecimalToScaledBigInt(d.proceeds, 18) ?? 0n);
    disposalPnlScaled = addScaled(disposalPnlScaled, parseDecimalToScaledBigInt(d.pnl, 18) ?? 0n);
    if (d.costBasisUnknown) unknownCostBasisCount += 1;
  }

  // Asset realized PnL distribution
  const byAsset = new Map<string, bigint>();
  for (const p of data.positions) {
    const val = parseDecimalToScaledBigInt(p.realizedPnL, 18) ?? 0n;
    if (val !== 0n) {
      byAsset.set(p.asset, (byAsset.get(p.asset) ?? 0n) + val);
    }
  }

  let totalAbs = 0n;
  for (const v of byAsset.values()) {
    totalAbs += v < 0n ? -v : v;
  }

  const assetDistribution: PnlAssetImpact[] = Array.from(byAsset.entries())
    .sort((a, b) => {
      const absA = a[1] < 0n ? -a[1] : a[1];
      const absB = b[1] < 0n ? -b[1] : b[1];
      return absB > absA ? 1 : absB < absA ? -1 : 0;
    })
    .slice(0, 6)
    .map(([asset, val]) => {
      const absVal = val < 0n ? -val : val;
      const pct = totalAbs > 0n ? Number((absVal * 10000n) / totalAbs) / 100 : 0;
      return {
        asset,
        realizedPnL: scaledBigIntToDecimalString(val, 18, 6, true),
        absSharePct: Math.max(2, pct),
        isPositive: val >= 0n,
      };
    });

  return {
    greenDays,
    redDays,
    flatDays,
    longestWinStreak,
    currentWinStreak: runningStreak,
    bestDay,
    worstDay,
    totalDisposalProceeds: scaledBigIntToDecimalString(proceedsScaled, 18, 2, false),
    totalDisposalPnl: scaledBigIntToDecimalString(disposalPnlScaled, 18, 2, false),
    unknownCostBasisCount,
    assetDistribution,
  };
}

/**
 * Formats a wallet's PnL response into a compact Markdown digest for AI assistants,
 * Discord/Telegram bots, or clipboard sharing.
 */
export function formatPnlDigest(data: StellarPnlResponse): string {
  const stats = computePnlStats(data);
  const open = data.positions.filter((p) => (parseDecimalToScaledBigInt(p.remaining, 18) ?? 0n) > 0n);

  const lines = [
    `## SwiftEx Stellar PnL — ${truncateStellarAddress(data.address)}`,
    `- **Range:** ${data.startDate} to ${data.endDate} (${data.activeDays} active days)`,
    `- **Total PnL:** ${formatUsdFromDecimal(data.totalPnL)} (${formatPercentFromDecimal(data.openPnLPct, 2, true)})`,
    `- **Portfolio Value:** ${formatUsdFromDecimal(data.totalPortfolioValue)}`,
    `- **Realized / Unrealized:** ${formatUsdFromDecimal(data.totalRealized)} / ${formatUsdFromDecimal(data.totalUnrealized)}`,
    `- **Win Rate / Trades:** ${formatPercentFromDecimal(data.winRate, 0)} across ${data.tradeCount} trades (${data.disposalCount} disposals)`,
    `- **Streaks:** ${stats.greenDays} green days, ${stats.redDays} red days (best streak: ${stats.longestWinStreak}d)`,
    `- **Shield:** ${data.scamCount} spam filtered, ${data.lowLiquidityAssets.length} low-liquidity assets`,
  ];

  if (open.length > 0) {
    lines.push("", "**Open Positions:**");
    for (const p of open.slice(0, 5)) {
      lines.push(
        `- ${p.asset}: ${formatTokenAmount(p.remaining, 7)} (${formatUsdFromDecimal(p.currentValue)})`
      );
    }
  }

  return lines.join("\n");
}

