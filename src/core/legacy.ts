import type { ChainId, ChainInfo, StellarTradingUrlParams, SwapUrlParams } from "./types";

export const SUPPORTED_CHAINS = Object.freeze({
  ETHEREUM: 1,
  OPTIMISM: 10,
  BSC: 56,
  POLYGON: 137,
  BASE: 8453,
  ARBITRUM: 42161,
  AVALANCHE: 43114,
  STELLAR: "pubnet",
} as const);

export const CHAIN_METADATA: Readonly<Record<ChainId, ChainInfo>> = Object.freeze({
  [SUPPORTED_CHAINS.ETHEREUM]: {
    id: 1,
    key: "eth",
    name: "Ethereum",
    symbol: "ETH",
    type: "evm",
  },
  [SUPPORTED_CHAINS.POLYGON]: {
    id: 137,
    key: "polygon",
    name: "Polygon",
    symbol: "POL",
    type: "evm",
  },
  [SUPPORTED_CHAINS.BSC]: {
    id: 56,
    key: "bsc",
    name: "BNB Smart Chain",
    symbol: "BNB",
    type: "evm",
  },
  [SUPPORTED_CHAINS.BASE]: {
    id: 8453,
    key: "base",
    name: "Base",
    symbol: "ETH",
    type: "evm",
  },
  [SUPPORTED_CHAINS.AVALANCHE]: {
    id: 43114,
    key: "avax",
    name: "Avalanche C-Chain",
    symbol: "AVAX",
    type: "evm",
  },
  [SUPPORTED_CHAINS.ARBITRUM]: {
    id: 42161,
    key: "arb",
    name: "Arbitrum One",
    symbol: "ETH",
    type: "evm",
  },
  [SUPPORTED_CHAINS.OPTIMISM]: {
    id: 10,
    key: "optimism",
    name: "Optimism",
    symbol: "ETH",
    type: "evm",
  },
  [SUPPORTED_CHAINS.STELLAR]: {
    id: "pubnet",
    key: "stellar",
    name: "Stellar Pubnet",
    symbol: "XLM",
    type: "stellar",
  },
});

export const EVM_CHAIN_IDS: readonly number[] = Object.freeze([
  SUPPORTED_CHAINS.ETHEREUM,
  SUPPORTED_CHAINS.OPTIMISM,
  SUPPORTED_CHAINS.BSC,
  SUPPORTED_CHAINS.POLYGON,
  SUPPORTED_CHAINS.BASE,
  SUPPORTED_CHAINS.ARBITRUM,
  SUPPORTED_CHAINS.AVALANCHE,
]);

export const SWIFTEX_LINKS = Object.freeze({
  website: "https://swiftexchange.io",
  blog: "https://swiftexchange.io/blog",
  market: "https://swiftexchange.io/market",
  app: "https://app.swiftexchange.io",
  swap: "https://app.swiftexchange.io/trading/swap",
  stellarTrading: "https://app.swiftexchange.io/trading/stellar",
  stellarPortfolio: "https://app.swiftexchange.io/stellar/portfolio",
  perpetuals: "https://app.swiftexchange.io/trade/perpetuals",
  appStore: "https://apps.apple.com/us/app/swiftex-wallet/id6759080930",
  playStore: "https://play.google.com/store/apps/details?id=org.app.swiftEx.wallet",
  contactEmail: "info@swiftexwallet.com",
  socials: Object.freeze({
    discord: "https://discord.gg/RR6VrzhUdY",
    instagram: "https://www.instagram.com/swiftex_wallet",
    facebook: "https://www.facebook.com/swiftexwallet",
    linkedin: "https://www.linkedin.com/company/swiftexwallet",
    x: "https://x.com/SwiftEx_Wallet",
  }),
});

export function buildSwapUrl({
  fromChainId,
  toChainId,
  sellAsset,
  buyAsset,
  sellAddress,
  buyAddress,
}: SwapUrlParams = {}): string {
  const url = new URL(SWIFTEX_LINKS.swap);
  if (fromChainId !== undefined && fromChainId !== null) {
    url.searchParams.set("fromChainId", String(fromChainId));
  }
  if (toChainId !== undefined && toChainId !== null) {
    url.searchParams.set("toChainId", String(toChainId));
  }
  if (sellAsset) url.searchParams.set("sellAsset", sellAsset);
  if (buyAsset) url.searchParams.set("buyAsset", buyAsset);
  if (sellAddress) url.searchParams.set("sellAddress", sellAddress);
  if (buyAddress) url.searchParams.set("buyAddress", buyAddress);
  return url.toString();
}

export function buildStellarTradingUrl({
  tab = "amm",
  sellAsset,
  buyAsset,
}: StellarTradingUrlParams = {}): string {
  const url = new URL(SWIFTEX_LINKS.stellarTrading);
  if (tab) url.searchParams.set("tab", tab);
  if (sellAsset) url.searchParams.set("sellAsset", sellAsset);
  if (buyAsset) url.searchParams.set("buyAsset", buyAsset);
  return url.toString();
}

export function getStellarPortfolioUrl(): string {
  return SWIFTEX_LINKS.stellarPortfolio;
}

export function getPerpetualsUrl(): string {
  return SWIFTEX_LINKS.perpetuals;
}

