// WinBackModal.tsx
// "Invite lapsed clients back" (FR-030, DEC-056). The server decides who is on the list: only
// clients who ticked the box to hear from the salon, whose last visit was more than N days ago,
// with nothing booked, not blocked and not invited in the last 60 days - and a stylist sees only
// the clients they may open. Here the sender chooses how long counts as lapsed, unticks anyone
// they would rather not write to, picks email and/or text, and sends. The server checks every
// client again as it sends, and the result says who was reached and who was left out and why.

import { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquareText } from "lucide-react";
import Modal from "../../ui/Modal";
import { fmtDate } from "../../../lib/clientFormat";
import { LAPSED_DAYS } from "../../../lib/clients";
import { WIN_BACK_COOLDOWN_DAYS } from "../../../lib/marketing";
import {
  listWinBackCandidates,
  sendWinBack,
  SKIP_WORDS,
  WinBackError,
  type SkipReason,
  type WinBackList,
  type WinBackSent,
} from "../../../lib/winBackApi";

const MAX_PER_SEND = 100;

interface Props {
  onClose: () => void;
  onNotice: (message: string, kind: "success" | "error") => void;
}

const button = (primary = false): React.CSSProperties => ({
  padding: "0.55rem 1.1rem",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "var(--text-sm)",
  border: primary ? "none" : "1px solid var(--border-strong)",
  background: primary ? "var(--ink)" : "transparent",
  color: primary ? "var(--surface)" : "var(--ink)",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
});

const skippedText = (skipped: WinBackList["skipped"] | WinBackSent["skipped"]): string[] =>
  (Object.entries(skipped) as [SkipReason, number][])
    .filter(([, n]) => n > 0)
    .map(([why, n]) => `${n} ${n === 1 ? "person" : "people"} ${SKIP_WORDS[why]}`);

const WinBackModal = ({ onClose, onNotice }: Props) => {
  const [days, setDays] = useState(LAPSED_DAYS);
  const [list, setList] = useState<WinBackList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<WinBackSent | null>(null);

  // load the list again when the number of days changes (setState only inside the promise)
  useEffect(() => {
    let cancelled = false;
    listWinBackCandidates(days)
      .then((r) => {
        if (cancelled) return;
        setList(r);
        setPicked(new Set(r.candidates.slice(0, MAX_PER_SEND).map((c) => c.id)));
        setError("");
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof WinBackError ? err.message : "Something went wrong. Please try again.");
        setList(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const chosen = useMemo(() => (list?.candidates ?? []).filter((c) => picked.has(c.id)), [list, picked]);
  const emails = email ? chosen.filter((c) => c.canEmail).length : 0;
  const texts = sms ? chosen.filter((c) => c.canText).length : 0;
  const reachable = chosen.filter((c) => (email && c.canEmail) || (sms && c.canText)).length;

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changeDays = (value: number) => {
    setLoading(true);
    setDays(value);
  };

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const ids = chosen.filter((c) => (email && c.canEmail) || (sms && c.canText)).map((c) => c.id);
      const r = await sendWinBack(ids, { email, sms }, days);
      setSent(r);
      onNotice(r.invited === 1 ? "Invited 1 client back." : `Invited ${r.invited} clients back.`, "success");
    } catch (err) {
      setError(err instanceof WinBackError ? err.message : "Something went wrong. Please try again.");
    }
    setSending(false);
  };

  return (
    <Modal title="Invite lapsed clients back" onClose={onClose} width="600px">
      <div data-testid="winback-modal">
        {sent ? (
          <div data-testid="winback-result" role="status">
            <p style={{ marginTop: 0, fontWeight: 600 }}>
              {sent.invited === 0 ? "Nobody was invited." : `Invited ${sent.invited} of ${sent.requested}.`}
            </p>
            <ul style={{ margin: "0 0 1rem", paddingLeft: "1.2rem", color: "var(--ink-soft)", fontSize: "var(--text-sm)" }}>
              <li>
                {sent.emailsSent} {sent.emailsSent === 1 ? "email" : "emails"} sent
              </li>
              <li>
                {sent.textsSent} {sent.textsSent === 1 ? "text" : "texts"} sent
              </li>
              {skippedText(sent.skipped).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <button type="button" style={button(true)} onClick={onClose} data-testid="winback-close">
              Done
            </button>
          </div>
        ) : (
          <>
            <p style={{ marginTop: 0, color: "var(--ink-soft)", fontSize: "var(--text-sm)" }}>
              Only clients who ticked the box to hear from us are listed. Each message has a link to stop them, and nobody is
              invited twice within {WIN_BACK_COOLDOWN_DAYS} days.
            </p>

            <label style={{ display: "block", fontSize: "var(--text-sm)", marginBottom: "0.75rem" }}>
              Haven't been in for{" "}
              <select
                data-testid="winback-days"
                value={days}
                onChange={(e) => changeDays(Number(e.target.value))}
                style={{ padding: "0.3rem", border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)" }}
              >
                {[60, 90, 120, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>

            {loading && <p role="status">Finding clients...</p>}

            {error && (
              <p role="alert" data-testid="winback-error" style={{ border: "1px solid var(--ink)", borderRadius: 8, padding: "0.7rem 0.9rem" }}>
                {error}
              </p>
            )}

            {!loading && list && (
              <>
                {list.candidates.length === 0 ? (
                  <p data-testid="winback-empty" style={{ color: "var(--ink-soft)" }}>
                    No one to invite right now.
                  </p>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", margin: "0 0 0.75rem", fontSize: "var(--text-sm)" }}>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} data-testid="winback-email" />
                        <Mail size={14} aria-hidden="true" /> Email
                      </label>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} data-testid="winback-sms" />
                        <MessageSquareText size={14} aria-hidden="true" /> Text
                      </label>
                      <button
                        type="button"
                        style={{ ...button(), padding: "0.2rem 0.7rem" }}
                        onClick={() => setPicked(new Set(list.candidates.slice(0, MAX_PER_SEND).map((c) => c.id)))}
                      >
                        Tick all
                      </button>
                      <button type="button" style={{ ...button(), padding: "0.2rem 0.7rem" }} onClick={() => setPicked(new Set())}>
                        Untick all
                      </button>
                    </div>

                    <ul
                      aria-label="Clients to invite"
                      style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}
                    >
                      {list.candidates.map((c) => (
                        <li key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <label
                            data-testid="winback-row"
                            style={{ display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.55rem 0.8rem", fontSize: "var(--text-sm)" }}
                          >
                            <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                            <span style={{ flex: 1, fontWeight: 600 }}>{c.name}</span>
                            <span style={{ color: "var(--ink-muted)" }}>
                              last in {fmtDate(c.lastVisit)} · {c.totalVisits} {c.totalVisits === 1 ? "visit" : "visits"}
                            </span>
                            <span style={{ color: "var(--ink-muted)", display: "inline-flex", gap: 4 }}>
                              {c.canEmail && <Mail size={13} aria-label="has email" />}
                              {c.canText && <MessageSquareText size={13} aria-label="can be texted" />}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {list.candidates.length > MAX_PER_SEND && (
                      <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                        Showing everyone, but up to {MAX_PER_SEND} are ticked: invite the rest after this batch.
                      </p>
                    )}
                    <p data-testid="winback-summary" style={{ fontSize: "var(--text-sm)", margin: "0.75rem 0 0" }}>
                      {reachable} {reachable === 1 ? "client" : "clients"} selected: {emails} {emails === 1 ? "email" : "emails"}
                      {" and "}
                      {texts} {texts === 1 ? "text" : "texts"}.
                    </p>
                    {chosen.length > MAX_PER_SEND && (
                      <p role="alert" style={{ fontSize: "var(--text-sm)" }}>
                        Choose {MAX_PER_SEND} or fewer at a time.
                      </p>
                    )}
                  </>
                )}

                {(skippedText(list.skipped).length > 0 || (list.notAgreed ?? 0) > 0) && (
                  <ul
                    data-testid="winback-left-out"
                    style={{ margin: "0.75rem 0 0", paddingLeft: "1.2rem", fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}
                  >
                    {skippedText(list.skipped).map((t) => (
                      <li key={t}>Left out: {t}.</li>
                    ))}
                    {(list.notAgreed ?? 0) > 0 && (
                      <li data-testid="winback-not-agreed">
                        {list.notAgreed} lapsed {list.notAgreed === 1 ? "client has" : "clients have"} not agreed to hear from you, so can't be invited.
                      </li>
                    )}
                  </ul>
                )}

                <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                  The wording is in Manage (Text messages and Emails).
                </p>
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <button type="button" style={button()} onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={{ ...button(true), opacity: reachable === 0 || chosen.length > MAX_PER_SEND || sending ? 0.5 : 1 }}
                    disabled={reachable === 0 || chosen.length > MAX_PER_SEND || sending || (!email && !sms)}
                    onClick={() => void send()}
                    data-testid="winback-send"
                  >
                    {sending ? "Sending..." : `Send to ${reachable}`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default WinBackModal;
