// tests/functions/testEmail.test.ts
// The "send me a test" button for the email wording (FR-027) against the Firestore
// emulator, with a recording stand-in for the mail service: it uses the SAVED wording and a
// made-up booking, works while an email is off, validates the address and the kind, is
// limited per hour, and says so in words when the mail service refuses. Fake people only.
import { beforeEach, describe, expect, it } from "vitest";
import { CommandError } from "../../functions/src/commandErrors";
import { sendTestEmailCore, type TestEmail } from "../../functions/src/email/testEmail";
import { LIMITS } from "../../functions/src/limits";
import { adminDb, resetEmulators } from "./adminEnv";
import { NOW } from "./fixtures";

const db = adminDb();

const sent: TestEmail[] = [];
const recorder = async (email: TestEmail) => {
  sent.push(email);
};
const refusing = async () => {
  throw new Error("Resend responded 403: domain not verified");
};

const test = (raw: unknown, send: (e: TestEmail) => Promise<void> = recorder) =>
  sendTestEmailCore(db, send, raw, "editor-uid", NOW);

beforeEach(async () => {
  await resetEmulators();
  sent.length = 0;
});

describe("the test email", () => {
  it("sends the default wording, filled in with a made-up booking, marked TEST", async () => {
    const r = await test({ kind: "confirmed", to: "me@example.test" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("me@example.test");
    expect(sent[0].subject).toBe("TEST: Your booking at Sua Hair Studio — Friday 3 July");
    expect(r.subject).toBe(sent[0].subject);
    expect(sent[0].html).toContain("We look forward to seeing you, Jane");
    expect(sent[0].text).toContain("Price: $95");
  });

  it("uses the saved wording, even while that email is switched off", async () => {
    await db.doc("privateSettings/email").set({
      templates: { reminder: { enabled: false, headline: "Almost time, {name}", showDetails: false } },
    });
    await test({ kind: "reminder", to: " me@example.test " });
    expect(sent[0].html).toContain("Almost time, Jane");
    expect(sent[0].html).not.toContain("Stylist</td>");
    expect(sent[0].to).toBe("me@example.test");
  });

  it("falls back to the default when the saved wording is broken", async () => {
    await db.doc("privateSettings/email").set({ templates: { confirmed: { subject: "Hi {nmae}" } } });
    await test({ kind: "confirmed", to: "me@example.test" });
    expect(sent[0].subject).toContain("Your booking at Sua Hair Studio");
  });

  it("refuses an unknown email, a bad address and an empty request", async () => {
    await expect(test({ kind: "nope", to: "me@example.test" })).rejects.toBeInstanceOf(CommandError);
    await expect(test({ kind: "confirmed", to: "not an email" })).rejects.toMatchObject({ code: "invalid" });
    await expect(test({ kind: "confirmed", to: "a@b" })).rejects.toMatchObject({ code: "invalid" });
    await expect(test({ kind: "confirmed", to: "x".repeat(300) + "@example.test" })).rejects.toMatchObject({ code: "invalid" });
    await expect(test(null)).rejects.toBeInstanceOf(CommandError);
    expect(sent).toHaveLength(0);
  });

  it("is limited per hour", async () => {
    for (let i = 0; i < LIMITS.emailTestPerHour.max; i += 1) await test({ kind: "confirmed", to: "me@example.test" });
    await expect(test({ kind: "confirmed", to: "me@example.test" })).rejects.toMatchObject({ code: "rate-limited" });
  });

  it("says so, in words for the editor, when the mail service refuses", async () => {
    await expect(test({ kind: "confirmed", to: "me@example.test" }, refusing)).rejects.toMatchObject({
      code: "precondition",
      message: expect.stringContaining("sending address"),
    });
  });
});
