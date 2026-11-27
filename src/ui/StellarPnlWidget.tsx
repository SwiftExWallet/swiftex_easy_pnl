import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { getPresetRange } from "../core/date";
import { exportPnlToCsv, exportPnlToJson, exportPnlToXlsx } from "../core/export";
import { getStellarPortfolioUrl } from "../core/legacy";
import {
  formatPercentFromDecimal,
  formatTokenAmount,
  formatUsdFromDecimal,
  parseDecimalToScaledBigInt,
} from "../core/math";
import {
  copyPnlCardPngToClipboard,
  exportPnlCardPng,
  exportPnlCardSvg,
  generatePnlShareCardSvg,
  getPnlShareXUrl,
  sharePnlCardNative,
  type PnlShareCardOptions,
} from "../core/shareCard";
import { computePnlStats, formatPnlDigest } from "../core/stats";
import type { StellarPnlDateRange, StellarPnlResponse, StellarPnlTimeframe } from "../core/types";
import { useStellarPnl } from "../core/useStellarPnl";
import { isValidStellarAddress, truncateStellarAddress } from "../core/validation";
import { CalendarPopover } from "./CalendarPopover";
import { Sparkline, type SparklineMode } from "./Sparkline";
import "./styles.css";

export interface StellarPnlWidgetProps {
  walletAddress: string;
  apiKey?: string;
  baseUrl?: string;
  defaultTimeframe?: StellarPnlTimeframe;
  theme?: "light" | "dark";
  enableExport?: boolean;
  enableShareCard?: boolean;
  shareCardOptions?: PnlShareCardOptions;
  className?: string;
  onError?: (error: Error) => void;
  renderAssetLogo?: (asset: string, issuer: string) => React.ReactNode;
  renderHeader?: (props: {
    walletAddress: string;
    range: StellarPnlDateRange;
    data: StellarPnlResponse | null;
  }) => React.ReactNode;
  renderEmpty?: () => React.ReactNode;
  renderLoading?: () => React.ReactNode;
}

interface BoundaryProps {
  theme: "light" | "dark";
  className?: string;
  onError?: (error: Error) => void;
  onRetry: () => void;
  children: React.ReactNode;
}

interface BoundaryState {
  hasError: boolean;
  message: string;
}

class WidgetErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, message: error?.message || "Unexpected rendering error." };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className={`spnl-root ${this.props.className ?? ""}`.trim()}
          data-spnl-theme={this.props.theme}
        >
          <div className="spnl-state-box">
            <div className="spnl-state-title">Unable to render Stellar PnL</div>
            <div className="spnl-state-msg">{this.state.message}</div>
            <button
              type="button"
              className="spnl-btn"
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                this.props.onRetry();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const PRESETS: readonly StellarPnlTimeframe[] = ["7D", "30D", "90D"];
const TRADES_PAGE_SIZE = 25;

const TrendArrow: React.FC<{ isPositive: boolean }> = ({ isPositive }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d={isPositive ? "M4 12L12 4M12 4H6M12 4V10" : "M4 4L12 12M12 12H6M12 12V6"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StellarPnlWidgetInner: React.FC<StellarPnlWidgetProps> = ({
  walletAddress,
  apiKey,
  baseUrl,
  defaultTimeframe = "30D",
  theme = "light",
  enableExport = true,
  enableShareCard = true,
  shareCardOptions,
  className = "",
  onError,
  renderAssetLogo,
  renderHeader,
  renderEmpty,
  renderLoading,
}) => {
  const [activePreset, setActivePreset] = useState<StellarPnlTimeframe | null>(defaultTimeframe);
  const [range, setRange] = useState<StellarPnlDateRange>(() => getPresetRange(defaultTimeframe));
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [activeTab, setActiveTab] = useState<"open" | "trades" | "disposals" | "all">("open");
  const [tradeSideFilter, setTradeSideFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [visibleTradesCount, setVisibleTradesCount] = useState(TRADES_PAGE_SIZE);
  const [sparkMode, setSparkMode] = useState<SparklineMode>("holdingsValue");
  const [showContourArrow, setShowContourArrow] = useState<boolean>(
    shareCardOptions?.showContourArrow ?? true
  );

  const exportRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, error, refetch } = useStellarPnl({
    walletAddress,
    apiKey,
    baseUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    timeframe: activePreset ?? undefined,
    summary: false,
    onError,
  });

  useEffect(() => {
    setVisibleTradesCount(TRADES_PAGE_SIZE);
  }, [walletAddress, range.startDate, range.endDate, tradeSideFilter]);

  useEffect(() => {
    if (!exportOpen && !shareOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportOpen && exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExportOpen(false);
        setShareOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [exportOpen, shareOpen]);

  const handlePresetClick = (preset: StellarPnlTimeframe) => {
    setActivePreset(preset);
    setRange(getPresetRange(preset));
  };

  const handleCustomRange = (nextRange: StellarPnlDateRange) => {
    setActivePreset(null);
    setRange(nextRange);
  };

  const hasDataset = Boolean(data && (data.tradeCount > 0 || data.positionCount > 0));
  const exportDisabled = isLoading || Boolean(error) || !hasDataset || isExportingXlsx;

  const stats = useMemo(() => (data ? computePnlStats(data) : null), [data]);
  const resolvedShareOptions = useMemo<PnlShareCardOptions>(
    () => ({
      ...shareCardOptions,
      showContourArrow,
    }),
    [shareCardOptions, showContourArrow]
  );
  const shareSvg = useMemo(
    () => (data && shareOpen ? generatePnlShareCardSvg(data, theme, resolvedShareOptions) : ""),
    [data, shareOpen, theme, resolvedShareOptions]
  );

  const handleCopyAddress = async () => {
    if (!walletAddress || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(walletAddress.trim());
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyDigest = async () => {
    if (!data || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(formatPnlDigest(data));
      setCopiedDigest(true);
      setTimeout(() => setCopiedDigest(false), 1500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyImage = async () => {
    if (!data) return;
    try {
      const ok = await copyPnlCardPngToClipboard(data, theme, resolvedShareOptions);
      if (ok) {
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 1800);
      }
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleShareOnX = async () => {
    if (!data) return;
    await copyPnlCardPngToClipboard(data, theme, resolvedShareOptions).catch(() => false);
    if (typeof window !== "undefined") {
      window.open(getPnlShareXUrl(data, resolvedShareOptions), "_blank", "noopener,noreferrer");
    }
  };

  const handleNativeShare = async () => {
    if (!data) return;
    try {
      const res = await sharePnlCardNative(data, theme, resolvedShareOptions);
      if (res === "copied") {
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 1800);
      } else if (res === "unsupported") {
        await exportPnlCardPng(data, theme, resolvedShareOptions);
      }
    } catch {
      // User cancelled native share
    }
  };

  const handleExportCsv = () => {
    if (!data || exportDisabled) return;
    setExportOpen(false);
    exportPnlToCsv(data);
  };

  const handleExportJson = () => {
    if (!data || exportDisabled) return;
    setExportOpen(false);
    exportPnlToJson(data);
  };

  const handleExportXlsx = async () => {
    if (!data || exportDisabled) return;
    setIsExportingXlsx(true);
    try {
      await exportPnlToXlsx(data);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error("Failed to export XLSX workbook.");
      onError?.(e);
    } finally {
      setIsExportingXlsx(false);
      setExportOpen(false);
    }
  };

  const totalPnlScaled = data ? parseDecimalToScaledBigInt(data.totalPnL) : null;
  const isPositive = totalPnlScaled === null || totalPnlScaled >= 0n;
  const filteredFlags = data ? data.scamCount + data.lowLiquidityAssets.length : 0;
  const validAddr = isValidStellarAddress(walletAddress);

  return (
    <div
      className={`spnl-root ${className}`.trim()}
      data-spnl-theme={theme}
    >
      {renderHeader ? (
        renderHeader({ walletAddress, range, data })
      ) : (
        <div className="spnl-header">
          <div className="spnl-title-group">
            <div className="spnl-title-row">
              <h3 className="spnl-title">Stellar PnL</h3>
              {filteredFlags > 0 && (
                <span
                  className="spnl-badge"
                  title="Spam & low-liquidity tokens excluded from PnL"
                >
                  {filteredFlags} Spam Filtered
                </span>
              )}
            </div>
            <div className="spnl-address-row">
              <span className="spnl-address">
                {walletAddress ? truncateStellarAddress(walletAddress) : "No address"}
              </span>
              {walletAddress && (
                <button type="button" className="spnl-link-btn" onClick={handleCopyAddress}>
                  {copiedAddr ? "Copied" : "Copy"}
                </button>
              )}
              {validAddr && (
                <a
                  className="spnl-link-btn"
                  href={`https://stellar.expert/explorer/public/account/${walletAddress.trim()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Explorer
                </a>
              )}
              <a
                className="spnl-link-btn"
                href={getStellarPortfolioUrl()}
                target="_blank"
                rel="noopener noreferrer"
              >
                SwiftEx App
              </a>
            </div>
          </div>

          <div className="spnl-controls">
            <div className="spnl-segmented" role="group" aria-label="Timeframe presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="spnl-seg-btn"
                  data-active={activePreset === preset}
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <CalendarPopover
              startDate={range.startDate}
              endDate={range.endDate}
              onChange={handleCustomRange}
            />

            {enableShareCard && (
              <button
                type="button"
                className="spnl-btn"
                disabled={exportDisabled}
                onClick={() => setShareOpen(true)}
              >
                Share
              </button>
            )}

            {enableExport && (
              <div className="spnl-popover-anchor" ref={exportRef}>
                <button
                  type="button"
                  className="spnl-btn"
                  disabled={exportDisabled}
                  onClick={() => setExportOpen((o) => !o)}
                  aria-expanded={exportOpen}
                >
                  {isExportingXlsx ? "Exporting..." : "Export"}
                </button>
                {exportOpen && !exportDisabled && (
                  <div className="spnl-menu" role="menu">
                    <button
                      type="button"
                      className="spnl-menu-item"
                      role="menuitem"
                      onClick={handleExportXlsx}
                    >
                      Export Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      className="spnl-menu-item"
                      role="menuitem"
                      onClick={handleExportCsv}
                    >
                      Export CSV (.csv)
                    </button>
                    <button
                      type="button"
                      className="spnl-menu-item"
                      role="menuitem"
                      onClick={handleExportJson}
                    >
                      Export JSON (.json)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        renderLoading ? (
          renderLoading()
        ) : (
          <div className="spnl-skeleton-wrap" aria-busy="true" aria-label="Loading Stellar PnL">
            <div className="spnl-skeleton-bar" style={{ height: 48, width: "45%" }} />
            <div className="spnl-skeleton-bar" style={{ height: 64, width: "100%" }} />
            <div className="spnl-skeleton-bar" style={{ height: 76, width: "100%" }} />
          </div>
        )
      ) : error ? (
        <div className="spnl-state-box" role="alert">
          <div className="spnl-state-title">Failed to load PnL data</div>
          <div className="spnl-state-msg">{error.message}</div>
          <button type="button" className="spnl-btn" onClick={refetch}>
            Retry
          </button>
        </div>
      ) : !data || !hasDataset ? (
        renderEmpty ? (
          renderEmpty()
        ) : (
          <div className="spnl-state-box">
            <div className="spnl-state-title">No PnL activity in this range</div>
            <div className="spnl-state-msg">
              Try expanding the date range (up to 90 days) or selecting another Stellar address.
            </div>
          </div>
        )
      ) : (
        <>
          <div className="spnl-hero">
            <div>
              <div className="spnl-hero-label">Total PnL</div>
              <div className="spnl-hero-row">
                <span className={`spnl-hero-value spnl-num ${isPositive ? "spnl-pos" : "spnl-neg"}`}>
                  {formatUsdFromDecimal(data.totalPnL)}
                </span>
                {data.openPnLPct !== null && (
                  <span className={`spnl-pct-pill spnl-num ${isPositive ? "spnl-pos" : "spnl-neg"}`}>
                    <TrendArrow isPositive={isPositive} />
                    {formatPercentFromDecimal(data.openPnLPct, 2, true)}
                  </span>
                )}
              </div>
            </div>

            <Sparkline
              points={data.chart.points}
              isPositive={isPositive}
              mode={sparkMode}
              onModeChange={setSparkMode}
            />
          </div>

          <div className="spnl-kpi-grid">
            <div className="spnl-kpi-card">
              <div className="spnl-kpi-label">Portfolio Value</div>
              <div className="spnl-kpi-val spnl-num">{formatUsdFromDecimal(data.totalPortfolioValue)}</div>
            </div>
            <div className="spnl-kpi-card">
              <div className="spnl-kpi-label">Realized PnL</div>
              <div className="spnl-kpi-val spnl-num">{formatUsdFromDecimal(data.totalRealized)}</div>
            </div>
            <div className="spnl-kpi-card">
              <div className="spnl-kpi-label">Unrealized PnL</div>
              <div className="spnl-kpi-val spnl-num">{formatUsdFromDecimal(data.totalUnrealized)}</div>
            </div>
            <div className="spnl-kpi-card">
              <div className="spnl-kpi-label">Win Rate / Trades</div>
              <div className="spnl-kpi-val spnl-num">
                {formatPercentFromDecimal(data.winRate, 0)} ({data.tradeCount})
              </div>
            </div>
          </div>

          <div className="spnl-meta-strip">
            <div className="spnl-meta-item">
              <span className="spnl-meta-label">Best Trade</span>
              <span className="spnl-num spnl-pos">
                {data.bestTrade ? `${formatUsdFromDecimal(data.bestTrade.pnl, 4)} (${data.bestTrade.asset})` : "—"}
              </span>
            </div>
            <div className="spnl-meta-item">
              <span className="spnl-meta-label">Worst Trade</span>
              <span className="spnl-num spnl-neg">
                {data.worstTrade ? `${formatUsdFromDecimal(data.worstTrade.pnl, 4)} (${data.worstTrade.asset})` : "—"}
              </span>
            </div>
            <div className="spnl-meta-item">
              <span className="spnl-meta-label">USDC Spent / Net Flow</span>
              <span className="spnl-num">
                {formatUsdFromDecimal(data.usdcSpent)} / {formatUsdFromDecimal(data.netUSDCFlow)}
              </span>
            </div>
            <div className="spnl-meta-item">
              <span className="spnl-meta-label">Streaks / Active Days</span>
              <span className="spnl-num">
                {stats ? `${stats.greenDays}G / ${stats.redDays}R · ${stats.longestWinStreak}d streak` : `${data.activeDays}d`}
              </span>
            </div>
          </div>

          {stats && stats.assetDistribution.length > 0 && (
            <div className="spnl-dist-wrap">
              <div className="spnl-dist-head">
                <span>Realized PnL Distribution</span>
                <span>Top Asset: {data.mostTradedAsset ?? "—"}</span>
              </div>
              <div className="spnl-dist-bar">
                {stats.assetDistribution.map((item) => (
                  <div
                    key={item.asset}
                    style={{
                      width: `${item.absSharePct}%`,
                      background: item.isPositive ? "var(--spnl-positive)" : "var(--spnl-negative)",
                    }}
                    title={`${item.asset}: ${formatUsdFromDecimal(item.realizedPnL, 4)}`}
                  />
                ))}
              </div>
              <div className="spnl-dist-legend">
                {stats.assetDistribution.map((item) => (
                  <span key={item.asset} className="spnl-num">
                    {item.asset}:{" "}
                    <span className={item.isPositive ? "spnl-pos" : "spnl-neg"}>
                      {formatUsdFromDecimal(item.realizedPnL, 4)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const openPositions = data.positions.filter((p) => {
              const rem = parseDecimalToScaledBigInt(p.remaining);
              return rem !== null && rem > 0n;
            });
            const filteredTrades =
              tradeSideFilter === "ALL"
                ? data.trades
                : data.trades.filter((t) => t.type === tradeSideFilter);
            const visibleTrades = filteredTrades.slice(0, visibleTradesCount);

            return (
              <>
                <div className="spnl-tabs" role="tablist" aria-label="Portfolio details">
                  <div className="spnl-tab-list">
                    <button
                      type="button"
                      role="tab"
                      className="spnl-tab"
                      aria-selected={activeTab === "open"}
                      data-active={activeTab === "open"}
                      onClick={() => setActiveTab("open")}
                    >
                      Open Positions ({openPositions.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="spnl-tab"
                      aria-selected={activeTab === "trades"}
                      data-active={activeTab === "trades"}
                      onClick={() => setActiveTab("trades")}
                    >
                      Recent Trades ({data.trades.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="spnl-tab"
                      aria-selected={activeTab === "disposals"}
                      data-active={activeTab === "disposals"}
                      onClick={() => setActiveTab("disposals")}
                    >
                      Disposals / Tax ({data.disposals.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="spnl-tab"
                      aria-selected={activeTab === "all"}
                      data-active={activeTab === "all"}
                      onClick={() => setActiveTab("all")}
                    >
                      All Positions ({data.positions.length})
                    </button>
                  </div>

                  {activeTab === "trades" && (
                    <div className="spnl-filter-row" role="group" aria-label="Filter trades by side">
                      {(["ALL", "BUY", "SELL"] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          className="spnl-mini-btn"
                          data-active={tradeSideFilter === side}
                          onClick={() => setTradeSideFilter(side)}
                        >
                          {side}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {activeTab === "open" && (
                  openPositions.length === 0 ? (
                    <div className="spnl-state-box">
                      <div className="spnl-state-msg" style={{ marginBottom: 0 }}>
                        No open positions with remaining balance in this range.
                      </div>
                    </div>
                  ) : (
                    <div className="spnl-table-wrap">
                      <table className="spnl-table">
                        <thead>
                          <tr>
                            <th>Asset</th>
                            <th>Remaining</th>
                            <th>Avg Cost</th>
                            <th>Current Price</th>
                            <th>Current Value</th>
                            <th>Unrealized PnL</th>
                            <th>Realized PnL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {openPositions.map((pos) => {
                            const uScaled = parseDecimalToScaledBigInt(pos.unrealized);
                            const rScaled = parseDecimalToScaledBigInt(pos.realizedPnL);
                            return (
                              <tr key={`${pos.asset}-${pos.issuer}`}>
                                <td>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    {renderAssetLogo?.(pos.asset, pos.issuer)}
                                    <span>{pos.asset}</span>
                                  </span>
                                </td>
                                <td className="spnl-num">{formatTokenAmount(pos.remaining, 7)}</td>
                                <td className="spnl-num">{formatUsdFromDecimal(pos.avgCost, 4)}</td>
                                <td className="spnl-num">{formatUsdFromDecimal(pos.currentPrice, 4)}</td>
                                <td className="spnl-num">{formatUsdFromDecimal(pos.currentValue)}</td>
                                <td className={`spnl-num ${uScaled !== null && uScaled < 0n ? "spnl-neg" : "spnl-pos"}`}>
                                  {formatUsdFromDecimal(pos.unrealized)}
                                </td>
                                <td className={`spnl-num ${rScaled !== null && rScaled < 0n ? "spnl-neg" : "spnl-pos"}`}>
                                  {formatUsdFromDecimal(pos.realizedPnL)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {activeTab === "trades" && (
                  visibleTrades.length === 0 ? (
                    <div className="spnl-state-box">
                      <div className="spnl-state-msg" style={{ marginBottom: 0 }}>
                        No trades matching this filter in this date range.
                      </div>
                    </div>
                  ) : (
                    <div className="spnl-table-wrap">
                      <table className="spnl-table">
                        <thead>
                          <tr>
                            <th>Date (UTC)</th>
                            <th>Side</th>
                            <th>Asset</th>
                            <th>Quantity</th>
                            <th>Price</th>
                            <th>Value (USD)</th>
                            <th>Realized PnL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleTrades.map((t, idx) => {
                            const pScaled = parseDecimalToScaledBigInt(t.pnlNum);
                            return (
                              <tr key={`${t.date}-${t.asset}-${idx}`}>
                                <td className="spnl-num">{t.date || "—"}</td>
                                <td className={t.type === "SELL" ? "spnl-neg" : "spnl-pos"}>{t.type}</td>
                                <td>{t.asset}</td>
                                <td className="spnl-num">{formatTokenAmount(t.quantity, 7)}</td>
                                <td className="spnl-num">{formatUsdFromDecimal(t.priceUsd, 6)}</td>
                                <td className="spnl-num">{formatUsdFromDecimal(t.costBasisUsd)}</td>
                                <td className={`spnl-num ${pScaled !== null && pScaled < 0n ? "spnl-neg" : pScaled !== null && pScaled > 0n ? "spnl-pos" : ""}`}>
                                  {t.type === "SELL" ? formatUsdFromDecimal(t.pnlNum, 4) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredTrades.length > visibleTrades.length && (
                        <div className="spnl-pagination">
                          <span>
                            Showing {visibleTrades.length} of {filteredTrades.length} trades
                          </span>
                          <button
                            type="button"
                            className="spnl-mini-btn"
                            onClick={() => setVisibleTradesCount((c) => c + TRADES_PAGE_SIZE)}
                          >
                            Load more
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}

                {activeTab === "disposals" && (
                  data.disposals.length === 0 ? (
                    <div className="spnl-state-box">
                      <div className="spnl-state-msg" style={{ marginBottom: 0 }}>
                        No taxable disposals in this date range.
                      </div>
                    </div>
                  ) : (
                    <div className="spnl-table-wrap">
                      {stats && (
                        <div className="spnl-pagination" style={{ borderTop: "none", borderBottom: "1px solid var(--spnl-border)" }}>
                          <span className="spnl-num">
                            Total Proceeds: {formatUsdFromDecimal(stats.totalDisposalProceeds)} · Net Gain/Loss:{" "}
                            {formatUsdFromDecimal(stats.totalDisposalPnl)}
                          </span>
                          <span>Unknown Cost Basis: {stats.unknownCostBasisCount}</span>
                        </div>
                      )}
                      <table className="spnl-table">
                        <thead>
                          <tr>
                            <th>Date (UTC)</th>
                            <th>Asset</th>
                            <th>Amount</th>
                            <th>Proceeds (USD)</th>
                            <th>Realized PnL</th>
                            <th>Cost Basis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.disposals.slice(0, 50).map((d, idx) => {
                            const pScaled = parseDecimalToScaledBigInt(d.pnl);
                            return (
                              <tr key={`${d.date}-${d.asset}-${idx}`}>
                                <td className="spnl-num">{d.date || "—"}</td>
                                <td>{d.asset}</td>
                                <td className="spnl-num">{formatTokenAmount(d.amount, 7)}</td>
                                <td className="spnl-num">{formatUsdFromDecimal(d.proceeds)}</td>
                                <td className={`spnl-num ${pScaled !== null && pScaled < 0n ? "spnl-neg" : "spnl-pos"}`}>
                                  {formatUsdFromDecimal(d.pnl, 4)}
                                </td>
                                <td>{d.costBasisUnknown ? "Unknown" : "Exact"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {activeTab === "all" && data.positions.length > 0 && (
                  <div className="spnl-table-wrap">
                    <table className="spnl-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Remaining</th>
                          <th>Avg Cost</th>
                          <th>Current Value</th>
                          <th>Realized PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.positions.slice(0, 20).map((pos) => (
                          <tr key={`${pos.asset}-${pos.issuer}`}>
                            <td>{pos.asset}</td>
                            <td className="spnl-num">{formatTokenAmount(pos.remaining, 7)}</td>
                            <td className="spnl-num">{formatUsdFromDecimal(pos.avgCost, 4)}</td>
                            <td className="spnl-num">{formatUsdFromDecimal(pos.currentValue)}</td>
                            <td className="spnl-num">{formatUsdFromDecimal(pos.realizedPnL)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {shareOpen && data && (
        <div
          className="spnl-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Share Stellar PnL Card"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareOpen(false);
          }}
        >
          <div className="spnl-modal">
            <div className="spnl-modal-head">
              <strong style={{ fontSize: 13 }}>Share PnL Card</strong>
              <button type="button" className="spnl-mini-btn" onClick={() => setShareOpen(false)}>
                Close
              </button>
            </div>
            <div
              className="spnl-modal-preview"
              dangerouslySetInnerHTML={{ __html: shareSvg }}
            />
            <div className="spnl-modal-actions">
              <button
                type="button"
                className="spnl-btn"
                onClick={() => setShowContourArrow((v) => !v)}
              >
                Contour Arrow: {showContourArrow ? "On" : "Off"}
              </button>
              <button type="button" className="spnl-btn" onClick={handleCopyImage}>
                {copiedImage ? "Image Copied" : "Copy Image"}
              </button>
              <button type="button" className="spnl-btn" onClick={handleCopyDigest}>
                {copiedDigest ? "Copied Digest" : "Copy Summary"}
              </button>
              <button type="button" className="spnl-btn" onClick={() => exportPnlCardSvg(data, theme, resolvedShareOptions)}>
                SVG
              </button>
              <button type="button" className="spnl-btn" onClick={() => exportPnlCardPng(data, theme, resolvedShareOptions)}>
                PNG
              </button>
              <button type="button" className="spnl-btn" onClick={handleNativeShare}>
                Share App
              </button>
              <button
                type="button"
                className="spnl-btn"
                style={{ background: "var(--spnl-accent)", color: "var(--spnl-accent-fg)" }}
                onClick={handleShareOnX}
              >
                Share on X
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const StellarPnlWidget: React.FC<StellarPnlWidgetProps> = (props) => {
  const [retryKey, setRetryKey] = useState(0);
  return (
    <WidgetErrorBoundary
      theme={props.theme ?? "light"}
      className={props.className}
      onError={props.onError}
      onRetry={() => setRetryKey((k) => k + 1)}
    >
      <StellarPnlWidgetInner key={retryKey} {...props} />
    </WidgetErrorBoundary>
  );
};
