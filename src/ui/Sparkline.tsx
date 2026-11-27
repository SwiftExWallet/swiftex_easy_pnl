import React, { useState } from "react";
import { formatUsdFromDecimal, toSafeNumber } from "../core/math";
import type { StellarPnlChartPoint } from "../core/types";

export type SparklineMode = "holdingsValue" | "realizedPnl";

export interface SparklineProps {
  points: StellarPnlChartPoint[];
  isPositive: boolean;
  mode?: SparklineMode;
  onModeChange?: (mode: SparklineMode) => void;
}

export const Sparkline: React.FC<SparklineProps> = ({
  points,
  isPositive,
  mode = "holdingsValue",
  onModeChange,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const width = 240;
  const height = 56;
  const pad = 4;

  const values = points.map((p) =>
    toSafeNumber(mode === "realizedPnl" ? p.realizedPnl : p.holdingsValue, 0)
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const coords = values.map((v, idx) => {
    const x = pad + (idx / (values.length - 1)) * (width - pad * 2);
    const y = span === 0 ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2);
    return { x, y };
  });

  const pathD = coords
    .map((c, idx) => `${idx === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;
  const hoveredCoord = hoverIdx !== null ? coords[hoverIdx] : null;
  const hoveredVal = hovered
    ? mode === "realizedPnl"
      ? hovered.realizedPnl
      : hovered.holdingsValue
    : null;

  return (
    <div className="spnl-spark-outer">
      {onModeChange && (
        <div className="spnl-spark-modes" role="group" aria-label="Chart metric">
          <button
            type="button"
            className="spnl-mini-btn"
            data-active={mode === "holdingsValue"}
            onClick={() => onModeChange("holdingsValue")}
          >
            Value
          </button>
          <button
            type="button"
            className="spnl-mini-btn"
            data-active={mode === "realizedPnl"}
            onClick={() => onModeChange("realizedPnl")}
          >
            Realized PnL
          </button>
        </div>
      )}
      <div
        className="spnl-spark-wrap"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {hovered && hoveredVal !== null && (
          <div className="spnl-spark-tooltip spnl-num">
            {hovered.date}: {formatUsdFromDecimal(hoveredVal)}
          </div>
        )}
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={mode === "realizedPnl" ? "Realized PnL trend" : "Portfolio value trend"}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const ratio = rect.width > 0 ? relX / rect.width : 0;
            const idx = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
            setHoverIdx(idx);
          }}
        >
          <path
            d={pathD}
            fill="none"
            stroke={isPositive ? "var(--spnl-positive)" : "var(--spnl-negative)"}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {hoveredCoord && (
            <>
              <line
                x1={hoveredCoord.x}
                y1={pad}
                x2={hoveredCoord.x}
                y2={height - pad}
                stroke="var(--spnl-border)"
                strokeWidth="1"
              />
              <circle
                cx={hoveredCoord.x}
                cy={hoveredCoord.y}
                r="3"
                fill={isPositive ? "var(--spnl-positive)" : "var(--spnl-negative)"}
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
};
