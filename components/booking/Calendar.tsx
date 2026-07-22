"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  fromDateKey,
  getMaxSelectableDate,
  getMinSelectableDate,
  isDateSelectable,
  toDateKey,
} from "@/lib/booking/schedule";

type CalendarProps = {
  selectedDateKey: string | null;
  onSelect: (dateKey: string) => void;
  unavailableDateKeys: string[];
  /** Overridable for tests; defaults to the real current date. */
  today?: Date;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Lightweight, dependency-free month-grid calendar. Deliberately custom
// rather than a calendar library — the project has no such dependency
// today and this UI is simple enough (single month grid, single date
// selection) not to warrant one. Supports month/year-boundary navigation,
// a min/max selectable range, a list of disabled ("unavailable") dates,
// and roving-tabindex keyboard navigation (arrow keys move focus day by
// day, crossing month boundaries automatically; Enter/Space selects the
// focused day if it's enabled).
export default function Calendar({ selectedDateKey, onSelect, unavailableDateKeys, today }: CalendarProps) {
  const referenceToday = useMemo(() => today ?? new Date(), [today]);
  const minDate = useMemo(() => getMinSelectableDate(referenceToday), [referenceToday]);
  const maxDate = useMemo(() => getMaxSelectableDate(referenceToday), [referenceToday]);

  const initialFocusDate = selectedDateKey ? fromDateKey(selectedDateKey) : minDate;

  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(initialFocusDate));
  const [focusedDateKey, setFocusedDateKey] = useState(() => toDateKey(initialFocusDate));
  const dayButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (shouldRestoreFocusRef.current) {
      dayButtonRefs.current.get(focusedDateKey)?.focus();
      shouldRestoreFocusRef.current = false;
    }
  }, [focusedDateKey, visibleMonth]);

  const canGoPrevMonth = !isSameMonth(visibleMonth, startOfMonth(minDate)) && visibleMonth > startOfMonth(minDate);
  const canGoNextMonth = !isSameMonth(visibleMonth, startOfMonth(maxDate)) && visibleMonth < startOfMonth(maxDate);

  const goToMonth = (next: Date) => {
    setVisibleMonth(startOfMonth(next));
  };

  const moveFocus = (days: number) => {
    const current = focusedDateKey ? fromDateKey(focusedDateKey) : minDate;
    const next = addDays(current, days);
    shouldRestoreFocusRef.current = true;
    setFocusedDateKey(toDateKey(next));
    if (!isSameMonth(next, visibleMonth)) {
      setVisibleMonth(startOfMonth(next));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, dateKey: string, selectable: boolean) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-7);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(7);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (selectable) onSelect(dateKey);
        break;
      default:
        break;
    }
  };

  // Build the visible grid: leading blanks to align the 1st on its
  // weekday, then one cell per day of the month.
  const firstWeekday = visibleMonth.getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date; dateKey: string } | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), i + 1);
      return { date, dateKey: toDateKey(date) };
    }),
  ];

  const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="rounded-2xl border border-[#E7DECE] bg-white p-5 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)] sm:p-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => canGoPrevMonth && goToMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
          disabled={!canGoPrevMonth}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#3B2F27] transition-colors duration-150 hover:bg-[#F1E9DC] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="font-heading text-lg text-[#3B2F27]" aria-live="polite">
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={() => canGoNextMonth && goToMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
          disabled={!canGoNextMonth}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#3B2F27] transition-colors duration-150 hover:bg-[#F1E9DC] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div role="group" aria-label="Choose an appointment date" className="mt-4">
        <div className="grid grid-cols-7 gap-1" aria-hidden="true">
          {WEEKDAY_LABELS.map((day) => (
            <div key={day} className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-[#B9AC9B]">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => {
            if (!cell) return <div key={`blank-${index}`} aria-hidden="true" />;

            const { date, dateKey } = cell;
            const selectable = isDateSelectable(date, { today: referenceToday, unavailableDateKeys });
            const isSelected = selectedDateKey === dateKey;
            const isFocusTarget = focusedDateKey === dateKey;
            const readableLabel = date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });

            return (
              <button
                key={dateKey}
                ref={(el) => {
                  if (el) dayButtonRefs.current.set(dateKey, el);
                  else dayButtonRefs.current.delete(dateKey);
                }}
                type="button"
                aria-label={readableLabel}
                aria-current={isSelected ? "date" : undefined}
                aria-disabled={!selectable}
                tabIndex={isFocusTarget ? 0 : -1}
                disabled={!selectable}
                onFocus={() => setFocusedDateKey(dateKey)}
                onClick={() => selectable && onSelect(dateKey)}
                onKeyDown={(event) => handleKeyDown(event, dateKey, selectable)}
                className={`aspect-square rounded-full text-sm font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27] ${
                  isSelected
                    ? "bg-[#3B2F27] text-white shadow-[0_4px_12px_-4px_rgba(59,47,39,0.4)]"
                    : selectable
                      ? "text-[#3B2F27] hover:bg-[#F1E9DC]"
                      : "cursor-not-allowed text-[#D9CCB8] line-through decoration-1"
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
