# Deployment — the trust-boundary release

Branch `trust-boundary`. Production Firebase project: `sua-hair-ae353`. The site is on Vercel (auto-deploys `main`). **Nothing in this release has been deployed or run against the real project by the developer** — every test ran against emulators. Follow the order below exactly; each step says how to check it and how to undo it.

## What changes in production

| Piece | Before | After |
| ----- | ------ | ----- |
| Who is "staff" | any signed-in account | **owner** / **stylist** by custom claim; an unprovisioned account has no access |
| Online bookings | the browser wrote `bookings` + `slotBlocks` directly | **`createBookingRequest`** function validates, prices, assigns a stylist, holds the slot |
| Approve / decline / cancel / restore | browser writes | `approveBooking` / `declineBooking` / `cancelBooking` / `restoreBooking` functions (slot re-checked under the lock) |
| Pending requests | held forever, "confirmed" wording | hold the slot for **24 hours**, then released; wording is "request received" |
| Waitlist, notifications | anonymous browser writes | `joinWaitlist` function (rate limited); notifications written by the functions |
| Time zone | the visitor's clock | **Australia/Melbourne** everywhere |

## Order: provision → functions (+ indexes) → app → rules

```
1. Provision the owner (and stylists) and VERIFY      ← before anything else; changes nothing users see
2. Deploy indexes + functions                         ← new callables and the 15-minute release job
3. Deploy the app (merge to main; Vercel)             ← starts calling the functions
4. Deploy the rules LAST                              ← closes the direct writes
```

Rules go last on purpose. If the rules went first, the **old** site (which still writes bookings directly) would break for every customer, and the owner's accounts would lose admin access until provisioned. With this order, every intermediate state works: after step 2 nothing changes for anyone; after step 3 the new site uses the functions while the old rules are still in place (harmless); step 4 only removes what nothing uses any more.

A customer who left the **old** page open across step 4 will get an error on submit and should reload (the form says to call the salon). Do step 4 at a quiet time.

### 0. Before you start

- `firebase login` as an owner of the project; `firebase use sua-hair-ae353`.
- For the provisioning script, Application Default Credentials: either `gcloud auth application-default login` (as a project owner) or point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account key file (keep it out of git).
- `npm ci` in the repo root **and** in `functions/`.
- **Save the live rules first.** Firebase console → Firestore Database → Rules → copy the text into a file outside the repo (`rules-before-<date>.txt`). Rollback for step 4 uses it. (The console also keeps a history of published versions you can restore.)
- Take a Firestore export (backup) — console → Firestore → Import/Export, or `gcloud firestore export gs://<bucket>/pre-trust-boundary`.
- Make a list of every sign-in account (console → Authentication → Users) and decide who is the owner and who is a stylist. **Every account you do not provision loses all access at step 4.**

### 1. Provision the owner (and stylists), then verify — BEFORE the rules change

Roles are **custom claims** on the sign-in token, written only by the Admin SDK. The script also writes the `users/{uid}` record (which the *old* rules read), so provisioning is safe to do while the old rules are live — it changes nothing for anyone.

```bash
# See what would happen (writes nothing)
npx tsx functions/scripts/provision-roles.ts grant --project sua-hair-ae353 --email <owner-email> --role owner --dry-run

# Do it
npx tsx functions/scripts/provision-roles.ts grant --project sua-hair-ae353 --email <owner-email> --role owner

# Stylist accounts: --stylist is the document id in the `stylists` collection (e.g. steve, yuto)
npx tsx functions/scripts/provision-roles.ts grant --project sua-hair-ae353 --email <stylist-email> --role stylist --stylist <stylistId>

# VERIFY: exits non-zero if the claim or the record is missing or they disagree
npx tsx functions/scripts/provision-roles.ts verify --project sua-hair-ae353 --email <owner-email> --role owner

# Everyone who has a role
npx tsx functions/scripts/provision-roles.ts list --project sua-hair-ae353
```

**Do not continue until `verify` prints `OK` for the owner.** The script refuses to remove the last owner or let an owner demote themself. After the rules are live, further changes can be made by the owner through the `setUserRole` function, or by re-running the script.

The new claim reaches a browser on its next token refresh (the app forces one if it finds no role), or when the person signs out and in. **Ask the owner to sign out and back in once after provisioning** and confirm `/admin` still opens.

*Rollback:* `npx tsx functions/scripts/provision-roles.ts rollback --project sua-hair-ae353` removes the claims from every account and keeps the `users/{uid}` records, so the previous rules (which read `users/{uid}`) work exactly as before.

### 2. Deploy indexes and functions

```bash
# one-time config the functions need
firebase functions:secrets:set RESEND_API_KEY          # the Resend API key
#   EMAIL_FROM is prompted at deploy, or put it in functions/.env:
#   EMAIL_FROM="Sua Hair Studio <bookings@your-verified-domain.com.au>"
#   (the domain must be verified in Resend, or no mail is delivered)
# ENFORCE_APP_CHECK stays false until the App Check steps below are done.

firebase deploy --only firestore:indexes      # the (status, holdExpiresAt) index for the 24-hour release job
firebase deploy --only functions
```

The indexes take a few minutes to build; wait for them to finish (console → Firestore → Indexes → "Enabled") before relying on the release job. Functions deploy to `australia-southeast1` (callables, scheduled jobs) and `australia-southeast2` (Firestore triggers), next to the database.

Turn on automatic clean-up of the rate-limit counters (one-time, harmless to skip — they are a few bytes each):

```bash
gcloud firestore fields ttls update expireAt --collection-group=rateLimits --enable-ttl --project=sua-hair-ae353
```

*Check:* console → Functions lists `createBookingRequest`, `joinWaitlist`, `approveBooking`, `declineBooking`, `cancelBooking`, `restoreBooking`, `assignStylist`, `setUserRole`, `deleteCustomerData`, `releaseExpiredRequests`, `sendBookingReminders`, `onBookingCreated`, `onBookingUpdated`. A harmless reachability test (it is refused, nothing is written):

```bash
curl -s -X POST https://australia-southeast1-sua-hair-ae353.cloudfunctions.net/createBookingRequest \
  -H 'Content-Type: application/json' -d '{"data":{}}'
# expect: {"error":{"message":"Please choose at least one service.","status":"INVALID_ARGUMENT"}}
```

*Rollback:* redeploy the previous commit's functions, or delete the new ones with `firebase functions:delete <name> --region australia-southeast1`. Nothing uses them yet.

*Note on the old `onBookingCreated` trigger:* it is replaced by the new one (same name). Between step 2 and step 3 the old site still writes bookings directly, and the new trigger sends those customers the "we have your request" email instead of "confirmed" — which is correct.

### 3. Deploy the app

Merge `trust-boundary` into `main`; Vercel builds and deploys. (Environment variables on Vercel are unchanged; `VITE_RECAPTCHA_SITE_KEY` is added only in the App Check section.)

*Check — with the old rules still live:*

1. Open the site, request a booking with a made-up name and **your own** phone number and email. You should see **"Request received"** with the assigned stylist and exact price.
2. Sign in as the owner (`/admin`), open **Approvals**: the request is there. Approve it. You should get "Booking confirmed", and the "confirmed" email should arrive (see *Email* below).
3. Cancel the test booking.
4. Try "Any Available Stylist" once: the confirmation names a real stylist.

*Rollback:* Vercel → Deployments → promote the previous deployment. The old site and the new functions coexist.

### 4. Deploy the rules — last

```bash
firebase deploy --only firestore:rules
```

*Check, immediately:*

1. The owner reloads `/admin` (sign out and in if asked): Today, Approvals, Bookings and Manage load.
2. Make another test request on the public site and approve it.
3. Confirm the door is shut. From the repo root (uses the same public config any visitor has, signed out):
   ```bash
   node scripts/verify-lockdown.mjs
   ```
   It must end with `All checks passed`: reads of stylists, services, hours and `slotBlocks` work; reading bookings, client records, waitlist, notifications or users, and creating a booking, slot block, waitlist entry, notification or client record, or changing a service or the hours, are all denied. If a write probe is *allowed* it says so and lists the junk documents (id starting `lockdown-check`) to delete. (Rule behaviour is also covered by `npm run test:rules`.)
4. A stylist account opens `/stylist/schedule` and sees only their own day.

*Rollback (rules):* console → Firestore → Rules → pick the previous version in the history and **Restore**, or paste the saved `rules-before-<date>.txt` and publish, or `firebase deploy --only firestore:rules` from a checkout of the previous commit. If the claims are the problem, also run the `rollback` command from step 1 so the previous rules' `users/{uid}` role check works.

*Lock-out safeguard:* if the owner cannot reach the admin after step 4, in order: (1) sign out and in; (2) re-run `verify`; (3) restore the previous rules as above — the owner's `users/{uid}` record is untouched, so it works immediately.

## Existing data

- **Legacy bookings with stylist "any"** (made before this release) appear in **Approvals** with a **Needs stylist** badge and an assign control instead of Approve. Choosing a stylist runs `assignStylist`: it checks that stylist is free for every busy part of the booking, re-prices from their tier and the current service prices, and moves the booking. Until then such a booking blocks nobody, as before.
- **Legacy pending bookings have no 24-hour hold** and are never auto-released; the owner approves or declines them as before.
- **Blocked clients from Fresha:** re-run the import (Manage → Import clients) with the same file. Clients that already exist are untouched, but the **blocked** flag is applied to them (see FR-020). Roll back with the import's Roll back button, which removes only the flag it set.

## App Check (reCAPTCHA) — off until you do this

App Check proves a call comes from your real site, not a script. It is built in but **off**; the callables only *require* it when `ENFORCE_APP_CHECK=true`. Do these steps in order:

1. **reCAPTCHA keys.** Go to https://www.google.com/recaptcha/admin → **Create**. Label "Sua Hair". Type **reCAPTCHA v3** (score based). Domains: the production site's domain (e.g. `suahair.com.au` and the `*.vercel.app` preview domain if you want previews to work). Submit; copy the **site key** and the **secret key**.
2. **Register the app.** Firebase console → **App Check** → the **Apps** tab → select the web app → **reCAPTCHA** → paste the **secret key** → Save (token time-to-live: the default 1 hour is fine).
3. **Give the site its key.** Vercel → Project → Settings → Environment Variables → add `VITE_RECAPTCHA_SITE_KEY` = the **site key** (Production, and Preview if wanted) → redeploy.
4. **Check it is sending tokens (not enforcing yet).** App Check → **APIs** → *Cloud Functions* shows "Verified requests" rising as people use the site. Wait until nearly 100% of requests are verified (a day of normal use). Debug tokens for local development: App Check → Apps → ⋮ → *Manage debug tokens*.
5. **Turn on enforcement for the callables.** In `functions/.env` set `ENFORCE_APP_CHECK=true`, then `firebase deploy --only functions`. Unverified calls now get "This request could not be verified. Please reload the page and try again."
6. **Optional second layer:** App Check → APIs → *Cloud Firestore* → **Enforce** (only after step 4 shows the site is verified, or the public calendar reads will fail).

*Roll back enforcement:* set `ENFORCE_APP_CHECK=false` and redeploy the functions; the site keeps working.

## Email — verify delivery (never tested)

Email has only been exercised through templates and unit tests; the Functions emulator logs "email not sent" instead of sending. To verify for real:

1. Resend dashboard: add and verify the sending domain; create an API key; `firebase functions:secrets:set RESEND_API_KEY`; set `EMAIL_FROM` to an address on that domain; redeploy functions.
2. Manage → notifications: tick "email me about new booking requests" with your address.
3. Make a request with **your own** email on the public site → expect, within a minute, **"We have your booking request"** (says plainly it is *not* a confirmation), and the owner heads-up email.
4. Approve it → expect **"Your booking is confirmed"**. Cancel nothing yet.
5. Make a second request and **Decline** it → expect **"We couldn't confirm your booking request"**.
6. Resend dashboard → Emails shows each message and its delivery status. Check the spam folder too.
7. The 24-hour reminder only goes to **confirmed** bookings starting 24–25 hours from now.

## Everything else to know

- The 24-hour hold is `SALON_CONFIG.pendingHoldHours` in `src/lib/config.ts` (and `maxPendingPerPhone: 2`). The release job runs every 15 minutes, so a request is released between 24:00 and 24:15 after it was made.
- Rate limits (`functions/src/limits.ts`): booking attempts 8 per phone number and 30 per address per hour; waitlist 5 per phone per day, 20 per address per hour. Shared salon Wi-Fi is the reason the address limit is generous.
- The browser tests and unit tests assume nothing about the real project; the only way to learn that production behaves is to do the checks above.
