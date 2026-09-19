// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useDeepCleaningNotice } from "./useDeepCleaningNotice";
import type { CleaningTypeId } from "@/lib/booking/types";

afterEach(() => {
  cleanup();
});

type Props = { cleaningType: CleaningTypeId | null; notes: string };

function setup(initial: Props) {
  const onSubmit = vi.fn();
  const onSwitchToDeep = vi.fn();
  const hook = renderHook((props: Props) => useDeepCleaningNotice({ ...props, onSubmit, onSwitchToDeep }), {
    initialProps: initial,
  });
  return { hook, onSubmit, onSwitchToDeep };
}

const TRIGGER_NOTES = "Please DEEP CLEAN the bathrooms";

describe("useDeepCleaningNotice", () => {
  it("Standard + trigger phrase: intercepts submit, opens the notice, and does NOT submit", () => {
    const { hook, onSubmit } = setup({ cleaningType: "standard", notes: "floors need deep cleaning" });
    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Standard + ordinary notes: submits straight through, no notice", () => {
    const { hook, onSubmit } = setup({ cleaningType: "standard", notes: "Please pay extra attention to the kitchen" });
    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Deep Cleaning + 'deep clean the floors': no mismatch notice", () => {
    const { hook, onSubmit } = setup({ cleaningType: "deep", notes: "deep clean the floors" });
    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Keep Standard: closes the notice and proceeds with submission without changing the service", () => {
    const { hook, onSubmit, onSwitchToDeep } = setup({ cleaningType: "standard", notes: TRIGGER_NOTES });
    act(() => hook.result.current.requestSubmit());
    act(() => hook.result.current.keepStandard());
    expect(hook.result.current.isOpen).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSwitchToDeep).not.toHaveBeenCalled();
  });

  it("Keep Standard: does not immediately re-warn for the unchanged service + notes", () => {
    const { hook, onSubmit } = setup({ cleaningType: "standard", notes: TRIGGER_NOTES });
    act(() => hook.result.current.requestSubmit());
    act(() => hook.result.current.keepStandard());
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // e.g. the first submission failed and the customer tries again.
    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("dismissing the notice without choosing does NOT count as keeping Standard and does not submit", () => {
    const { hook, onSubmit, onSwitchToDeep } = setup({ cleaningType: "standard", notes: TRIGGER_NOTES });
    act(() => hook.result.current.requestSubmit());
    act(() => hook.result.current.dismiss());
    expect(hook.result.current.isOpen).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSwitchToDeep).not.toHaveBeenCalled();

    // Trying to submit again must warn again — dismissal recorded nothing.
    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Switch to Deep: applies the switch once, closes the notice, and does not auto-submit", () => {
    const { hook, onSubmit, onSwitchToDeep } = setup({ cleaningType: "standard", notes: TRIGGER_NOTES });
    act(() => hook.result.current.requestSubmit());
    act(() => hook.result.current.switchToDeep());
    expect(onSwitchToDeep).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isOpen).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();

    // Once the booking is Deep, the customer can continue without any mismatch notice.
    hook.rerender({ cleaningType: "deep", notes: TRIGGER_NOTES });
    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("re-evaluates when the notes materially change after Keep Standard", () => {
    const { hook, onSubmit } = setup({ cleaningType: "standard", notes: TRIGGER_NOTES });
    act(() => hook.result.current.requestSubmit());
    act(() => hook.result.current.keepStandard());
    expect(onSubmit).toHaveBeenCalledTimes(1);

    hook.rerender({ cleaningType: "standard", notes: `${TRIGGER_NOTES}, and please deep clean the oven` });
    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("re-evaluates after a Standard -> other -> Standard cleaning-type round trip once the acknowledgement is reset", () => {
    const { hook, onSubmit } = setup({ cleaningType: "standard", notes: TRIGGER_NOTES });
    act(() => hook.result.current.requestSubmit());
    act(() => hook.result.current.keepStandard());
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // BookingFlow calls resetAcknowledgement() whenever the cleaning type actually changes.
    hook.rerender({ cleaningType: "move-out", notes: TRIGGER_NOTES });
    act(() => hook.result.current.resetAcknowledgement());
    hook.rerender({ cleaningType: "standard", notes: TRIGGER_NOTES });

    act(() => hook.result.current.requestSubmit());
    expect(hook.result.current.isOpen).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
