import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import { organisations, users, projectMembers } from "../src/server/db/schema";

dotenv.config({ path: ".env.local" });

const DEMO_ORG_NAME = "Sitefile Demo Organisation";

const DEMO_USERS = [
  {
    clerkId: "demo_clerk_contractor1",
    email: "contractor1@demo.sitefile.app",
    name: "Demo Contractor 1",
  },
  {
    clerkId: "demo_clerk_contractor2",
    email: "contractor2@demo.sitefile.app",
    name: "Demo Contractor 2",
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Aborting demo seed.");
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require", prepare: false });
  const db = drizzle(client, {
    schema: { organisations, users, projectMembers },
  });

  // 1. Ensure demo org exists
  let [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.name, DEMO_ORG_NAME))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(organisations)
      .values({ name: DEMO_ORG_NAME })
      .returning();
    console.log(`Created demo org: ${org.id}`);
  } else {
    console.log(`Demo org already exists: ${org.id}`);
  }

  // 2. Ensure each demo user exists, linked to the demo org
  for (const du of DEMO_USERS) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, du.clerkId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`Demo user "${du.clerkId}" already exists: ${existing[0].id}`);
      // Keep role = admin even if someone downgraded it by hand
      if (existing[0].role !== "admin" || existing[0].orgId !== org.id) {
        await db
          .update(users)
          .set({ role: "admin", orgId: org.id, email: du.email, name: du.name })
          .where(eq(users.id, existing[0].id));
        console.log(`  ↳ re-aligned role / org for ${du.clerkId}`);
      }
      continue;
    }

    const [created] = await db
      .insert(users)
      .values({
        orgId: org.id,
        clerkId: du.clerkId,
        email: du.email,
        name: du.name,
        role: "admin",
      })
      .returning();
    console.log(`Created demo user "${du.clerkId}": ${created.id}`);
  }

  await client.end();
  console.log("Demo seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error("Demo seed failed:", e);
  process.exit(1);
});
