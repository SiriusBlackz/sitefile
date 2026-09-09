import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { desc, eq, or, like } from "drizzle-orm";
import * as dotenv from "dotenv";
import { users, organisations, projectMembers, auditLog } from "../src/server/db/schema";

dotenv.config({ path: ".env.production-snapshot" });

const TARGET_EMAIL = process.argv[2];

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require", prepare: false });
  const db = drizzle(client, { schema: { users, organisations, projectMembers, auditLog } });

  // Most recent users
  const recent = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(8);

  console.log(`\n=== USERS (last 8) ===`);
  for (const u of recent) {
    const marker = TARGET_EMAIL && u.email === TARGET_EMAIL ? "  ← TARGET" : "";
    console.log(
      `  ${u.id.slice(0, 8)}  ${u.email}  name="${u.name}"  clerk=${u.clerkId.slice(0, 24)}...  org=${u.orgId.slice(0, 8)}  created=${u.createdAt?.toISOString().slice(0, 19)}${marker}`,
    );
  }

  if (TARGET_EMAIL) {
    const target = recent.find((u) => u.email === TARGET_EMAIL);
    if (!target) {
      console.log(`\n!! No user found with email=${TARGET_EMAIL}`);
      console.log(`   Possible causes: signup didn't reach DB, or wrong email, or Clerk webhook failed.`);
    } else {
      console.log(`\n=== TARGET USER DETAILS ===`);
      console.log(`  email:     ${target.email}`);
      console.log(`  name:      ${target.name}`);
      console.log(`  clerk_id:  ${target.clerkId}`);
      console.log(`  role:      ${target.role}`);
      console.log(`  org_id:    ${target.orgId}`);
      console.log(`  created:   ${target.createdAt?.toISOString()}`);

      // Look up the org
      const org = await db.select().from(organisations).where(eq(organisations.id, target.orgId)).limit(1);
      if (org.length > 0) {
        console.log(`\n=== TARGET ORG ===`);
        console.log(`  id:    ${org[0].id}`);
        console.log(`  name:  ${org[0].name}`);
        console.log(`  tier:  ${org[0].subscriptionTier}`);
        console.log(`  created: ${org[0].createdAt?.toISOString()}`);
      }

      // Project memberships
      const memberships = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, target.id));
      console.log(`\n=== PROJECT MEMBERSHIPS (${memberships.length}) ===`);
      for (const m of memberships) {
        console.log(`  project=${m.projectId.slice(0, 8)}  role=${m.role}`);
      }

      // Audit log entries by this user
      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.userId, target.id))
        .orderBy(desc(auditLog.createdAt))
        .limit(10);
      console.log(`\n=== AUDIT LOG ENTRIES BY THIS USER (${audits.length}) ===`);
      for (const a of audits) {
        console.log(
          `  ${a.createdAt?.toISOString().slice(0, 19)}  ${a.action}  ${a.entityType}=${a.entityId.slice(0, 8)}`,
        );
      }
    }
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
