import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo";
import { OfflineQueueIndicator } from "@/components/layout/offline-queue-indicator";

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isDemoMode()) {
    const cookieStore = await cookies();
    if (!cookieStore.get("demo_user")?.value) {
      redirect("/demo");
    }
  } else {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-black text-white overflow-hidden">
      {/* Sync state must be visible where capture happens — a queued photo
          with no indicator is an invisible photo. Self-hides at zero. */}
      <div className="pointer-events-none absolute right-3 top-14 z-50 [&>*]:pointer-events-auto">
        <OfflineQueueIndicator />
      </div>
      {children}
    </div>
  );
}
