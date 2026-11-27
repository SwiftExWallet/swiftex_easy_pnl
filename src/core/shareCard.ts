import { formatDisplayDateRange } from "./date";
import {
  formatPercentFromDecimal,
  formatUsdFromDecimal,
  parseDecimalToScaledBigInt,
} from "./math";
import type { StellarPnlResponse } from "./types";
import { truncateStellarAddress } from "./validation";

export interface PnlShareCardOptions {
  brandName?: string;
  logoUrl?: string;
  referralText?: string;
  customNote?: string;
  footerLeft?: string;
  footerRight?: string;
  showContourArrow?: boolean;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildConcentricArrowGroup(
  isPos: boolean,
  strokeColor: string,
  bgColor: string
): string {
  // Rounded arrow silhouette centered around (445, 160)
  // Layering decreasing stroke-widths with stroke-linejoin="round" creates true
  // equidistant rounded topographic/ripple contour rings that smooth into circles outward.
  const d = isPos
    ? "M445 112 L480 147 L459 147 L459 206 L431 206 L431 147 L410 147 Z"
    : "M431 114 L459 114 L459 173 L480 173 L445 208 L410 173 L431 173 Z";

  const ringCount = 20;
  const step = 16;
  const layers: string[] = [];

  for (let i = ringCount; i >= 1; i -= 1) {
    const outerW = i * step;
    const innerW = Math.max(0, outerW - 2.2);
    const opacity = Math.max(0.04, 0.42 - i * 0.018).toFixed(2);

    layers.push(
      `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${outerW}" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="${opacity}" />`
    );
    if (innerW > 0) {
      layers.push(
        `<path d="${d}" fill="${bgColor}" stroke="${bgColor}" stroke-width="${innerW}" stroke-linejoin="round" stroke-linecap="round" />`
      );
    }
  }

  // Crisp innermost arrow outline
  layers.push(
    `<path d="${d}" fill="${bgColor}" stroke="${strokeColor}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.55" />`
  );

  return `<g clip-path="url(#spnl-card-clip)" mask="url(#spnl-fade-mask)">
    ${layers.join("\n    ")}
  </g>`;
}

/**
 * Generates a crisp, self-contained 600x320 institutional SVG PnL share card
 * with subtle SVG dot-grid, concentric-contour directional arrow, and box-free typography.
 */
export function generatePnlShareCardSvg(
  data: StellarPnlResponse,
  theme: "light" | "dark" = "dark",
  options: PnlShareCardOptions = {}
): string {
  const isDark = theme === "dark";
  const bg = isDark ? "#0b1110" : "#ffffff";
  const border = isDark ? "#1e2926" : "#e5e7eb";
  const text = isDark ? "#f3f4f6" : "#111827";
  const muted = isDark ? "#8b949e" : "#6b7280";

  const pnlScaled = parseDecimalToScaledBigInt(data.totalPnL, 18) ?? 0n;
  const isPos = pnlScaled >= 0n;
  const pnlColor = isPos ? (isDark ? "#4ade80" : "#15803d") : isDark ? "#f47280" : "#b91c1c";

  const brandName = escapeXml(options.brandName ?? "SwiftEx");
  const pnlFormatted = escapeXml(formatUsdFromDecimal(data.totalPnL));
  const pctFormatted =
    data.openPnLPct !== null ? escapeXml(formatPercentFromDecimal(data.openPnLPct, 2, true)) : "—";
  const addrShort = escapeXml(truncateStellarAddress(data.address));
  const rangeLabel = escapeXml(formatDisplayDateRange(data.startDate, data.endDate));
  const portfolioVal = escapeXml(formatUsdFromDecimal(data.totalPortfolioValue));
  const winRate = escapeXml(`${formatPercentFromDecimal(data.winRate, 0)} (${data.tradeCount})`);
  const bestTrade = data.bestTrade
    ? escapeXml(`${formatUsdFromDecimal(data.bestTrade.pnl, 4)} (${data.bestTrade.asset})`)
    : "—";
  const footerLeft = escapeXml(options.footerLeft ?? options.referralText ?? "swiftexchange.io");
  const footerRight = escapeXml(options.footerRight ?? "@swiftexwallet/sdk");
  const showContour = options.showContourArrow ?? true;

  const logoBlock = options.logoUrl
    ? `<image href="${escapeXml(options.logoUrl)}" x="28" y="24" width="22" height="22" />`
    : `<circle cx="38" cy="35" r="8.5" fill="none" stroke="${pnlColor}" stroke-width="1.6" />
       <circle cx="38" cy="35" r="2.8" fill="${pnlColor}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320" viewBox="0 0 600 320">
  <defs>
    <clipPath id="spnl-card-clip">
      <rect x="1" y="1" width="598" height="318" rx="8" />
    </clipPath>
    <radialGradient id="spnl-radial" cx="74%" cy="50%" r="58%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.08" />
    </radialGradient>
    <mask id="spnl-fade-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="320">
      <rect x="0" y="0" width="600" height="320" fill="url(#spnl-radial)" />
    </mask>
  </defs>
  <rect x="0.5" y="0.5" width="599" height="319" rx="8" fill="${bg}" stroke="${border}" />
  ${showContour ? buildConcentricArrowGroup(isPos, pnlColor, bg) : ""}
  ${logoBlock}
  <text x="56" y="40" fill="${text}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="16" font-weight="600">${brandName}</text>
  <text x="28" y="62" fill="${muted}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12">${addrShort}</text>
  <text x="572" y="40" text-anchor="end" fill="${muted}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="12" font-weight="500">${rangeLabel}</text>
  <text x="28" y="106" fill="${muted}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="11" letter-spacing="0.06em">NET PNL</text>
  <text x="28" y="152" fill="${pnlColor}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="42" font-weight="700">${pnlFormatted}</text>
  <text x="28" y="178" fill="${pnlColor}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="14" font-weight="500">${pctFormatted}</text>
  <text x="28" y="228" fill="${muted}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="11">Portfolio Value</text>
  <text x="28" y="250" fill="${text}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="16" font-weight="600">${portfolioVal}</text>
  <text x="200" y="228" fill="${muted}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="11">Win Rate / Trades</text>
  <text x="200" y="250" fill="${text}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="16" font-weight="600">${winRate}</text>
  <text x="380" y="228" fill="${muted}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="11">Best Trade</text>
  <text x="380" y="250" fill="${text}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="15" font-weight="600">${bestTrade}</text>
  <line x1="28" y1="274" x2="572" y2="274" stroke="${border}" />
  <text x="28" y="298" fill="${muted}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="11">${footerLeft}</text>
  <text x="572" y="298" text-anchor="end" fill="${muted}" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="11">${footerRight}</text>
</svg>`;
}

export function exportPnlCardSvg(
  data: StellarPnlResponse,
  theme: "light" | "dark" = "dark",
  options: PnlShareCardOptions = {}
): string {
  const svg = generatePnlShareCardSvg(data, theme, options);
  if (typeof window !== "undefined" && typeof document !== "undefined" && typeof Blob !== "undefined") {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swiftex-pnl_${truncateStellarAddress(data.address)}_${data.startDate}.svg`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return svg;
}

export async function renderPnlCardPngBlob(
  data: StellarPnlResponse,
  theme: "light" | "dark" = "dark",
  options: PnlShareCardOptions = {}
): Promise<Blob> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PNG rendering is only available in browser environments.");
  }
  const svg = generatePnlShareCardSvg(data, theme, options);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8;" });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 640;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error("Canvas 2D context unavailable."));
        return;
      }
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          reject(new Error("Failed to encode PNG."));
          return;
        }
        resolve(pngBlob);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("Failed to render SVG share card."));
    };
    img.src = svgUrl;
  });
}

export async function exportPnlCardPng(
  data: StellarPnlResponse,
  theme: "light" | "dark" = "dark",
  options: PnlShareCardOptions = {}
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const pngBlob = await renderPnlCardPngBlob(data, theme, options);
  const pngUrl = URL.createObjectURL(pngBlob);
  const a = document.createElement("a");
  a.href = pngUrl;
  a.download = `swiftex-pnl_${truncateStellarAddress(data.address)}_${data.startDate}.png`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
}

export async function copyPnlCardPngToClipboard(
  data: StellarPnlResponse,
  theme: "light" | "dark" = "dark",
  options: PnlShareCardOptions = {}
): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof ClipboardItem === "undefined"
  ) {
    return false;
  }
  const pngBlob = await renderPnlCardPngBlob(data, theme, options);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  return true;
}

export function getPnlShareXUrl(
  data: StellarPnlResponse,
  options: PnlShareCardOptions = {}
): string {
  const pnl = formatUsdFromDecimal(data.totalPnL);
  const pct = data.openPnLPct !== null ? ` (${formatPercentFromDecimal(data.openPnLPct, 2, true)})` : "";
  const range = formatDisplayDateRange(data.startDate, data.endDate);
  const site = options.footerLeft ?? options.referralText ?? "https://swiftexchange.io";
  const text = `My Stellar PnL (${range}): ${pnl}${pct} across ${data.tradeCount} trades on SwiftEx.\n\nTrack yours at ${site}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export async function sharePnlCardNative(
  data: StellarPnlResponse,
  theme: "light" | "dark" = "dark",
  options: PnlShareCardOptions = {}
): Promise<"shared" | "copied" | "unsupported"> {
  if (typeof navigator === "undefined") return "unsupported";
  const pngBlob = await renderPnlCardPngBlob(data, theme, options);
  const file = new File(
    [pngBlob],
    `swiftex-pnl_${truncateStellarAddress(data.address)}_${data.startDate}.png`,
    { type: "image/png" }
  );

  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      title: "SwiftEx Stellar PnL",
      text: `Stellar PnL (${formatDisplayDateRange(data.startDate, data.endDate)}): ${formatUsdFromDecimal(data.totalPnL)}`,
      files: [file],
    });
    return "shared";
  }

  const copied = await copyPnlCardPngToClipboard(data, theme, options).catch(() => false);
  return copied ? "copied" : "unsupported";
}
