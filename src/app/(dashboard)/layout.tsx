import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { organisations, users } from "@/server/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { isDemoMode, getDemoUser } from "@/lib/demo";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isDemoMode()) {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get("demo_user")?.value;
    if (!demoCookie) {
      redirect("/demo");
    }
    // Mirror the Clerk branch: a removed colleague lands on /access-removed.
    const demo = getDemoUser(demoCookie);
    if (demo) {
      const [row] = await db
        .select({ deactivatedAt: users.deactivatedAt })
        .from(users)
        .where(eq(users.clerkId, demo.clerkId))
        .limit(1);
      if (row?.deactivatedAt) redirect("/access-removed");
    }
  } else {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) {
      // Prospects land on the marketing page, not an auth wall.
      redirect("/welcome");
    }
    // First-run gate: an org that hasn't finished (or skipped) the setup
    // wizard goes to /onboarding. A missing users row means this account
    // hasn't been provisioned yet — brand new, so the wizard applies too.
    const [row] = await db
      .select({
        onboardingCompletedAt: organisations.onboardingCompletedAt,
        deactivatedAt: users.deactivatedAt,
      })
      .from(users)
      .innerJoin(organisations, eq(users.orgId, organisations.id))
      .where(eq(users.clerkId, userId))
      .limit(1);
    if (row?.deactivatedAt) {
      redirect("/access-removed");
    }
    if (!row || row.onboardingCompletedAt === null) {
      redirect("/onboarding");
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
