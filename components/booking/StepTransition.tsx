"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type StepTransitionProps = {
  transitionKey: string;
  children: ReactNode;
};

// Lightweight crossfade: when `transitionKey` changes, the outgoing step's
// last-rendered content is frozen and fades/slides out over the new step
// while it fades/slides in underneath. Never delays the actual step change
// itself — BookingFlow's state updates immediately on click; this only
// layers a brief visual transition on top. The outgoing copy is `inert`
// and `aria-hidden` so it can't steal focus or be announced twice.
export default function StepTransition({ transitionKey, children }: StepTransitionProps) {
  const [outgoing, setOutgoing] = useState<{ key: string; node: ReactNode } | null>(null);
  const prevKeyRef = useRef(transitionKey);
  const prevNodeRef = useRef(children);

  useEffect(() => {
    if (prevKeyRef.current !== transitionKey) {
      setOutgoing({ key: prevKeyRef.current, node: prevNodeRef.current });
      prevKeyRef.current = transitionKey;
      const timeout = setTimeout(() => setOutgoing(null), 240);
      return () => clearTimeout(timeout);
    }
  }, [transitionKey, children]);

  useEffect(() => {
    prevNodeRef.current = children;
  });

  return (
    <div className="relative">
      {outgoing && (
        <div
          inert
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-[booking-step-out_0.2s_ease-in_both]"
        >
          {outgoing.node}
        </div>
      )}
      <div key={transitionKey} className="animate-[booking-step-in_0.32s_cubic-bezier(0.16,1,0.3,1)_both]">
        {children}
      </div>
    </div>
  );
}
