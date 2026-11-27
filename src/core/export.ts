import { formatTokenAmount, toSafeNumber } from "./math";
import type { StellarPnlResponse } from "./types";
import { truncateStellarAddress } from "./validation";

export function buildExportFilename(
  address: string,
  startDate: string,
  endDate: string,
  ext: "csv" | "xlsx"
): string {
  const shortAddr = truncateStellarAddress(address || "unknown");
  return `stellar-pnl_${shortAddr}_${startDate}_to_${endDate}.${ext}`;
}

/**
 * Sanitizes untrusted text cells against CSV formula injection (=, +, -, @)
 * and applies RFC 4180 quoting.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvDecimal(value: unknown, maxDecimals: number = 7): string {
  const formatted = formatTokenAmount(value, maxDecimals);
  return formatted === "—" ? "" : formatted.replace(/,/g, "");
}

function csvRow(cells: unknown[]): string {
  return cells.map(sanitizeCsvCell).join(",");
}

/**
 * Generates an RFC 4180-compliant CSV string with UTF-8 BOM and BigInt-safe numbers.
 */
export function generatePnlCsv(data: StellarPnlResponse): string {
  const lines: string[] = [];

  // Summary block
  lines.push(csvRow(["Section", "Metric", "Value"]));
  lines.push(csvRow(["Summary", "Wallet Address", data.address]));
  lines.push(csvRow(["Summary", "Date Range", `${data.startDate} to ${data.endDate}`]));
  lines.push(csvRow(["Summary", "Total Cost Basis (USD)", formatCsvDecimal(data.totalCostBasis, 2)]));
  lines.push(csvRow(["Summary", "Current Portfolio Value (USD)", formatCsvDecimal(data.totalPortfolioValue, 2)]));
  lines.push(csvRow(["Summary", "Total Realized PnL (USD)", formatCsvDecimal(data.totalRealized, 2)]));
  lines.push(csvRow(["Summary", "Total Unrealized PnL (USD)", formatCsvDecimal(data.totalUnrealized, 2)]));
  lines.push(csvRow(["Summary", "Total PnL (USD)", formatCsvDecimal(data.totalPnL, 2)]));
  lines.push(csvRow(["Summary", "Total Fees (USD)", formatCsvDecimal(data.totalFees, 2)]));
  lines.push(csvRow(["Summary", "Win Rate (%)", formatCsvDecimal(data.winRate, 2)]));
  lines.push(csvRow(["Summary", "Total Trades", data.tradeCount]));
  lines.push("");

  // Positions block
  lines.push(csvRow([
    "Positions: Asset",
    "Issuer",
    "Quantity",
    "Avg Cost Basis (USD)",
    "Current Price (USD)",
    "Current Value (USD)",
    "Unrealized PnL (USD)",
    "Realized PnL (USD)",
  ]));
  for (const p of data.positions) {
    lines.push(csvRow([
      p.asset,
      p.issuer,
      formatCsvDecimal(p.remaining, 7),
      formatCsvDecimal(p.avgCost, 7),
      formatCsvDecimal(p.currentPrice, 7),
      formatCsvDecimal(p.currentValue, 2),
      formatCsvDecimal(p.unrealized, 2),
      formatCsvDecimal(p.realizedPnL, 2),
    ]));
  }
  lines.push("");

  // Trades block
  lines.push(csvRow([
    "Trades: Date (UTC)",
    "Tx Hash",
    "Asset",
    "Side",
    "Quantity",
    "Price (USD)",
    "Cost Basis (USD)",
    "Fee (USD)",
    "Realized PnL (USD)",
    "Source",
  ]));
  for (const t of data.trades) {
    lines.push(csvRow([
      t.date,
      t.txHash,
      t.asset,
      t.type,
      formatCsvDecimal(t.quantity, 7),
      formatCsvDecimal(t.priceUsd, 7),
      formatCsvDecimal(t.costBasisUsd, 7),
      formatCsvDecimal(t.feeUsd, 7),
      formatCsvDecimal(t.pnlNum, 7),
      t.source,
    ]));
  }

  return "\uFEFF" + lines.join("\r\n");
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPnlToCsv(data: StellarPnlResponse): string {
  const csv = generatePnlCsv(data);
  const filename = buildExportFilename(data.address, data.startDate, data.endDate, "csv");
  if (typeof Blob !== "undefined") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    triggerBrowserDownload(blob, filename);
  }
  return csv;
}

export function generatePnlJson(data: StellarPnlResponse): string {
  return JSON.stringify(data, null, 2);
}

export function exportPnlToJson(data: StellarPnlResponse): string {
  const json = generatePnlJson(data);
  const shortAddr = truncateStellarAddress(data.address || "unknown");
  const filename = `stellar-pnl_${shortAddr}_${data.startDate}_to_${data.endDate}.json`;
  if (typeof Blob !== "undefined") {
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    triggerBrowserDownload(blob, filename);
  }
  return json;
}

const USD_FORMAT = "$#,##0.00;-$#,##0.00;$0.00";
const PCT_FORMAT = "0.00%";
const QTY_FORMAT = "0.0000000";

function applyHeaderStyle(row: { eachCell: (cb: (cell: any) => void) => void }): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF111827" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
    cell.alignment = { vertical: "middle" };
  });
}

function applyHairlineBorder(cell: any): void {
  cell.border = {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } },
  };
}

function autoFitColumns(sheet: any, minWidth: number = 12, maxWidth: number = 36): void {
  sheet.columns.forEach((col: any) => {
    let maxLen = minWidth;
    col.eachCell({ includeEmpty: true }, (cell: any) => {
      const val = cell.value;
      const len = val && typeof val === "object" && "formula" in val
        ? 14
        : String(val ?? "").length + 2;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen, maxWidth);
  });
}

/**
 * Builds a 3-tab ExcelJS Workbook with live formulas (zero hardcoded totals)
 * and fullCalcOnLoad = true. Uses dynamic import("exceljs") so core remains lightweight.
 */
export async function buildPnlWorkbook(data: StellarPnlResponse) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;

  const summarySheet = workbook.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const positionsSheet = workbook.addWorksheet("Positions", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const tradesSheet = workbook.addWorksheet("Trades", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // 2. Positions Tab
  const posHeader = positionsSheet.addRow([
    "Asset",
    "Quantity",
    "Avg Cost Basis (USD)",
    "Current Price (USD)",
    "Total Cost Basis (USD)",
    "Current Value (USD)",
    "Unrealized PnL (USD)",
    "Unrealized PnL (%)",
    "Allocation (%)",
  ]);
  applyHeaderStyle(posHeader);

  const posCount = data.positions.length;
  const posLastDataRow = Math.max(2, posCount + 1);

  if (posCount > 0) {
    data.positions.forEach((pos, idx) => {
      const r = idx + 2;
      const row = positionsSheet.addRow([
        pos.asset,
        toSafeNumber(pos.remaining, 0),
        toSafeNumber(pos.avgCost, 0),
        toSafeNumber(pos.currentPrice, 0),
        { formula: `B${r}*C${r}` },
        { formula: `B${r}*D${r}` },
        { formula: `F${r}-E${r}` },
        { formula: `IFERROR(G${r}/E${r},0)` },
        { formula: `IFERROR(F${r}/SUM($F$2:$F$${posLastDataRow}),0)` },
      ]);
      row.eachCell((cell: any, colNum: number) => {
        applyHairlineBorder(cell);
        if (colNum === 2) {
          cell.numFmt = QTY_FORMAT;
          cell.font = { color: { argb: "FF1D4ED8" } };
        } else if (colNum === 3 || colNum === 4) {
          cell.numFmt = USD_FORMAT;
          cell.font = { color: { argb: "FF1D4ED8" } };
        } else if (colNum >= 5 && colNum <= 7) {
          cell.numFmt = USD_FORMAT;
        } else if (colNum === 8 || colNum === 9) {
          cell.numFmt = PCT_FORMAT;
        }
      });
    });
  } else {
    const emptyRow = positionsSheet.addRow([
      "NO_POSITIONS",
      0,
      0,
      0,
      { formula: "B2*C2" },
      { formula: "B2*D2" },
      { formula: "F2-E2" },
      { formula: "IFERROR(G2/E2,0)" },
      { formula: "IFERROR(F2/SUM($F$2:$F$2),0)" },
    ]);
    emptyRow.eachCell((cell: any) => applyHairlineBorder(cell));
  }

  const posTotalRow = positionsSheet.addRow([
    "TOTAL",
    { formula: `SUM(B2:B${posLastDataRow})` },
    null,
    null,
    { formula: `SUM(E2:E${posLastDataRow})` },
    { formula: `SUM(F2:F${posLastDataRow})` },
    { formula: `SUM(G2:G${posLastDataRow})` },
    { formula: `IFERROR(G${posLastDataRow + 1}/E${posLastDataRow + 1},0)` },
    { formula: `SUM(I2:I${posLastDataRow})` },
  ]);
  applyHeaderStyle(posTotalRow);
  posTotalRow.getCell(2).numFmt = QTY_FORMAT;
  posTotalRow.getCell(5).numFmt = USD_FORMAT;
  posTotalRow.getCell(6).numFmt = USD_FORMAT;
  posTotalRow.getCell(7).numFmt = USD_FORMAT;
  posTotalRow.getCell(8).numFmt = PCT_FORMAT;
  posTotalRow.getCell(9).numFmt = PCT_FORMAT;

  // 3. Trades Tab
  const tradesHeader = tradesSheet.addRow([
    "Date (UTC)",
    "Tx Hash",
    "Asset",
    "Side",
    "Quantity",
    "Price (USD)",
    "Cost Basis (USD)",
    "Fee (USD)",
    "Gross Value (USD)",
    "Realized PnL (USD)",
    "Net PnL (USD)",
  ]);
  applyHeaderStyle(tradesHeader);

  const tradeCount = data.trades.length;
  const tradeLastDataRow = Math.max(2, tradeCount + 1);

  if (tradeCount > 0) {
    data.trades.forEach((t, idx) => {
      const r = idx + 2;
      const row = tradesSheet.addRow([
        t.date,
        t.txHash,
        t.asset,
        t.type,
        toSafeNumber(t.quantity, 0),
        toSafeNumber(t.priceUsd, 0),
        toSafeNumber(t.costBasisUsd, 0),
        toSafeNumber(t.feeUsd, 0),
        { formula: `E${r}*F${r}` },
        { formula: `IF(UPPER(D${r})="SELL",(E${r}*F${r})-G${r},0)` },
        { formula: `J${r}-H${r}` },
      ]);
      row.eachCell((cell: any, colNum: number) => {
        applyHairlineBorder(cell);
        if (colNum === 5) {
          cell.numFmt = QTY_FORMAT;
          cell.font = { color: { argb: "FF1D4ED8" } };
        } else if (colNum >= 6 && colNum <= 8) {
          cell.numFmt = USD_FORMAT;
          cell.font = { color: { argb: "FF1D4ED8" } };
        } else if (colNum >= 9) {
          cell.numFmt = USD_FORMAT;
        }
      });
    });
  } else {
    const emptyTradeRow = tradesSheet.addRow([
      data.startDate,
      "",
      "NONE",
      "BUY",
      0,
      0,
      0,
      0,
      { formula: "E2*F2" },
      { formula: 'IF(UPPER(D2)="SELL",(E2*F2)-G2,0)' },
      { formula: "J2-H2" },
    ]);
    emptyTradeRow.eachCell((cell: any) => applyHairlineBorder(cell));
  }

  const tradesTotalRow = tradesSheet.addRow([
    "TOTAL",
    null,
    null,
    null,
    { formula: `SUM(E2:E${tradeLastDataRow})` },
    null,
    { formula: `SUM(G2:G${tradeLastDataRow})` },
    { formula: `SUM(H2:H${tradeLastDataRow})` },
    { formula: `SUM(I2:I${tradeLastDataRow})` },
    { formula: `SUM(J2:J${tradeLastDataRow})` },
    { formula: `SUM(K2:K${tradeLastDataRow})` },
  ]);
  applyHeaderStyle(tradesTotalRow);
  tradesTotalRow.getCell(5).numFmt = QTY_FORMAT;
  tradesTotalRow.getCell(7).numFmt = USD_FORMAT;
  tradesTotalRow.getCell(8).numFmt = USD_FORMAT;
  tradesTotalRow.getCell(9).numFmt = USD_FORMAT;
  tradesTotalRow.getCell(10).numFmt = USD_FORMAT;
  tradesTotalRow.getCell(11).numFmt = USD_FORMAT;

  // 1. Summary Tab (100% formula-driven KPIs)
  const summaryHeader = summarySheet.addRow(["SwiftEx Stellar PnL Summary", "Value"]);
  applyHeaderStyle(summaryHeader);

  summarySheet.addRow(["Wallet Address", data.address]);
  summarySheet.addRow(["Selected Date Range", `${data.startDate} to ${data.endDate}`]);
  summarySheet.addRow(["Exported At (UTC)", new Date().toISOString()]);
  summarySheet.addRow(["", ""]);

  // Row 6: Total Cost Basis
  const rCost = summarySheet.addRow(["Total Cost Basis (USD)", { formula: `SUM(Positions!E2:E${posLastDataRow})` }]);
  rCost.getCell(2).numFmt = USD_FORMAT;

  // Row 7: Current Portfolio Value
  const rVal = summarySheet.addRow(["Current Portfolio Value (USD)", { formula: `SUM(Positions!F2:F${posLastDataRow})` }]);
  rVal.getCell(2).numFmt = USD_FORMAT;

  // Row 8: Total Unrealized PnL
  const rUnreal = summarySheet.addRow(["Total Unrealized PnL (USD)", { formula: `SUM(Positions!G2:G${posLastDataRow})` }]);
  rUnreal.getCell(2).numFmt = USD_FORMAT;

  // Row 9: Total Realized PnL
  const rReal = summarySheet.addRow(["Total Realized PnL (USD)", { formula: `SUM(Trades!J2:J${tradeLastDataRow})` }]);
  rReal.getCell(2).numFmt = USD_FORMAT;

  // Row 10: Total Fees
  const rFees = summarySheet.addRow(["Total Fees (USD)", { formula: `SUM(Trades!H2:H${tradeLastDataRow})` }]);
  rFees.getCell(2).numFmt = USD_FORMAT;

  // Row 11: Net PnL = Realized + Unrealized - Fees
  const rNet = summarySheet.addRow(["Net PnL (USD)", { formula: "B9+B8-B10" }]);
  rNet.getCell(2).numFmt = USD_FORMAT;
  rNet.font = { bold: true };

  // Row 12: Overall PnL %
  const rPct = summarySheet.addRow(["Overall PnL (%)", { formula: "IFERROR(B11/B6,0)" }]);
  rPct.getCell(2).numFmt = PCT_FORMAT;

  // Row 13: Total Trades
  const rCount = summarySheet.addRow([
    "Total Trades",
    tradeCount > 0 ? { formula: `COUNTA(Trades!A2:A${tradeLastDataRow})` } : { formula: "0" },
  ]);
  rCount.getCell(2).numFmt = "#,##0";

  // Row 14: Win Rate
  const rWin = summarySheet.addRow([
    "Win Rate (%)",
    tradeCount > 0
      ? { formula: `IFERROR(COUNTIF(Trades!J2:J${tradeLastDataRow},">0")/COUNTA(Trades!A2:A${tradeLastDataRow}),0)` }
      : { formula: "IFERROR(0/1,0)" },
  ]);
  rWin.getCell(2).numFmt = PCT_FORMAT;

  summarySheet.eachRow((row: any, rowNumber: number) => {
    if (rowNumber > 1) {
      row.eachCell((cell: any) => applyHairlineBorder(cell));
    }
  });

  autoFitColumns(summarySheet, 26, 62);
  autoFitColumns(positionsSheet, 14, 26);
  autoFitColumns(tradesSheet, 14, 28);

  return workbook;
}

export async function exportPnlToXlsx(data: StellarPnlResponse): Promise<Uint8Array> {
  const workbook = await buildPnlWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const filename = buildExportFilename(data.address, data.startDate, data.endDate, "xlsx");

  if (typeof Blob !== "undefined") {
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerBrowserDownload(blob, filename);
  }
  return bytes;
}

