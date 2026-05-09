import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, organisations } from "@/server/db/schema";

interface ClerkUserEvent {
  id: string;
  email_addresses: { email_address: string }[];
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk webhook] CLERK_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  let event: { type: string; data: ClerkUserEvent };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch (err) {
    console.error("[clerk webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const { type, data } = event;
    const clerkId = data.id;
    const email = data.email_addresses[0]?.email_address ?? `${clerkId}@sitefile.app`;
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || email;

    if (type === "user.created") {
      // Check if user already exists (ensureUser may have created them)
      const existing = await db.query.users.findFirst({
        where: eq(users.clerkId, clerkId),
      });
      if (existing) {
        // Update profile in case it changed
        await db
          .update(users)
          .set({ email, name, avatarUrl: data.image_url })
          .where(eq(users.clerkId, clerkId));
      } else {
        // Create org + user
        const [org] = await db
          .insert(organisations)
          .values({ name: `${name}'s Organisation` })
          .returning();

        await db.insert(users).values({
          orgId: org.id,
          clerkId,
          email,
          name,
          role: "admin",
          avatarUrl: data.image_url,
        });
      }
    } else if (type === "user.updated") {
      await db
        .update(users)
        .set({ email, name, avatarUrl: data.image_url })
        .where(eq(users.clerkId, clerkId));
    }
  } catch (err) {
    // Return 500 so Clerk retries the delivery — silently swallowing the
    // error and returning 200 means a failed user/org sync is permanently
    // lost. Clerk only retries non-2xx responses.
    console.error(`[clerk webhook] Error handling ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
