"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

/**
 * Pre-seed a colleague into the organisation by email (no invite email is
 * sent — they claim the seat by signing up with the same address). Shared
 * between project settings and the onboarding wizard's team step.
 */
export function AddColleagueForm({
  onAdded,
}: {
  onAdded?: (user: {
    id: string;
    email: string;
    name: string;
    alreadyExisted?: boolean;
  }) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const addColleague = trpc.org.addColleague.useMutation({
    onSuccess: (user) => {
      if (user.alreadyExisted) {
        toast.success(`${user.email} is already in your organisation`);
      } else {
        toast.success(`${user.email} added to your organisation`, {
          description: `Tell them to sign up at www.sitefile.app/sign-up with that email — their account will land in your organisation.`,
        });
      }
      setEmail("");
      setName("");
      onAdded?.(user);
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
      <Button type="submit" size="sm" disabled={!canSubmit}>
        <UserPlus className="mr-1 h-3.5 w-3.5" />
        {addColleague.isPending ? "Adding..." : "Add by email"}
      </Button>
    </form>
  );
}
