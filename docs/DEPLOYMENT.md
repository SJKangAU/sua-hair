# Deployment - the trust-boundary release

**Status (2026-10-21).** The trust-boundary release is **merged into `main` and pushed**. The site is on Vercel, which auto-deploys `main`, so the new app may already be live. **The functions, the owner provisioning and the rules have NOT been deployed.** If the live site is already the new app, online booking requests will fail until the **functions** are deployed: do steps 1 and 2 below now, and skip step 3 (the app is already out). Step 4 (rules) stays last. Production Firebase project: `sua-hair-ae353`. Nothing in this release has been run against the real project by the developer; every test ran against emulators. Follow the order below; each step says how to check it and how to undo it.

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

*Running it on Windows (PowerShell).* Three things trip people up:

1. **Run it from the project folder**, not from wherever the key file is. The script is `functions/scripts/provision-roles.ts` inside the repo: `cd C:\Users\Jason\Desktop\Coding\projects\sua-hair` first. In another folder you get `ERR_MODULE_NOT_FOUND`.
2. **There is no `gcloud` on a fresh machine.** Use a service-account key instead: Firebase console -> Project settings -> Service accounts -> Generate new private key. Save it **outside the repo** (for example `C:\Users\Jason\Desktop\Coding\Keys\`), check the real file name (a doubled `.json.json` is common), then in the same window `$env:GOOGLE_APPLICATION_CREDENTIALS = "<full path to the key file>"`.
3. **Use `npx.cmd`** (PowerShell can block `npx.ps1`). Never commit the key file; delete the key in the console when you are done.

An account that signs in but has no role sees a "No access yet" screen with its UID. That is the expected result for an unprovisioned account (and for the owner until this step is done).

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
firebase functions:secrets:set CLICKSEND_USERNAME      # texts: see "Text messages" below - set BEFORE deploying
firebase functions:secrets:set CLICKSEND_API_KEY       # (the booking triggers and reminder job declare both secrets)
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

*Check:* console → Functions lists `createBookingRequest`, `joinWaitlist`, `approveBooking`, `declineBooking`, `cancelBooking`, `restoreBooking`, `assignStylist`, `setUserRole`, `deleteCustomerData`, `releaseExpiredRequests`, `sendBookingReminders`, `onBookingCreated`, `onBookingUpdated`, `sendTestSms`. A harmless reachability test (it is refused, nothing is written):

```bash
curl -s -X POST https://australia-southeast1-sua-hair-ae353.cloudfunctions.net/createBookingRequest \
  -H 'Content-Type: application/json' -d '{"data":{}}'
# expect: {"error":{"message":"Please choose at least one service.","status":"INVALID_ARGUMENT"}}
```

*Rollback:* redeploy the previous commit's functions, or delete the new ones with `firebase functions:delete <name> --region australia-southeast1`. Nothing uses them yet.

*Note on the old `onBookingCreated` trigger:* it is replaced by the new one (same name). Between step 2 and step 3 the old site still writes bookings directly, and the new trigger sends those customers the "we have your request" email instead of "confirmed" — which is correct.

### 3. Deploy the app

The app is deployed by Vercel from `main` (this release is already on `main`; if you are reading this before the first deploy, push `main` at this step, not earlier). (Environment variables on Vercel are unchanged; `VITE_RECAPTCHA_SITE_KEY` is added only in the App Check section.)

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

## The client directory (DEC-044 to DEC-049): what to add to the order above

This release adds `clients` and `clientCards` (and their rules), seven composite indexes, five owner callables (`recomputeClients`, `backfillClients`, `mergeClients`, `anonymiseClient`, `exportClientData`), a trigger (`onBookingWritten`) and a nightly job (`settleClientSummaries`). The order is the same as above, with two additions:

1. **Indexes first, and wait.** `firebase deploy --only firestore:indexes` adds the client and booking-history indexes. They take minutes to build (console, Firestore, Indexes: wait for every one to say "Enabled"). A directory filter or a client's history shows an error until its index exists.
2. **Functions** (step 2) deploys the callables, the trigger and the nightly job. From this moment every booking write also makes or updates a client, so the clients start to exist on their own, one booking at a time.
3. **Rules** (step 4, last) now also contains the `clients`, `clientCards`, notes, audit and `clientBackfills` rules.
4. **Then build the client list, once, from Manage as the owner:**
   1. Manage, **Build the client list**, press **Check first (dry run)**. Nothing is written.
   2. Read the counts. "Bookings looked at" should be close to the number of bookings you expect; "Clients found" should be about the number of different people; "Skipped: no phone" and "not a valid mobile" are bookings that will not belong to a client; "Old bookings with no stylist yet" are the legacy `any` bookings (they still count for the client).
   3. Press **Download report** and look at the rows: each is a row number and a reason, with no names or numbers.
   4. If it looks right, press **Build**. It runs in batches and can take a few minutes for a large history; do not close the page.
   5. Spot-check in Clients: search for three people you know, open them, and check their visits, last visit and spend against what you remember.
   6. **Keep the batch** listed under the button; its **Roll back** removes the clients that run created (a client with a note is kept) and the links it set. Running Build again later is safe: it creates nothing twice and never changes a client you have edited.
5. Then run the Fresha import (Manage, Import clients) if you have not: it now creates the clients too, and its rollback removes them.
6. **Check:** open Clients as the owner (the list loads, a search works, a client page shows history and notes); sign in as a stylist and open **My clients** from their schedule (only their clients, no spend).

*Rollback of this part:* roll back the Build batch (and the import batch) from Manage; the app without `clients` still works because nothing else depends on them except the Clients page (which then shows "No clients yet"). The trigger can be turned off by deleting `onBookingWritten` (`firebase functions:delete onBookingWritten --region australia-southeast2`), after which only the booking commands keep clients current and **Recalculate every client's figures** repairs the rest.

## Team access (FR-025, DEC-051): what to add to the order above

This release changes `setUserRole` and `roles.ts` (functions), adds a Manage → Team access screen and a Show picker for stylists (app), and extends `firestore.rules` (a few helper functions; the client cards, notes and bookings read rules). **Nothing changes for anyone until the owner widens a stylist**: every existing stylist keeps their own clients only.

1. **Functions** (step 2): `firebase deploy --only functions` - `setUserRole` now accepts `clientAccess`.
2. **App** (step 3), then **rules last** (step 4) as before. A stylist's widened access works only once the new rules are live; before that the picker may list a colleague's clients and then show "not found". The screen is owner-only, so deploy the rules before using it.
3. **Check:** as the owner open Manage → Team access: your own account is listed as Owner. (The list reads `users/{uid}`; an account provisioned before this release has the record but no `clientAccess` and is treated as own-clients-only.)
4. **Give someone wider access:** an existing stylist account is listed under Team access once it has a role. Choose their access and **Save**. If they are signed in, their screens update within a minute (no sign-out needed); otherwise at next sign-in. To do the same from the command line: `npx tsx functions/scripts/provision-roles.ts grant --project sua-hair-ae353 --email <email> --role stylist --stylist <id> --clients all` (or `--clients yuto,elly`); leaving `--clients` out keeps what they had.
5. **Check as that stylist:** My clients shows a Show picker; a colleague's client opens, with their history (the colleague's name, no price); a client outside the access shows "not found".

**Know before you widen access.** Firestore rules authorise whole documents, so a stylist given a colleague's clients can read that colleague's **bookings** in the database (the app hides the price and the colleague's totals, the database does not). Give wider access only to people you trust with that.

*Rollback:* set the stylist back to "their own clients only" in Team access (or `grant ... --clients none` on the command line); or redeploy the previous rules, after which stylists see only their own clients again whatever their claim says.

## Existing data

- **Legacy bookings with stylist "any"** (made before this release) appear in **Approvals** with a **Needs stylist** badge and an assign control instead of Approve. Choosing a stylist runs `assignStylist`: it checks that stylist is free for every busy part of the booking, re-prices from their tier and the current service prices, and moves the booking. Until then such a booking blocks nobody, as before.
- **Legacy pending bookings have no 24-hour hold** and are never auto-released. After deploying the functions, run `npx tsx functions/scripts/hold-legacy-pending.ts --project sua-hair-ae353 --dry-run`, then again without `--dry-run`. Each upcoming pending booking gets a hold of 24 hours from that moment, so the owner has a full day to approve it before the normal release job and "couldn't confirm" email apply. Pending bookings already dated in the past are listed, not changed; resolve those by hand in Approvals. Safe to re-run.
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

## Text messages (FR-024, DEC-050): what to add to the order above

This release adds `sendTestSms` (owner callable), SMS sending inside `onBookingCreated`, `onBookingUpdated` and `sendBookingReminders`, the `privateSettings/sms` and `smsLog` rules, and a Manage section. **Texts stay off until the owner switches them on**, so deploying changes nothing for clients.

1. **Create a ClickSend account** (clicksend.com, Australian pay-as-you-go), add some credit, and create an **API key** (Dashboard, Developers, API Credentials). The username is your account username.
2. **Register the sender name** you want clients to see (Dashboard, SMS, Alpha Tags / Sender IDs; 3–11 letters or numbers, e.g. `SuaHair`). Australian carriers can block an unregistered alphanumeric sender, and a registered one takes a few days: do this first. Clients cannot reply to a sender name (the default wording tells them to call the salon). Replies would need a dedicated ClickSend number, which this version does not support.
3. **Set the secrets before deploying functions** (a deploy that declares a secret with no value stops):
   ```bash
   firebase functions:secrets:set CLICKSEND_USERNAME
   firebase functions:secrets:set CLICKSEND_API_KEY
   ```
4. Deploy functions (step 2), the app (step 3) and the rules (step 4, last) as usual. The rules now also contain `privateSettings/sms` and `smsLog`.
5. **In Manage, Text messages (as the owner):** read the four messages, change the wording if you like, set the sender name to the registered one, **Save**. Leave "Send text messages to clients" off for now.
6. **Verify delivery (never tested):** enter your own mobile under "Send tests to my mobile" and press **Send me a test** on each message: four texts should arrive from your sender name within a minute. A failure shows as a red message here and in the Cloud Functions log (`sendTestSms`): check the sender name is registered, the username and key are right, and the account has credit.
7. Switch on **Send text messages to clients**, Save. Make a request on the public site with **your own number** → "request received" text; approve it → "confirmed"; decline another → "not confirmed". The reminder goes to a confirmed booking 24–25 hours before it. Manage shows each under **Recent texts**; ClickSend's dashboard (SMS History) shows delivery.
8. **Watch the cost** in ClickSend for the first week. One text is one part up to 160 characters; the editor shows the parts. The salon-wide cap is 400 texts a day (`functions/src/limits.ts`, `smsPerDay`).

*Turning texts off:* untick the switch in Manage and Save (takes effect on the next booking). *Rollback:* the functions work without the section; `firebase functions:delete sendTestSms --region australia-southeast1` removes the test callable. Nothing else depends on `smsLog`.

## Permissions, editable emails, customer link, time off, win-back and client records (FR-026 to FR-031): what to add to the order above

These ship together on `main`. **Nothing changes for clients or stylists until the owner uses them**: no permission is granted, the new emails default to today's wording, the customer link appears in new emails and texts, time off and win-back are opt-in.

1. **Indexes first** (`firebase deploy --only firestore:indexes`): `bookings` (`stylistId`, `date`) and `clients` (`marketingOptIn`, `lastVisit`). Wait for both to finish building; a time-off request or the win-back list fails until they have.
2. **Functions** (step 2). New callables: `setPermissionDefaults`, `sendTestEmail`, `getManagedBooking`, `listChangeSlots`, `cancelManagedBooking`, `requestBookingChange` (public), `previewTimeOff`, `requestTimeOff`, `decideTimeOff`, `withdrawTimeOff`, `winBackCandidates`, `sendWinBack`, `unsubscribeMarketing` (public). Secrets are the same as before (`RESEND_API_KEY`, `CLICKSEND_*`). Set **`SITE_URL`** if the public address is not `https://sua-hair.vercel.app` (it builds the links in emails and texts); put it in `functions/.env.<project>`.
3. **App** (step 3), then **rules last** (step 4). The rules add `privateSettings/{email,permissions,timeOff}`, `timeOff`, `winBackLog`, `clients/{id}/records` and the `caps` claim checks. Before the rules are live, a stylist's Messages page and the owner's new Manage sections cannot save.
4. **Check as the owner:** Manage → Team & permissions lists the four permissions; Manage → Emails shows five emails with a preview; Manage → Cancellation & change policy and Time-off requests show their defaults; Clients has **Invite lapsed clients back**; a client page has **Colour formulas & patch tests**.
5. **Links:** make a request with your own phone and approve it: the confirmation email and text carry a **Change or cancel** link that opens `/manage` with the booking, and the email has an **Add to calendar** attachment.
6. **Win-back (only when you want it):** the invitation email is on by default; the invitation text is sent only if text messages as a whole are switched on in Manage → Text messages. Only clients who ticked the box (or whose consent you recorded) can be invited, so the list will be empty until some do. Send the first one to yourself: tick the box on a test booking, wait until you have a past visit (or set the client's last visit older in the console), invite, and press the unsubscribe link from your own inbox.
7. **Spam Act:** commercial messages need consent, the salon's identity and a working unsubscribe. The booking form says what the box is for; keep the wording of the invitation that includes the salon name and the unsubscribe link.

*Rollback:* grant nothing and leave the new sections alone and the old behaviour is unchanged. The customer link can be turned off by switching both options off in Cancellation & change policy. Redeploying the previous rules removes the new access (stylists lose the permissions at once).

## Everything else to know

- The 24-hour hold is `SALON_CONFIG.pendingHoldHours` in `src/lib/config.ts` (and `maxPendingPerPhone: 2`). The release job runs every 15 minutes, so a request is released between 24:00 and 24:15 after it was made.
- Rate limits (`functions/src/limits.ts`): booking attempts 8 per phone number and 30 per address per hour; waitlist 5 per phone per day, 20 per address per hour. Shared salon Wi-Fi is the reason the address limit is generous.
- The browser tests and unit tests assume nothing about the real project; the only way to learn that production behaves is to do the checks above.
