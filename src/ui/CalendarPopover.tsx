import React, { useEffect, useRef, useState } from "react";
import {
  MAX_RANGE_DAYS,
  addUtcDays,
  clampToMaxRange,
  diffUtcDays,
  formatDisplayDateRange,
  getTodayUtc,
  parseUtcDate,
  toUtcIsoDate,
} from "../core/date";
import type { StellarPnlDateRange } from "../core/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export interface CalendarPopoverProps {
  startDate: string;
  endDate: string;
  onChange: (range: StellarPnlDateRange) => void;
}

export const CalendarPopover: React.FC<CalendarPopoverProps> = ({
  startDate,
  endDate,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  const today = getTodayUtc();
  const initialMonth = parseUtcDate(endDate) ?? today;
  const [viewYear, setViewYear] = useState(initialMonth.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth.getUTCMonth());

  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingStart(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPendingStart(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open && anchorRef.current && typeof window !== "undefined") {
      const rect = anchorRef.current.getBoundingClientRect();
      // If right-aligning would clip off left edge of viewport, align left instead
      setAlignLeft(rect.right < 280);
      const activeEnd = parseUtcDate(endDate) ?? getTodayUtc();
      setViewYear(activeEnd.getUTCFullYear());
      setViewMonth(activeEnd.getUTCMonth());
      setPendingStart(null);
    }
    setOpen((prev) => !prev);
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    if (
      nextY > today.getUTCFullYear() ||
      (nextY === today.getUTCFullYear() && nextM > today.getUTCMonth())
    ) {
      return;
    }
    setViewYear(nextY);
    setViewMonth(nextM);
  };

  const canGoNext =
    viewYear < today.getUTCFullYear() ||
    (viewYear === today.getUTCFullYear() && viewMonth < today.getUTCMonth());

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();

  const activeStart = parseUtcDate(startDate);
  const activeEnd = parseUtcDate(endDate);

  const handleDayClick = (dayDate: Date) => {
    if (dayDate.getTime() > today.getTime()) return;

    if (!pendingStart) {
      setPendingStart(dayDate);
      return;
    }

    // Reverse selection & 90-day enforcement handled via clampToMaxRange
    const clamped = clampToMaxRange(pendingStart, dayDate, MAX_RANGE_DAYS, today);
    onChange(clamped);
    setPendingStart(null);
    setOpen(false);
  };

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(Date.UTC(viewYear, viewMonth, d)));
  }

  const minAllowedFromPending = pendingStart ? addUtcDays(pendingStart, -MAX_RANGE_DAYS) : null;
  const maxAllowedFromPending = pendingStart ? addUtcDays(pendingStart, MAX_RANGE_DAYS) : null;

  return (
    <div className="spnl-popover-anchor" ref={anchorRef}>
      <button
        type="button"
        className="spnl-btn spnl-num"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label="Select custom date range"
      >
        {formatDisplayDateRange(startDate, endDate)}
      </button>

      {open && (
        <div
          className={`spnl-popover ${alignLeft ? "spnl-popover--left" : "spnl-popover--right"}`}
          role="dialog"
          aria-label="Date range calendar"
        >
          <div className="spnl-cal-header">
            <button type="button" className="spnl-cal-nav" onClick={goPrevMonth} aria-label="Previous month">
              &lt;
            </button>
            <span className="spnl-cal-month">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              className="spnl-cal-nav"
              onClick={goNextMonth}
              disabled={!canGoNext}
              aria-label="Next month"
            >
              &gt;
            </button>
          </div>

          <div className="spnl-cal-grid">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="spnl-cal-weekday">
                {wd}
              </div>
            ))}

            {cells.map((cellDate, idx) => {
              if (!cellDate) {
                return <div key={`empty-${idx}`} />;
              }

              const ts = cellDate.getTime();
              const isFuture = ts > today.getTime();
              const isBeyondMax =
                pendingStart !== null &&
                ((minAllowedFromPending !== null && ts < minAllowedFromPending.getTime()) ||
                  (maxAllowedFromPending !== null && ts > maxAllowedFromPending.getTime()) ||
                  Math.abs(diffUtcDays(pendingStart, cellDate)) > MAX_RANGE_DAYS);
              const disabled = isFuture || isBeyondMax;

              let isSelected = false;
              let inRange = false;

              if (pendingStart) {
                isSelected = ts === pendingStart.getTime();
              } else if (activeStart && activeEnd) {
                isSelected = ts === activeStart.getTime() || ts === activeEnd.getTime();
                inRange = ts > activeStart.getTime() && ts < activeEnd.getTime();
              }

              return (
                <button
                  key={toUtcIsoDate(cellDate)}
                  type="button"
                  className="spnl-cal-day"
                  disabled={disabled}
                  data-selected={isSelected}
                  data-in-range={inRange}
                  onClick={() => handleDayClick(cellDate)}
                >
                  {cellDate.getUTCDate()}
                </button>
              );
            })}
          </div>

          <div className="spnl-cal-footer">
            <span>{pendingStart ? "Select end date" : "Select start date"}</span>
            <span>Max range: 3 months</span>
          </div>
        </div>
      )}
    </div>
  );
};

