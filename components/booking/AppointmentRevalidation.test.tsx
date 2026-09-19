// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReviewStep from "./steps/ReviewStep";
import StartTimeStep from "./steps/StartTimeStep";
import DeepCleaningNoticeDialog from "./DeepCleaningNoticeDialog";
import { useAppointmentRevalidation } from "./useAppointmentRevalidation";
import { useDeepCleaningNotice } from "./useDeepCleaningNotice";
import { calculateEstimate } from "@/lib/booking/calculate";
import { getAllExactStartTimeCandidates } from "@/lib/booking/schedule";
import { initialBookingState, initialExtrasState, type BookingState } from "@/lib/booking/types";

// Base home: 2 BR (150) + 2 BA (60) + 1,001–2,000 sq ft (15), Standard = 225 min.
//   sq ft: up to 1,000 = 210 | 1,001–2,000 = 225 | 2,001–3,000 = 230 | 3,001–4,000 = 235
//   + oven (+30) = 255 | 3 BR instead of 2 BR (+30) | Deep Cleaning (+90) = 315
// A start time fits when start + duration <= 20:00 (16:00 fits <= 240 min; 15:00 fits <= 300 min), so e.g.:
//   16:00 fits 225 but not 255 | 15:00 fits 225 but not 315 | 9:00 AM fits everything here.
const ALL_TIMES = getAllExactStartTimeCandidates();

function baseState(overrides: Partial<BookingState> = {}): BookingState {
  return {
    ...initialBookingState,
    propertyType: "apartment",
    squareFootage: "1001-2000",
    bedrooms: "2",
    bathrooms: "2",
    cleaningType: "standard",
    extras: { ...initialExtrasState, noExtras: true },
    frequency: "one-time",
    zipCode: "07030",
    appointmentDate: "2026-12-01",
    serviceStartTime: "13:00",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "5551234567",
    addressStreet: "123 Main St",
    addressCity: "Hoboken",
    addressState: "New Jersey",
    addressZip: "07030",
    someoneHome: "home",
    agreedToPolicy: true,
    setupIntentId: "seti_test",
    ...overrides,
  };
}

const onChooseNewTime = vi.fn();
const onSubmit = vi.fn();

// Mirrors BookingFlow's wiring: the same revalidation hook clearing the
// selected time, the same Review props, the same Standard->Deep safeguard.
function Harness({ initial }: { initial: BookingState }) {
  const [state, setState] = useState(initial);
  const estimate = useMemo(() => calculateEstimate(state), [state]);
  const [noLongerFits, setNoLongerFits] = useState(false);
  const revalidation = useAppointmentRevalidation({
    appointmentDate: state.appointmentDate,
    serviceStartTime: state.serviceStartTime,
    durationMinutes: estimate?.totalDurationMinutes ?? null,
    onInvalidated: () => {
      setState((s) => ({ ...s, serviceStartTime: null }));
      setNoLongerFits(true);
    },
  });
  const gate = useDeepCleaningNotice({
    cleaningType: state.cleaningType,
    notes: state.specialInstructions,
    onSubmit,
    onSwitchToDeep: () => setState((s) => ({ ...s, cleaningType: "deep" })),
  });
  return (
    <>
      <ReviewStep
        state={state}
        estimate={estimate}
        onEdit={() => {}}
        onAgreedChange={() => {}}
        submission={{ status: "idle" }}
        onSubmit={gate.requestSubmit}
        appointmentNoLongerFits={noLongerFits && !state.serviceStartTime}
        appointmentCheckPending={revalidation.isChecking}
        onChooseNewTime={onChooseNewTime}
        onPickNewDate={() => {}}
        onRedoPayment={() => {}}
        honeypot=""
        onHoneypotChange={() => {}}
        onBack={() => {}}
      />
      <button type="button" onClick={() => setState((s) => ({ ...s, squareFootage: "1001-2000" }))}>set-sqft-1001</button>
      <button type="button" onClick={() => setState((s) => ({ ...s, squareFootage: "2001-3000" }))}>set-sqft-2001</button>
      <button type="button" onClick={() => setState((s) => ({ ...s, squareFootage: "3001-4000" }))}>set-sqft-3001</button>
      <button type="button" onClick={() => setState((s) => ({ ...s, bedrooms: "3" }))}>set-bedrooms-3</button>
      <button type="button" onClick={() => setState((s) => ({ ...s, cleaningType: "deep" }))}>set-deep</button>
      <button type="button" onClick={() => setState((s) => ({ ...s, cleaningType: "standard" }))}>set-standard</button>
      <button type="button" onClick={() => setState((s) => ({ ...s, extras: { ...s.extras, noExtras: false, oven: true } }))}>add-oven</button>
      {gate.isOpen && (
        <DeepCleaningNoticeDialog onSwitchToDeep={gate.switchToDeep} onKeepStandard={gate.keepStandard} onDismiss={gate.dismiss} />
      )}
    </>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

function availableTimesResponse(times: string[]) {
  return Promise.resolve({ json: () => Promise.resolve({ ok: true, availableStartTimes: times }) } as Response);
}

beforeEach(() => {
  onChooseNewTime.mockReset();
  onSubmit.mockReset();
  fetchMock = vi.fn(() => availableTimesResponse(ALL_TIMES));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const appointmentTime = () => screen.getByText("Appointment time").nextElementSibling?.textContent;
const banner = () => screen.queryByText(/needs a longer visit/i);
const submitButton = () => screen.getByRole("button", { name: /submit booking request|checking your appointment/i }) as HTMLButtonElement;

describe("selected appointment vs. a duration increase", () => {
  it("A. duration increases but the selected time still fits → the appointment is preserved", async () => {
    render(<Harness initial={baseState({ serviceStartTime: "13:00" })} />);
    expect(appointmentTime()).toBe("1:00 PM");

    click("set-sqft-3001"); // 225 -> 235 min; 13:00 + 3 h 55 = 16:55
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); // best-effort live check ran…
    await waitFor(() => expect(submitButton().disabled).toBe(false)); // …and finished
    expect(appointmentTime()).toBe("1:00 PM");
    expect(banner()).toBeNull();
  });

  it("B. duration increases and the time would now finish after 8 PM → the appointment is invalidated and a new time is required", () => {
    render(<Harness initial={baseState({ serviceStartTime: "16:00" })} />); // 16:00 + 225 = 19:45, fits
    expect(appointmentTime()).toBe("4:00 PM");

    click("add-oven"); // +30 -> 255 min -> 16:00 + 4 h 15 = 20:15
    expect(appointmentTime()).toBe("—"); // cleared, not silently swapped
    expect(banner()).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled(); // decided by the centralized duration rule, no network needed
  });

  it("B. a time that ends exactly at 8:00 PM is still valid and is preserved", async () => {
    render(<Harness initial={baseState({ serviceStartTime: "16:00", squareFootage: "up-to-1000" })} />); // 210 min: ends 19:30
    click("set-bedrooms-3"); // +30 -> 240 min -> 16:00 + 4 h = 20:00 exactly, still fits
    expect(appointmentTime()).toBe("4:00 PM");
    expect(banner()).toBeNull();
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });

  it("C. Standard → Deep via the safeguard: a late time that can't finish by 8 PM is invalidated, the customer is told, and submit is blocked", () => {
    render(<Harness initial={baseState({ serviceStartTime: "15:00", specialInstructions: "floors need deep cleaning" })} />);
    click("Submit Booking Request");
    click("Switch to Deep Cleaning (+$100)"); // 315 min -> 15:00 + 5 h 15 = 20:15

    expect(screen.getByText("Deep cleaning")).toBeTruthy(); // the service switched exactly as requested
    expect(appointmentTime()).toBe("—");
    expect(banner()).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled(); // never reaches the server with a stale time

    fireEvent.click(screen.getByRole("button", { name: "Choose a new appointment time" }));
    expect(onChooseNewTime).toHaveBeenCalledTimes(1);
  });

  it("C. Standard → Deep via the safeguard keeps an early time that still fits", async () => {
    render(<Harness initial={baseState({ serviceStartTime: "09:00", specialInstructions: "floors need deep cleaning" })} />);
    click("Submit Booking Request");
    click("Switch to Deep Cleaning (+$100)");
    expect(screen.getByText("Deep cleaning")).toBeTruthy();
    expect(appointmentTime()).toBe("9:00 AM");
    expect(banner()).toBeNull();
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });

  it("D. a square-footage duration increase invalidates a time that no longer fits (and only that)", () => {
    // 3 BR + 2 BA, up to 1,000 sq ft = 240 min: a 4:00 PM start ends exactly at 8:00 PM.
    render(<Harness initial={baseState({ serviceStartTime: "16:00", squareFootage: "up-to-1000", bedrooms: "3" })} />);
    expect(appointmentTime()).toBe("4:00 PM");
    click("set-sqft-3001"); // +25 min -> 265 -> 16:00 + 4 h 25 = 20:25
    expect(appointmentTime()).toBe("—");
    expect(banner()).toBeTruthy();
  });

  it("an increase from another duration-affecting selection (Bedrooms) is revalidated the same way", () => {
    render(<Harness initial={baseState({ serviceStartTime: "16:00", squareFootage: "3001-4000" })} />); // 235 min, ends 19:55
    click("set-bedrooms-3"); // +30 -> 265 -> ends 20:25
    expect(appointmentTime()).toBe("—");
    expect(banner()).toBeTruthy();
  });

  it("E. a duration decrease never clears a still-valid appointment, and makes no availability request", async () => {
    render(<Harness initial={baseState({ serviceStartTime: "15:00", squareFootage: "3001-4000" })} />); // 235 min
    click("set-sqft-1001"); // 235 -> 225
    expect(appointmentTime()).toBe("3:00 PM");
    expect(banner()).toBeNull();
    expect(submitButton().disabled).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 450)); // past the debounce window
    expect(fetchMock).not.toHaveBeenCalled();
    expect(appointmentTime()).toBe("3:00 PM");
  });

  it("E. returning to a duration the appointment already fit makes no new request and keeps the appointment", async () => {
    render(<Harness initial={baseState({ serviceStartTime: "15:00", squareFootage: "3001-4000" })} />); // verified at 235 min
    click("set-sqft-1001"); // 225
    click("set-sqft-3001"); // back to 235 — the appointment already fit that
    expect(appointmentTime()).toBe("3:00 PM");
    expect(submitButton().disabled).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("E. Deep → Standard likewise leaves a valid appointment untouched", () => {
    render(<Harness initial={baseState({ serviceStartTime: "13:00", cleaningType: "deep" })} />);
    click("set-standard");
    expect(appointmentTime()).toBe("1:00 PM");
    expect(banner()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("best-effort live availability layer", () => {
  it("invalidates the selection when the existing available-times endpoint no longer lists it (e.g. the longer visit now collides with other bookings)", async () => {
    fetchMock.mockImplementation(() => availableTimesResponse(ALL_TIMES.filter((t) => t !== "13:00")));
    render(<Harness initial={baseState({ serviceStartTime: "13:00" })} />);
    click("set-sqft-3001");
    await waitFor(() => expect(appointmentTime()).toBe("—"));
    expect(banner()).toBeTruthy();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/booking/available-times");
    expect(url).toContain("date=2026-12-01");
    expect(url).toContain("durationMinutes=235");
  });

  it("keeps the selection when the check fails (server re-validation at submit stays the final authority)", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("network down")));
    render(<Harness initial={baseState({ serviceStartTime: "13:00" })} />);
    click("set-sqft-3001");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(appointmentTime()).toBe("1:00 PM");
    expect(banner()).toBeNull();
  });

  it("keeps the selection when the endpoint is throttled (ok: false)", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ json: () => Promise.resolve({ ok: false, message: "Too many requests." }) } as Response));
    render(<Harness initial={baseState({ serviceStartTime: "13:00" })} />);
    click("set-sqft-3001");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(appointmentTime()).toBe("1:00 PM");
  });

  it("collapses rapid consecutive increases into a single request for the latest duration", async () => {
    render(<Harness initial={baseState({ serviceStartTime: "09:00" })} />);
    click("set-sqft-2001");
    click("set-sqft-3001");
    click("add-oven");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain("durationMinutes=265"); // 235 + oven 30
  });

  it("Submit is disabled with a 'Checking your appointment…' label only while the live re-check is pending", async () => {
    render(<Harness initial={baseState({ serviceStartTime: "09:00" })} />);
    click("set-sqft-3001");
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toBe("Checking your appointment…");
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(submitButton().textContent).toBe("Submit Booking Request");
  });
});

describe("routing back to the existing time step", () => {
  it("StartTimeStep explains why the customer is choosing again, then offers the existing live list", async () => {
    vi.stubGlobal("fetch", vi.fn(() => availableTimesResponse(["09:00", "10:00"])));
    render(<StartTimeStep value={null} appointmentDate="2026-12-01" estimatedDurationMinutes={315} timeNoLongerFits onSelect={() => {}} onBack={() => {}} />);
    expect(screen.getByRole("status").textContent).toMatch(/needs a longer visit/i);
    await waitFor(() => expect(screen.getByRole("radio", { name: "9:00 AM" })).toBeTruthy());
    expect(screen.getByRole("radio", { name: "10:00 AM" })).toBeTruthy();
  });

  it("StartTimeStep shows no notice in the normal first-time path", () => {
    vi.stubGlobal("fetch", vi.fn(() => availableTimesResponse(["09:00"])));
    render(<StartTimeStep value={null} appointmentDate="2026-12-01" estimatedDurationMinutes={225} onSelect={() => {}} onBack={() => {}} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
