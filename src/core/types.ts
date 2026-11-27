export type ChainId = number | "pubnet";

export interface ChainInfo {
  readonly id: ChainId;
  readonly key: string;
  readonly name: string;
  readonly symbol: string;
  readonly type: "evm" | "stellar";
}

export interface SwapUrlParams {
  fromChainId?: ChainId;
  toChainId?: ChainId;
  sellAsset?: string;
  buyAsset?: string;
  sellAddress?: string;
  buyAddress?: string;
}

export interface StellarTradingUrlParams {
  tab?: "amm" | "spot" | string;
  sellAsset?: string;
  buyAsset?: string;
}

export type StellarPnlTimeframe = "7D" | "30D" | "90D";

export interface StellarPnlDateRange {
  startDate: string; // YYYY-MM-DD (UTC)
  endDate: string;   // YYYY-MM-DD (UTC)
}

export interface StellarPnlAutoCostBasisEntry {
  asset: string;
  issuer: string;
  price: string | null;
  date: string;
  amount: string;
  source: string;
}

export interface StellarPnlBestWorstTrade {
  date: string;
  asset: string;
  pnl: string;
}

export interface StellarPnlLargestPosition {
  asset: string;
  issuer: string;
  remaining: string;
  currentValue: string | null;
}

export interface StellarPnlTrade {
  date: string;
  txHash: string;
  type: string;
  action: string;
  asset: string;
  amount: string;
  quantity: string;
  price: string;
  priceUsd: string;
  usdc: string;
  costBasisUsd: string;
  feeUsd: string;
  pnl: string;
  pnlNum: string;
  source: string;
}

export interface StellarPnlPosition {
  asset: string;
  issuer: string;
  totalBought: string;
  totalSold: string;
  remaining: string;
  avgCost: string;
  currentPrice: string | null;
  priceSource: string | null;
  unrealized: string | null;
  currentValue: string | null;
  illiquidWarning: boolean;
  realizedPnL: string;
}

export interface StellarPnlDisposal {
  date: string;
  asset: string;
  issuer: string;
  amount: string;
  proceeds: string;
  pnl: string;
  costBasisUnknown: boolean;
}

export interface StellarPnlChartPoint {
  date: string;
  realizedPnl: string;
  holdingsValue: string;
}

export interface StellarPnlChart {
  from: string;
  to: string;
  granularity: string;
  points: StellarPnlChartPoint[];
}

export interface StellarPnlResponse {
  address: string;
  startDate: string;
  endDate: string;
  rawCount: number;
  collapsedCount: number;
  skippedCount: number;
  filteredCount: number;
  noPriceCount: number;
  unpricedAssets: string[];
  scamCount: number;
  possiblyScam: string[];
  excludedTrades: {
    scam: number;
    filtered: number;
  };
  lowLiquidityAssets: string[];
  illiquidPositions: string[];
  costBasisWarning: boolean;
  autoCostBasis: Record<string, StellarPnlAutoCostBasisEntry>;
  usdcSpent: string;
  usdcReceived: string;
  netUSDCFlow: string;
  totalRealized: string;
  totalUnrealized: string | null;
  totalPnL: string;
  totalFees: string;
  winRate: string | null;
  bestTrade: StellarPnlBestWorstTrade | null;
  worstTrade: StellarPnlBestWorstTrade | null;
  firstTradeDate: string | null;
  lastTradeDate: string | null;
  activeDays: number;
  mostTradedAsset: string | null;
  totalPortfolioValue: string | null;
  totalCostBasis: string;
  openPnLPct: string | null;
  largestPosition: StellarPnlLargestPosition | null;
  tradeCount: number;
  positionCount: number;
  disposalCount: number;
  trades: StellarPnlTrade[];
  positions: StellarPnlPosition[];
  disposals: StellarPnlDisposal[];
  chart: StellarPnlChart;
}

export interface StellarPnlClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  retryOnRateLimit?: boolean;
  rateLimitRetryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GetPnlParams {
  address: string;
  startDate?: string | Date;
  endDate?: string | Date;
  timeframe?: StellarPnlTimeframe;
  summary?: boolean;
  nocache?: boolean;
  signal?: AbortSignal;
}

export interface UseStellarPnlOptions {
  walletAddress: string;
  apiKey?: string;
  baseUrl?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  timeframe?: StellarPnlTimeframe;
  summary?: boolean;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

export interface UseStellarPnlResult {
  data: StellarPnlResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

