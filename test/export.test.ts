import { describe, expect, it } from "vitest";
import { normalizePnlResponse } from "../src/core/client";
import {
  buildExportFilename,
  buildPnlWorkbook,
  generatePnlCsv,
  sanitizeCsvCell,
} from "../src/core/export";

const sampleData = normalizePnlResponse(
  {
    address: "GBWVIPN7JDCG7TABH4RRNJ7DEEBTFNHZP63BLRPDUMHNKITKYEGQEOC5",
    totalCostBasis: "100.50",
    totalPortfolioValue: "120.75",
    totalRealized: "15.25",
    totalUnrealized: "20.25",
    totalPnL: "35.50",
    winRate: "50",
    tradeCount: 2,
    positionCount: 1,
    positions: [
      {
        asset: "XLM",
        issuer: "",
        remaining: "0.0000001",
        avgCost: "0.10",
        currentPrice: "0.12",
        currentValue: "0.000000012",
        unrealized: "0.000000002",
        realizedPnL: "15.25",
      },
    ],
    trades: [
      {
        date: "2026-11-20",
        txHash: "=CMD|'/C calc'!A0",
        type: "SELL",
        asset: "XLM",
        quantity: "100",
        priceUsd: "0.15",
        costBasisUsd: "10",
        feeUsd: "0.05",
        pnlNum: "5.00",
        source: "exact",
      },
      {
        date: "2026-11-21",
        txHash: "+malicious",
        type: "BUY",
        asset: "USDC",
        quantity: "50",
        priceUsd: "1.00",
        costBasisUsd: "50",
        feeUsd: "0.01",
        pnlNum: "0",
        source: "exact",
      },
    ],
  },
  "GBWVIPN7JDCG7TABH4RRNJ7DEEBTFNHZP63BLRPDUMHNKITKYEGQEOC5",
  "2026-10-27",
  "2026-11-27"
);

describe("CSV & XLSX exporters", () => {
  it("formats export filename cleanly", () => {
    expect(
      buildExportFilename(sampleData.address, "2026-10-27", "2026-11-27", "xlsx")
    ).toBe("stellar-pnl_GBWV...EOC5_2026-10-27_to_2026-11-27.xlsx");
  });

  it("generates UTF-8 BOM CSV with formula-injection sanitization and zero 1e-7 notation", () => {
    expect(sanitizeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvCell("+123")).toBe("'+123");
    expect(sanitizeCsvCell("-123")).toBe("'-123");
    expect(sanitizeCsvCell("@evil")).toBe("'@evil");

    const csv = generatePnlCsv(sampleData);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("0.0000001");
    expect(csv).not.toContain("1e-7");
    expect(csv).toContain("'=CMD|'/C calc'!A0");
    expect(csv).toContain("'+malicious");
  });

  it("builds 3-tab XLSX workbook with fullCalcOnLoad=true and live Excel formulas", async () => {
    const wb = await buildPnlWorkbook(sampleData);
    expect(wb.calcProperties.fullCalcOnLoad).toBe(true);

    const summary = wb.getWorksheet("Summary")!;
    const positions = wb.getWorksheet("Positions")!;
    const trades = wb.getWorksheet("Trades")!;

    expect(summary).toBeDefined();
    expect(positions).toBeDefined();
    expect(trades).toBeDefined();

    // Summary KPIs must be formulas, not hardcoded values
    expect(summary.getCell("B6").value).toEqual({ formula: "SUM(Positions!E2:E2)" });
    expect(summary.getCell("B11").value).toEqual({ formula: "B9+B8-B10" });
    expect(summary.getCell("B12").value).toEqual({ formula: "IFERROR(B11/B6,0)" });
    expect(summary.getCell("B14").value).toEqual({
      formula: 'IFERROR(COUNTIF(Trades!J2:J3,">0")/COUNTA(Trades!A2:A3),0)',
    });

    // Positions formulas & IFERROR guards
    expect(positions.getCell("E2").value).toEqual({ formula: "B2*C2" });
    expect(positions.getCell("F2").value).toEqual({ formula: "B2*D2" });
    expect(positions.getCell("G2").value).toEqual({ formula: "F2-E2" });
    expect(positions.getCell("H2").value).toEqual({ formula: "IFERROR(G2/E2,0)" });
    expect(positions.getCell("I2").value).toEqual({ formula: "IFERROR(F2/SUM($F$2:$F$2),0)" });
    expect(positions.getCell("E3").value).toEqual({ formula: "SUM(E2:E2)" });

    // Trades formulas
    expect(trades.getCell("I2").value).toEqual({ formula: "E2*F2" });
    expect(trades.getCell("J2").value).toEqual({ formula: 'IF(UPPER(D2)="SELL",(E2*F2)-G2,0)' });
    expect(trades.getCell("K2").value).toEqual({ formula: "J2-H2" });
    expect(trades.getCell("K4").value).toEqual({ formula: "SUM(K2:K3)" });
  });
});

