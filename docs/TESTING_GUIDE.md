# Testing guide

How to test everything in this app, from the automatic checks to what a person must do on the real site.
Three levels. Do them in order; each one answers a different question.

| Level | Question it answers | Who/where | Time |
| ----- | ------------------- | --------- | ---- |
| 1. Automatic suite | Does the code do what we wrote down? | Your computer, emulators only | ~10 min per time zone |
| 2. Watch the browser tests | Does it look and behave right to a human eye? | Your computer, emulators only | 5-15 min |
| 3. Hands-on checklist on the real site | Does it work for real people, real email, real phones? | Production, after the deploy steps | 1-2 hours + a day for the 24-hour release |

Levels 1 and 2 never touch your real Firebase project. Only level 3 does, and only after the deploy order in
`DEPLOYMENT.md` (provision the owner, functions, app, rules last).

> **Windows note.** In PowerShell, `npm` and `npx` can be blocked by the execution policy. Use `npm.cmd` / `npx.cmd`
> (for example `npm.cmd run test:unit`), or run the same commands in Git Bash or Command Prompt.

---

## Level 1 - the automatic suite

One command per time zone runs everything and writes a log to `docs/test-runs/`:

```bash
node scripts/run-suite.mjs final utc UTC
node scripts/run-suite.mjs final melbourne Australia/Melbourne
```

It runs, in order: build, lint, unit, rules, security, lockdown, admin, functions, smoke, e2e. Each step prints a
one-line result. **Pass = every step says OK and the last line of each log is `FINISHED` with no `EXIT 1`.**

Both time zones matter: the salon is in Melbourne, the tests must also pass on a machine set to UTC (CI) and, via
`npm run test:unit:tz`, America/Los_Angeles.

Run one part only (while changing code):

| Part | Command | What it covers |
| ---- | ------- | -------------- |
| Unit (no emulator) | `npm run test:unit` | scheduling, phases, conflicts, timeline create, import rules, Melbourne clock |
| Unit under 3 time zones | `npm run test:unit:tz` | clock and daylight-saving logic |
| Firestore rules | `npm run test:rules` | owner / stylist / unprovisioned / anonymous for every collection |
| Security | `npm run test:security` | no personal data leaks to the public |
| Lockdown | `npm run test:lockdown` | the public cannot write bookings, slots, waitlist, notifications |
| Admin writes | `npm run test:admin` | locking, phases, import write and rollback |
| Cloud Functions | `npm run test:functions` | booking commands, pending limit and expiry, blocked clients, rate limits, text-message sending |
| Smoke | `npm run test:smoke` | end-to-end data flow through the rules |
| Browser (e2e) | `npm run test:e2e` | the real screens against the emulators (about 108 tests) |
| One browser spec | `node scripts/e2e.mjs e2e/11-booking-commands.spec.ts` | just that file |

Last recorded counts (both time zones): unit 354, rules 74, security 11, admin 74, functions 111, smoke 5, e2e 108.
If your numbers are higher, that is fine (tests were added); lower or any failure is not.

**If a step says a port is in use (8085, 9099, 5001):** an old emulator is still running. Close it
(`Get-Process java` then stop it, or restart the terminal) and run again.

---

## Level 2 - watch the browser tests

Playwright can drive a visible browser so you can see each scenario happen.

```bash
node scripts/e2e.mjs e2e/11-booking-commands.spec.ts -- --headed
node scripts/e2e.mjs e2e/09-timeline-create.spec.ts -- --headed
```

(`--headed` opens the browser; add `--debug` to step through one action at a time.)

Worth watching, with the scenario ids from `08-test-scenarios.md`:

| Spec | Watch for | Scenarios |
| ---- | --------- | --------- |
| `11-booking-commands` | request received with assigned stylist and exact price; owner approves; two customers race for one slot; legacy "any" booking assigned by the owner; blocked client refused | TC-087 to TC-097 |
| `09-timeline-create` | hover highlight on empty time, drag to set length, click for 30 minutes, touch and keyboard | TC-060 to TC-077 |
| `08-phases` | processing gap, per-booking phase edits, refusals | TC-050 to TC-059 |
| `10-client-import` | dry run counts, import, "Returning client", rollback, stylist cannot see the import | TC-078 to TC-086 |
| `01-customer` | the customer booking flow, validation, calendar | TC-001 to TC-008 |
| `02-admin-today` / `03-admin-pages` | owner Today timeline and Manage | TC-009 to TC-033 |

---

## Level 3 - hands-on checklist on the real site

Do this **after** each deploy step in `DEPLOYMENT.md`, using made-up names and **your own** phone number and email.
Tick each line. Anything that fails: stop, note exactly what you saw, and use the rollback for that step.

### A. Before anything is deployed (nothing changes for users)

- [ ] `provision-roles.ts verify` prints `OK` for the owner account (see `DEPLOYMENT.md` step 1). **Do not go on until it does.**
- [ ] Stylist accounts, if you use them, are provisioned and `verify` is OK for each.
- [ ] You saved a copy of the live Firestore rules and took a Firestore export (backup).

### B. After the functions are deployed (site still the old one)

- [ ] The deploy check in `DEPLOYMENT.md` step 2 returns the expected "Please choose at least one service." message.
- [ ] Firebase console -> Functions lists the booking functions and the 15-minute release job.

### C. After the app is deployed (old rules still live)

- [ ] **Request a booking** on the public site as a made-up customer with your phone and email. You see **"Request received"**
      (not "confirmed"), the **assigned stylist** and the **exact price**.
- [ ] Choose **"Any Available Stylist"**: before sending you see **"from $X"**; afterwards the confirmation names a real stylist and the exact price.
- [ ] Owner (`/admin`) -> **Approvals**: the request is there. **Approve** it: "Booking confirmed", and the "confirmed" email arrives.
- [ ] Make a second request and **Decline** it: the "couldn't confirm" email arrives.
- [ ] **Cancel** the test bookings from the owner side; the slot becomes bookable again on the public site.
- [ ] **Two phones, one slot:** on two devices choose the same stylist, day and time and press Request at the same moment.
      Exactly one succeeds; the other is told the time is no longer available.
- [ ] **Pending limit:** one phone number makes 2 requests; the 3rd is refused with a clear message.
- [ ] **Rules of the house:** try Monday (closed), a time less than 2 hours away, and after 5 pm for today. All refused.
- [ ] **Melbourne time:** set a laptop's time zone to somewhere else (for example Los Angeles) and reload the site. Dates and
      the "too soon" rule still follow Melbourne time.
- [ ] Add a **walk-in** and a **break** from the owner Today page; both appear and block the time.

### D. Owner features on the timeline

- [ ] Hover empty time: a 30-minute block highlights; drag down or up to set the length; release opens the form pre-filled.
      A plain click makes a 30-minute block. Escape cancels. Times in the past or outside hours do not highlight.
- [ ] Keyboard: click the timeline, arrow keys move the highlight, Shift+arrows change the length, Enter opens the form.
- [ ] On a tablet or phone: touch and hold, then drag; a short tap shows a **Create** button.
- [ ] Create a **Digital Perm**: you see solid, hatched (processing), solid (return). Book another client into the gap. The return
      block cannot be booked over.
- [ ] Drag the bottom edge of a phase; a clash is refused with the name of the booking in the way.

### E. After the rules are deployed (last step)

- [ ] The owner reloads `/admin` (sign out and in if asked): Today, Approvals, Bookings, Manage all load. **If not, use the
      lock-out safeguard in `DEPLOYMENT.md`.**
- [ ] `node scripts/verify-lockdown.mjs` ends with **All checks passed**.
- [ ] Another test request on the public site works and can be approved.
- [ ] A **stylist account** signs in and sees only their own schedule, and cannot open Manage or Analytics.
- [ ] A signed-in account that was **never provisioned** sees nothing.

### E2. Clients (after the indexes, functions and rules are live, and Build the client list has been run)

- [ ] **Clients** lists people (most recent visit first); the search box finds a client by a word of their name, by the start of their name, and by the start of their mobile number.
- [ ] Open a client you know: their visits, last visit and spend match your memory; the history shows each booking with the stylist and price.
- [ ] Add a note and pin it; it shows who wrote it. Sign in as a stylist: only their own clients are listed, there is no spend anywhere, and they can add a note but not delete the owner's.
- [ ] Make a test booking request with a made-up name and your own number: a client appears for that number within seconds, and approving it changes their next appointment.
- [ ] Block that test client; try to book again with the same number: "Please call the salon to book". Unblock.
- [ ] Make a second test client with a slightly different name and merge it into the first; the history joins up and the old name is shown as "also seen as".
- [ ] Export one test client's data (a JSON file downloads) and anonymise a test client: their bookings stay as "Deleted Customer" and they no longer appear.

### F. Client import (Manage -> Import clients, owner only)

- [ ] Choose the real Fresha client list. Read the **dry run**: rows, new, already in the app, skipped, merged, and the **blocked
      clients warning**. Check the numbers look sane (about 12,000 clients). **Do not confirm yet.**
- [ ] Download the error report: it holds row numbers and reasons only, no names or numbers.
- [ ] Confirm the import. In the walk-in form type one imported client's number: name fills in, "Returning client" shows.
- [ ] A **blocked** client's number shows the warning in the walk-in form, and a booking request from that number gets
      "Please call the salon to book".
- [ ] Re-run the same file: 0 new. (Optional) **Roll back** the batch, then import again.
- [ ] Delete the downloaded export from your computer.

### G. Email and App Check (only when you set them up)

- [ ] Follow the **Email** section of `DEPLOYMENT.md`; check each message in Resend and in a real inbox (and spam).
- [ ] Follow the **App Check** section; confirm "Verified requests" in the console before turning enforcement on.

### G2. Text messages (only when you set them up)

- [ ] Follow the **Text messages** section of `DEPLOYMENT.md`; every message's **Send me a test** arrives on your phone from your sender name.
- [ ] With texts switched on, a request from your own number gets the "request received" text; approving it gets "confirmed"; declining another gets "not confirmed". Recent texts lists them with the last three digits only.
- [ ] Open that client, press **Stop texts**, make another request: no text. **Allow texts** again.
- [ ] Change a message's wording (use a placeholder button, watch the preview and count), Save, send a test: it uses the new wording.

### H. Things that need time or other devices

- [ ] **24-hour release:** leave one test request pending. Between 24:00 and 24:15 after it was made it should disappear from
      Approvals and the slot should reopen. (Scheduled jobs do not run in the emulators, so this can only be checked live.)
- [ ] **iPhone (Safari)** and **Android (Chrome)**: do the booking flow from start to finish. Most customers use phones.
- [ ] **Screen reader / keyboard only:** tab through the booking page.

---

## If something fails

| What you see | First thing to try |
| ------------ | ------------------ |
| A suite step fails | Open `docs/test-runs/<name>.txt`, search for `FAIL` or `Error`, send me that part |
| Owner cannot open `/admin` after the rules | `DEPLOYMENT.md` lock-out safeguard (sign out and in, `verify`, restore the previous rules) |
| Customers get errors on submit | Rules went out before the app: restore the previous rules, then continue in order |
| Emulator "port in use" | A previous run is still open: close it and re-run |
| `npm` / `npx` blocked in PowerShell | Use `npm.cmd` / `npx.cmd`, or Git Bash |
