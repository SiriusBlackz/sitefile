import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { organisations, users } from "@/server/db/schema";
import { isDemoMode } from "@/lib/demo";

/**
 * First-run setup wizard shell — deliberately chrome-free (no sidebar,
 * no project nav). The dashboard layout redirects here while the org's
 * onboardingCompletedAt is null; this layout bounces back once it isn't,
 * so the wizard can't be revisited by URL.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isDemoMode()) {
    redirect("/");
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    redirect("/welcome");
  }
  const [row] = await db
    .select({ onboardingCompletedAt: organisations.onboardingCompletedAt })
    .from(users)
    .innerJoin(organisations, eq(users.orgId, organisations.id))
    .where(eq(users.clerkId, userId))
    .limit(1);
  if (row && row.onboardingCompletedAt !== null) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-10">{children}</main>
    </div>
  );
}
