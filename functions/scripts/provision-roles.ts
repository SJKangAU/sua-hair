// functions/scripts/provision-roles.ts
// One-time (and rollback) provisioning of the owner / stylist roles with the
// Admin SDK. Run it BEFORE deploying the new firestore.rules, verify, and only
// then deploy the rules (docs/DEPLOYMENT.md).
//
//   npx tsx functions/scripts/provision-roles.ts <command> [options]
//
//   list                                     show every user with a role claim
//   verify   --email <e> [--role owner]      check claim + record, exit 1 if wrong
//   grant    --email <e> --role owner        give the owner role
//   grant    --email <e> --role stylist --stylist <stylistId>
//   revoke   --email <e>                     remove the role (claim + record + sessions)
//   rollback                                 remove the CLAIMS this script/function
//                                            added from every user, keeping the
//                                            users/{uid} records, so the previous
//                                            rules (which read users/{uid}) work again
//
// Options:  --project <id>   Firebase project (default: GCLOUD_PROJECT / ADC)
//           --dry-run        print what would change; write nothing
//
// Credentials: Application Default Credentials. Either
//   gcloud auth application-default login            (as an owner of the project)
// or  set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.
// Against the emulators set FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST.
//
// Never prints passwords, tokens or customer data; it prints emails and uids of
// staff accounts only.

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  grantRole,
  revokeRole,
  verifyRole,
  type Role,
} from "../src/roles";

const args = process.argv.slice(2);
const command = args[0];
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");

const usage = (): never => {
  console.error(
    "Usage: provision-roles <list|verify|grant|revoke|rollback> [--email e] [--role owner|stylist] [--stylist id] [--project id] [--dry-run]",
  );
  process.exit(2);
};

const main = async (): Promise<void> => {
  if (!command) usage();
  const project = opt("project") ?? process.env.GCLOUD_PROJECT;
  initializeApp(project ? { projectId: project } : undefined);
  const auth = getAuth();
  const db = getFirestore();
  console.log(`Project: ${project ?? "(from credentials)"}${dryRun ? "   [dry run]" : ""}`);

  const byEmail = async (): Promise<string> => {
    const email = opt("email");
    if (!email) usage();
    return (await auth.getUserByEmail(email as string)).uid;
  };

  if (command === "list") {
    let token: string | undefined;
    do {
      const page = await auth.listUsers(1000, token);
      for (const u of page.users) {
        const role = u.customClaims?.role;
        if (role) {
          console.log(`${role.padEnd(8)} ${u.email ?? "(no email)"}  uid=${u.uid}${u.customClaims?.stylistId ? `  stylist=${u.customClaims.stylistId}` : ""}`);
        }
      }
      token = page.pageToken;
    } while (token);
    return;
  }

  if (command === "verify") {
    const uid = await byEmail();
    const role = opt("role") as Role | undefined;
    const check = await verifyRole(auth, db, uid, role ? { role } : undefined);
    console.log(`claims: ${JSON.stringify(check.claims)}`);
    console.log(`record: ${JSON.stringify(check.record ? { role: check.record.role, stylistId: check.record.stylistId } : null)}`);
    if (check.ok) console.log("OK - the account has a consistent role.");
    else {
      for (const p of check.problems) console.error(`PROBLEM: ${p}`);
      process.exit(1);
    }
    return;
  }

  if (command === "grant") {
    const uid = await byEmail();
    const role = opt("role") as Role | undefined;
    if (role !== "owner" && role !== "stylist") usage();
    const grant = { role: role as Role, stylistId: opt("stylist") };
    console.log(`Would grant ${grant.role}${grant.stylistId ? ` (${grant.stylistId})` : ""} to uid=${uid}`);
    if (dryRun) return;
    await grantRole(auth, db, uid, grant);
    const check = await verifyRole(auth, db, uid, { role: grant.role });
    console.log(check.ok ? "Granted and verified. The user must sign out and in once to pick up the new claim." : `Granted, but: ${check.problems.join(" ")}`);
    if (!check.ok) process.exit(1);
    return;
  }

  if (command === "revoke") {
    const uid = await byEmail();
    console.log(`Would revoke the role of uid=${uid}`);
    if (dryRun) return;
    await revokeRole(auth, db, uid);
    console.log("Revoked (claim, record and sessions).");
    return;
  }

  if (command === "rollback") {
    // Keeps users/{uid}: the OLD rules read users/{uid}.role, so the app works
    // again after redeploying the old rules even with the claims gone.
    let token: string | undefined;
    let cleared = 0;
    do {
      const page = await auth.listUsers(1000, token);
      for (const u of page.users) {
        if (u.customClaims?.role) {
          console.log(`clear claims: ${u.email ?? u.uid}`);
          if (!dryRun) await auth.setCustomUserClaims(u.uid, null);
          cleared += 1;
        }
      }
      token = page.pageToken;
    } while (token);
    console.log(`${cleared} account(s) ${dryRun ? "would be" : ""} cleared. users/{uid} records were kept.`);
    return;
  }

  usage();
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
