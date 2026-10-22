// ManageBookingPage.tsx
// /manage?b=<booking id>&t=<secret> - where the link in a customer's booking email or text
// leads (FR-028). They see their booking and what the salon's policy lets them do with it:
// cancel it, ask to move it to another time, or - when the time is too close, or the salon
// has switched it off - the salon's own message and phone number. Nothing here is a
// permission: the server checks the secret and the policy again on every action.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookingCommandError,
  cancelManagedBooking,
  getManagedBooking,
  listChangeSlots,
  requestBookingChange,
  type ManagedBookingView,
} from "../lib/bookingApi";
import { addDays, todayString } from "../lib/dates";
import { smsDate } from "../lib/sms";
import SiteFooter from "../components/legal/SiteFooter";

type Stage = "loading" | "view" | "confirm-cancel" | "pick" | "done" | "gone";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1.5rem",
};

const button = (primary = false): React.CSSProperties => ({
  padding: "0.8rem 1.4rem",
  border: primary ? "1px solid var(--ink)" : "1px solid var(--border-strong)",
  background: primary ? "var(--ink)" : "transparent",
  color: primary ? "var(--surface)" : "var(--ink)",
  borderRadius: 4,
  fontSize: "var(--text-sm)",
  letterSpacing: "0.04em",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
});

const when = (date: string, time: string): string => `${smsDate(date)} at ${time}`;

const ManageBookingPage = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const bookingId = params.get("b") ?? "";
  const token = params.get("t") ?? "";

  // a link with no booking or secret in it has nothing to look up
  const [stage, setStage] = useState<Stage>(() => (bookingId && token ? "loading" : "gone"));
  const [view, setView] = useState<ManagedBookingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>("");

  // moving
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[] | null>(null);
  const [slotsBusy, setSlotsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await getManagedBooking(bookingId, token));
      setStage("view");
    } catch (err) {
      if (err instanceof BookingCommandError && err.reason === "not-found") setStage("gone");
      else {
        setError(err instanceof BookingCommandError ? err.message : "Something went wrong. Please try again.");
        setStage("view");
      }
    }
  }, [bookingId, token]);

  // The first look, when the page opens (later refreshes go through load(), from the buttons)
  useEffect(() => {
    if (!bookingId || !token) return;
    let cancelled = false;
    getManagedBooking(bookingId, token)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setStage("view");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof BookingCommandError && err.reason === "not-found") setStage("gone");
        else {
          setError(err instanceof BookingCommandError ? err.message : "Something went wrong. Please try again.");
          setStage("view");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, token]);

  const fail = (err: unknown) =>
    setError(err instanceof BookingCommandError ? err.message : "Something went wrong. Please try again, or call the salon.");

  const doCancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelManagedBooking(bookingId, token);
      setDone(view?.status === "pending" ? "Your request has been cancelled." : "Your booking has been cancelled.");
      setStage("done");
    } catch (err) {
      fail(err);
      setStage("view");
      await load();
    }
    setBusy(false);
  };

  const chooseDate = async (value: string) => {
    setDate(value);
    setTimes(null);
    setError(null);
    if (!value) return;
    setSlotsBusy(true);
    try {
      setTimes((await listChangeSlots(bookingId, token, value)).times);
    } catch (err) {
      fail(err);
    }
    setSlotsBusy(false);
  };

  const chooseTime = async (time: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await requestBookingChange(bookingId, token, date, time);
      setDone(
        r.status === "confirmed"
          ? `Done - your booking has moved to ${when(r.date, r.time)}.`
          : `Thanks - we've asked the salon to move your booking to ${when(r.date, r.time)}. Your original time stays until they confirm, and we'll email you.`,
      );
      setStage("done");
    } catch (err) {
      fail(err);
      await chooseDate(date); // the list may have changed
    }
    setBusy(false);
  };

  const today = todayString();

  return (
    <div style={{ minHeight: "100svh", background: "var(--paper)", fontFamily: "var(--font-body)", color: "var(--ink)" }}>
      <header style={{ background: "var(--ink)", height: 60, display: "flex", alignItems: "center", padding: "0 clamp(1rem, 4vw, 1.75rem)" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "var(--surface)", letterSpacing: "0.06em" }}>Sua Hair</span>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "2rem 1rem 4rem" }} data-testid="manage-page">
        {stage === "loading" && <p role="status">Loading your booking...</p>}

        {stage === "gone" && (
          <div style={card} data-testid="manage-gone">
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.6rem", margin: "0 0 0.5rem" }}>We couldn't find that booking</h1>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              The link may be out of date or incomplete. Please call the salon on <a href="tel:0395690840">(03) 9569 0840</a>.
            </p>
          </div>
        )}

        {stage === "view" && !view && (
          <div style={card} role="alert" data-testid="manage-load-error">
            <p style={{ margin: 0 }}>{error ?? "Something went wrong. Please try again."} You can also call the salon on <a href="tel:0395690840">(03) 9569 0840</a>.</p>
          </div>
        )}

        {stage === "done" && (
          <div style={card} data-testid="manage-done">
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.6rem", margin: "0 0 0.5rem" }}>All done</h1>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>{done}</p>
          </div>
        )}

        {view && stage !== "loading" && stage !== "gone" && stage !== "done" && (
          <div style={card}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.6rem", margin: "0 0 0.25rem" }}>
              Hi {view.firstName}
            </h1>
            <p style={{ margin: "0 0 1rem", color: "var(--ink-soft)" }} data-testid="manage-status">
              {view.status === "pending"
                ? view.replacesSummary
                  ? "This is your request to move a booking. The salon hasn't confirmed it yet."
                  : "Your booking request is waiting for the salon to confirm."
                : view.status === "confirmed"
                  ? "Your booking is confirmed."
                  : view.status === "cancelled"
                    ? "This booking has been cancelled."
                    : "This booking is finished."}
            </p>

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", margin: "0 0 1.25rem" }} data-testid="manage-details">
              <dt style={{ color: "var(--ink-muted)" }}>When</dt>
              <dd style={{ margin: 0 }}>{when(view.date, view.time)}</dd>
              <dt style={{ color: "var(--ink-muted)" }}>Service</dt>
              <dd style={{ margin: 0 }}>{view.serviceName}</dd>
              <dt style={{ color: "var(--ink-muted)" }}>Stylist</dt>
              <dd style={{ margin: 0 }}>{view.stylistName}</dd>
            </dl>

            {view.pendingChange && view.status === "confirmed" && (
              <p data-testid="manage-pending-change" style={{ padding: "0.75rem 1rem", border: "1px solid var(--border-strong)", borderRadius: 8 }}>
                You've asked to move this booking to <strong>{when(view.pendingChange.date, view.pendingChange.time)}</strong>. Your original time stays
                until the salon confirms it.
              </p>
            )}

            {error && (
              <p role="alert" data-testid="manage-error" style={{ color: "var(--error)" }}>
                {error}
              </p>
            )}

            {stage === "view" && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  {view.canChange && (
                    <button type="button" style={button(true)} data-testid="manage-change" onClick={() => { setError(null); setStage("pick"); }}>
                      Change the time
                    </button>
                  )}
                  {view.canCancel && (
                    <button type="button" style={button()} data-testid="manage-cancel" onClick={() => { setError(null); setStage("confirm-cancel"); }}>
                      {view.status === "pending" ? "Cancel this request" : "Cancel this booking"}
                    </button>
                  )}
                </div>
                {view.reason && (
                  <p data-testid="manage-reason" style={{ color: "var(--ink-soft)", marginBottom: 0 }}>
                    {view.reason} {(!view.canCancel || !view.canChange) && <>Call <a href="tel:0395690840">{view.salonPhone}</a>.</>}
                  </p>
                )}
                {view.closesAt && view.canCancel && (
                  <p style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)", marginBottom: 0 }}>
                    You can make changes online until {new Date(view.closesAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}.
                  </p>
                )}
              </>
            )}

            {stage === "confirm-cancel" && (
              <div data-testid="manage-confirm-cancel">
                <p style={{ fontWeight: 600 }}>
                  {view.status === "pending" ? "Cancel this request?" : "Cancel this booking?"}
                </p>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <button type="button" style={button(true)} disabled={busy} data-testid="manage-cancel-confirm" onClick={() => void doCancel()}>
                    {busy ? "Cancelling..." : "Yes, cancel it"}
                  </button>
                  <button type="button" style={button()} disabled={busy} onClick={() => setStage("view")}>
                    Keep it
                  </button>
                </div>
              </div>
            )}

            {stage === "pick" && (
              <div data-testid="manage-pick">
                <p style={{ fontWeight: 600, marginTop: 0 }}>Choose a new day and time with {view.stylistName}</p>
                <input
                  type="date"
                  aria-label="New date"
                  data-testid="manage-date"
                  value={date}
                  min={today}
                  max={addDays(today, 90)}
                  onChange={(e) => void chooseDate(e.target.value)}
                  style={{ padding: "0.6rem", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: "var(--text-base)", background: "var(--surface)", color: "var(--ink)" }}
                />
                {slotsBusy && <p role="status">Looking for times...</p>}
                {times && times.length === 0 && (
                  <p data-testid="manage-no-times" style={{ color: "var(--ink-soft)" }}>
                    No times are free with {view.stylistName} that day. Please try another day.
                  </p>
                )}
                {times && times.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: "1rem 0" }} data-testid="manage-times">
                    {times.map((t) => (
                      <button key={t} type="button" style={button()} disabled={busy} data-testid="manage-time" onClick={() => void chooseTime(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <p style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>
                  {view.rescheduleMode === "instant"
                    ? "Your booking moves as soon as you choose a time."
                    : "The salon confirms the new time. Your original time stays until they do."}
                </p>
                <button type="button" style={button()} onClick={() => setStage("view")}>
                  Back
                </button>
              </div>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default ManageBookingPage;
