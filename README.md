# @swiftexwallet/sdk

Official JavaScript & TypeScript **Stellar PnL SDK** by [SwiftEx](https://swiftexchange.io) — built for tracking Stellar Pubnet wallet Profit & Loss (PnL), open positions, trade history, tax disposals, live-formula Excel/CSV exports, and shareable PnL cards.

### Why `@swiftexwallet/sdk`?

- **Real-Time Stellar Pubnet PnL Tracker:** Accurate realized & unrealized PnL, average cost basis, win rate, and portfolio valuation for any Stellar `G...` wallet.
- **Spam & Illiquid Token Filtering:** Automatically filters Stellar claimable-balance spam and low-liquidity dust from PnL calculations.
- **Live-Formula Excel (`.xlsx`) & Tax Disposals:** Export 3-tab workbooks with live Excel formulas (`Summary`, `Positions`, `Trades`) plus UTF-8 BOM `.csv` and `.json`.
- **Drop-In React Widget & Headless Hook:** Use `<StellarPnlWidget />` out of the box or build custom UIs with `useStellarPnl` and `BigInt` fixed-point math helpers.
- **Shareable PnL Cards:** Generate crisp SVG/PNG PnL cards and share directly to X or native mobile/desktop share sheets.

---

## Installation

```bash
npm install @swiftexwallet/sdk
```

Optional (only needed if you use `.xlsx` Excel export):

```bash
npm install exceljs
```

---

## 1. Drop-in React Widget (Fastest)

Import the widget and its stylesheet (`@swiftexwallet/sdk/styles.css`):

```tsx
import { StellarPnlWidget } from "@swiftexwallet/sdk";
import "@swiftexwallet/sdk/styles.css";

export function PortfolioPage({ address }: { address: string }) {
  return (
    <StellarPnlWidget
      walletAddress={address}
      defaultTimeframe="30D"
      theme="dark"
      enableExport
      enableShareCard
    />
  );
}
```

### Widget Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `walletAddress` | `string` | **required** | Stellar `G...` public key (56-char Base32). |
| `defaultTimeframe` | `"7D" \| "30D" \| "90D"` | `"30D"` | Initial date preset (max range: 90 days). |
| `theme` | `"light" \| "dark"` | `"light"` | Monochrome light or dark terminal theme. |
| `enableExport` | `boolean` | `true` | Shows Export menu (`.xlsx`, `.csv`, `.json`). |
| `enableShareCard` | `boolean` | `true` | Shows **Share** modal (SVG/PNG card, Copy Image, Share on X, Web Share). |
| `shareCardOptions` | `PnlShareCardOptions` | `—` | Customize `brandName`, `logoUrl`, `footerLeft`, `footerRight`, `showContourArrow`. |
| `renderAssetLogo` | `(asset, issuer) => ReactNode` | `—` | Optional custom token logo renderer inside position rows. |
| `onError` | `(error: Error) => void` | `—` | Callback for API or render boundary errors. |
| `renderHeader` / `renderEmpty` / `renderLoading` | `function` | `—` | Optional render overrides. |

---

## 2. Custom UI with React Hook (`@swiftexwallet/sdk/core`)

Use `useStellarPnl` if you want full control over your own UI:

```tsx
import {
  useStellarPnl,
  formatUsdFromDecimal,
  formatPercentFromDecimal,
} from "@swiftexwallet/sdk/core";

export function CustomPnl({ address }: { address: string }) {
  const { data, isLoading, error, refetch } = useStellarPnl({
    walletAddress: address,
    timeframe: "30D",
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <button onClick={refetch}>Retry: {error.message}</button>;
  if (!data) return null;

  return (
    <div>
      <h2>Net PnL: {formatUsdFromDecimal(data.totalPnL)}</h2>
      <p>Win Rate: {formatPercentFromDecimal(data.winRate, 0)}</p>
    </div>
  );
}
```

---

## 3. Node.js, API & Bot Usage (`@swiftexwallet/sdk/core`)

```ts
import {
  StellarPnlClient,
  computePnlStats,
  formatPnlDigest,
  generatePnlShareCardSvg,
} from "@swiftexwallet/sdk/core";

const client = new StellarPnlClient();

const pnl = await client.getPnl({
  address: "G...", // Stellar G... public address
  timeframe: "30D", // "7D" | "30D" | "90D" (or pass startDate & endDate)
});

// Win/loss day streaks & asset distribution
const stats = computePnlStats(pnl);

// Compact Markdown summary for AI / Discord / Telegram bots
const markdown = formatPnlDigest(pnl);

// Self-contained 600x320 SVG PnL card
const svg = generatePnlShareCardSvg(pnl, "dark", {
  brandName: "SwiftEx",
  showContourArrow: true,
});
```

---

## 4. Export to Excel (`.xlsx`), CSV, & JSON

```ts
import {
  exportPnlToXlsx,
  exportPnlToCsv,
  exportPnlToJson,
  buildPnlWorkbook,
  generatePnlCsv,
} from "@swiftexwallet/sdk/core";

// In the browser (triggers file download):
await exportPnlToXlsx(pnl); // 3-tab workbook with live Excel formulas
exportPnlToCsv(pnl);        // UTF-8 BOM RFC 4180 CSV
exportPnlToJson(pnl);       // Formatted JSON

// In Node.js:
const workbook = await buildPnlWorkbook(pnl);
await workbook.xlsx.writeFile("stellar-pnl.xlsx");
const csvString = generatePnlCsv(pnl);
```

---

## 5. Official SwiftEx Links & Community

- **Website:** [swiftexchange.io](https://swiftexchange.io)
- **Stellar Portfolio & PnL Web App:** [app.swiftexchange.io/stellar/portfolio](https://app.swiftexchange.io/stellar/portfolio)
- **Markets:** [swiftexchange.io/market](https://swiftexchange.io/market)
- **Blog:** [swiftexchange.io/blog](https://swiftexchange.io/blog)
- **iOS (App Store):** [SwiftEx Wallet](https://apps.apple.com/us/app/swiftex-wallet/id6759080930)
- **Android (Google Play):** [SwiftEx Wallet](https://play.google.com/store/apps/details?id=org.app.swiftEx.wallet)
- **X (Twitter):** [@SwiftEx_Wallet](https://x.com/SwiftEx_Wallet)
- **Discord:** [Join Discord](https://discord.gg/RR6VrzhUdY)
- **Instagram:** [@swiftex_wallet](https://www.instagram.com/swiftex_wallet)
- **LinkedIn:** [SwiftEx Wallet](https://www.linkedin.com/company/swiftexwallet)
- **Facebook:** [SwiftEx Wallet](https://www.facebook.com/swiftexwallet)
- **Contact:** [info@swiftexwallet.com](mailto:info@swiftexwallet.com)

---

## License

Apache-2.0
