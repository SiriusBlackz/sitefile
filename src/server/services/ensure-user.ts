import { eq } from "drizzle-orm";
import { organisations, users } from "@/server/db/schema";
import type { db as dbType } from "@/server/db";

type DB = typeof dbType;

export interface DbUser {
  id: string;
  orgId: string;
  clerkId: string;
  email: string;
  name: string;
  role: string;
}

export class DemoNotSeededError extends Error {
  constructor(clerkId: string) {
    super(
      `Demo user "${clerkId}" not found in database. Run \`pnpm db:seed:demo\` to seed demo data.`
    );
    this.name = "DemoNotSeededError";
  }
}

/**
 * Look up a pre-seeded demo user by clerkId. Does NOT auto-provision —
 * demo mode must run against a deterministic seed so demo sessions
 * resolve consistently across requests and instances.
 */
export async function lookupDemoUser(db: DB, clerkId: string): Promise<DbUser> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  if (!existing) {
    throw new DemoNotSeededError(clerkId);
  }
  return {
    id: existing.id,
    orgId: existing.orgId,
    clerkId: existing.clerkId,
    email: existing.email,
    name: existing.name,
    role: existing.role,
  };
}

/**
 * Find the database user record for a Clerk user ID.
 * If no record exists, auto-provision an organisation and user record.
 *
 * This avoids requiring a webhook for local development — on first API
 * call after sign-in, the user + org are created on the fly.
 */
export async function ensureUser(
  db: DB,
  clerkId: string,
  clerkUser: { email: string; name: string; imageUrl?: string }
): Promise<DbUser> {
  // Look up existing user by Clerk ID
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (existing) {
    return {
      id: existing.id,
      orgId: existing.orgId,
      clerkId: existing.clerkId,
      email: existing.email,
      name: existing.name,
      role: existing.role,
    };
  }

  // Fall back to email lookup so a Clerk instance swap (e.g. pk_test → pk_live)
  // rehydrates the existing org instead of provisioning a fresh empty one.
  if (clerkUser.email) {
    const byEmail = await db.query.users.findFirst({
      where: eq(users.email, clerkUser.email),
    });
    if (byEmail) {
      const [updated] = await db
        .update(users)
        .set({
          clerkId,
          name: clerkUser.name,
          avatarUrl: clerkUser.imageUrl ?? byEmail.avatarUrl,
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      return {
        id: updated.id,
        orgId: updated.orgId,
        clerkId: updated.clerkId,
        email: updated.email,
        name: updated.name,
        role: updated.role,
      };
    }
  }

  // No user found — auto-provision org + user
  const [org] = await db
    .insert(organisations)
    .values({
      name: `${clerkUser.name}'s Organisation`,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      clerkId,
      email: clerkUser.email,
      name: clerkUser.name,
      role: "admin",
      avatarUrl: clerkUser.imageUrl ?? null,
    })
    .returning();

  return {
    id: user.id,
    orgId: org.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
