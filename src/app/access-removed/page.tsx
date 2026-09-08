import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";

export const metadata = { title: "Access removed — Sitefile" };

/**
 * Landing for a colleague whose org admin has removed them. They still
 * hold a Clerk identity, so sign-in succeeds — this is where the
 * dashboard sends them instead of a project list.
 */
export default function AccessRemovedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Access removed</h1>
        <p className="text-sm text-muted-foreground">
          An administrator at your organisation has removed your access to
          Sitefile. Your past uploads, diary entries and approvals stay on
          the record under your name. If this is a mistake, ask your
          organisation&apos;s admin to add you again.
        </p>
        <Link href="/welcome" className={buttonVariants({ variant: "outline" })}>
          Back to sitefile.app
        </Link>
      </div>
    </main>
  );
}
