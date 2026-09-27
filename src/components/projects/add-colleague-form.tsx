"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROJECT_MEMBER_ROLES, type ProjectMemberRole } from "@/server/db/enums";
import { MEMBER_ROLE_LABELS } from "@/lib/member-roles";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

export type AddedColleague = {
  id: string;
  email: string;
  name: string;
  alreadyExisted?: boolean;
  inviteEmail?: string;
  /** Only present when the form was rendered with `withRole`. */
  role?: ProjectMemberRole;
};

/**
 * Add a colleague to the organisation by email. The server pre-seeds their
 * seat and sends a Clerk invitation email; signing up with the same
 * address claims it. Shared by project settings (with a project-role
 * picker), the onboarding wizard and the account team card (org-level,
 * no role).
 *
 * A send failure is a warning, not a success: the admin needs to know to
 * tell the person to sign up by hand, rather than assume an email went.
 */
export function AddColleagueForm({
  onAdded,
  withRole = false,
}: {
  onAdded?: (user: AddedColleague) => void;
  /** Show a project-role picker; the chosen role is passed to onAdded. */
  withRole?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ProjectMemberRole>("member");

  const addColleague = trpc.org.addColleague.useMutation({
    onSuccess: (user) => {
      const base = user.alreadyExisted
        ? `${user.email} is already in your organisation`
        : `${user.email} added to your organisation`;
      if (user.inviteEmail === "sent") {
        toast.success(base, {
          description:
            "Invitation email sent — the link signs them up with this address. Worth a check of their junk folder the first time.",
        });
      } else if (user.inviteEmail === "already_invited") {
        toast.success(base, {
          description:
            "An invite email is already out to them — or they can just sign up at www.sitefile.app/sign-up with this address.",
        });
      } else if (user.inviteEmail === "failed") {
        toast.warning(`${base}, but the invitation email could not be sent`, {
          description:
            "Ask them to sign up at www.sitefile.app/sign-up with this email — their account will still land in your organisation. Use Resend invite to try again.",
          duration: 10_000,
        });
      } else {
        toast.success(base, {
          description:
            "Tell them to sign up at www.sitefile.app/sign-up with this email — their account will land in your organisation.",
        });
      }
      setEmail("");
      setName("");
      setRole("member");
      onAdded?.(withRole ? { ...user, role } : user);
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit = /\S+@\S+\.\S+/.test(email) && !addColleague.isPending;

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        addColleague.mutate({ email, name: name.trim() || undefined });
      }}
    >
      <Input
        type="email"
        placeholder="colleague@company.co.uk"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-48 flex-1"
        aria-label="Colleague email"
      />
      <Input
        type="text"
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-36"
        aria-label="Colleague name"
      />
      {withRole && (
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ProjectMemberRole)}
          aria-label="Role on this project"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {PROJECT_MEMBER_ROLES.filter((r) => r !== "admin").map((r) => (
            <option key={r} value={r}>
              {MEMBER_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" size="sm" disabled={!canSubmit}>
        <UserPlus className="mr-1 h-3.5 w-3.5" />
        {addColleague.isPending ? "Adding..." : "Add by email"}
      </Button>
    </form>
  );
}
