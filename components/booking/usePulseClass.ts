"use client";

import { useEffect, useRef, useState } from "react";

// Returns `animationClass` for a brief moment whenever `value` changes, then
// reverts to "". Used to replay a CSS "pop" animation on live-updating
// numbers (price, duration, quantity) without ever changing the element's
// `key` — a `key`-based remount here was found to leave a stale duplicate
// node frozen at the first-ever value in dev mode, so this toggles a class
// on the same persistent DOM node instead.
export function usePulseClass(value: string | number, animationClass: string, durationMs = 300): string {
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setPulsing(true);
      const timeout = setTimeout(() => setPulsing(false), durationMs);
      return () => clearTimeout(timeout);
    }
  }, [value, durationMs]);

  return pulsing ? animationClass : "";
}
