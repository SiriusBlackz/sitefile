export type InviteEmailStatus =
  | "sent" // Clerk accepted the invitation; email is on its way
  | "already_invited" // a pending Clerk invitation already exists for this email
  | "failed" // Clerk rejected the call; pre-seed still works, no email
  | "skipped"; // intentionally not attempted (demo session / no Clerk key)

/**
 * Email a sign-up invitation via the Clerk Invitations API.
 *
 * The invite email is a convenience on top of the pre-seed flow, never a
 * dependency: the seeded user row is claimed by email match on sign-up
 * whether or not the person ever opens this email (they can sign up
 * directly at /sign-up with the same address). So every failure path here
 * degrades to "no email was sent" rather than an error.
 */
export async function sendColleagueInvitation(
  email: string
): Promise<InviteEmailStatus> {
  if (!process.env.CLERK_SECRET_KEY) return "skipped";
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "https://www.sitefile.app"
    ).replace(/\/$/, "");
    await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${appUrl}/sign-up`,
      notify: true,
    });
    return "sent";
  } catch (err) {
    const clerkErr = err as {
      errors?: { code?: string }[];
      status?: number;
    };
    const codes = clerkErr.errors?.map((e) => e.code) ?? [];
    if (
      codes.includes("duplicate_record") ||
      codes.includes("form_identifier_exists")
    ) {
      // Pending invitation (or existing Clerk account) — nothing to send.
      return "already_invited";
    }
    console.error("[clerk-invitations] createInvitation failed:", err);
    return "failed";
  }
}
