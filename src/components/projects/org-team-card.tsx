"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddColleagueForm } from "@/components/projects/add-colleague-form";
import { ShieldAlert, Users, UserMinus } from "lucide-react";

const ORG_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Organisation-level people management for admins ("super users"): who is
 * in the company account, who holds admin, and removal of leavers. The
 * organisation must always keep at least one admin — the server refuses
 * the last demotion or removal, and this card says so before you try.
 */
export function OrgTeamCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.org.teamList.useQuery();
  const [pendingRemoval, setPendingRemoval] = useState<{
    id: string;
    name: string;
    claimed: boolean;
  } | null>(null);

  const invalidate = () => {
    utils.org.teamList.invalidate();
    utils.project.orgUsers.invalidate();
  };

  const setRole = trpc.org.setUserRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      invalidate();
    },
  });

  const remove = trpc.org.removeColleague.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.deleted
          ? "Invitation withdrawn"
          : r.projectsAffected > 0
            ? `Removed from the organisation and ${r.projectsAffected} project${r.projectsAffected === 1 ? "" : "s"}`
            : "Removed from the organisation"
      );
      setPendingRemoval(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      setPendingRemoval(null);
    },
  });

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted" />;
  }
  if (!data) return null;

  const { team, adminCount } = data;
  const soleAdmin = adminCount <= 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Organisation team
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Admins run the account: they add and remove people, set who else is
          an admin, and hand projects over when someone leaves. Members see
          only the projects they are added to.
        </p>

        {soleAdmin && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">You are the only admin.</div>
              <div className="text-xs">
                If you leave or lose access, nobody can add people, remove
                leavers or hand projects over. Make a second person an admin
                below.
              </div>
            </div>
          </div>
        )}

        <AddColleagueForm onAdded={() => invalidate()} />

        <div className="space-y-2">
          {team.map((person) => {
            const lastAdmin = person.role === "admin" && soleAdmin;
            return (
              <div
                key={person.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {initials(person.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {person.name}
                      {person.isYou && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {person.email}
                    </div>
                  </div>
                  {!person.claimed && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      Invited — not signed in yet
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={person.role}
                    disabled={lastAdmin || setRole.isPending}
                    onValueChange={(val) => {
                      if (val && val !== person.role)
                        setRole.mutate({
                          userId: person.id,
                          role: val as "admin" | "member",
                        });
                    }}
                  >
                    <SelectTrigger
                      className="h-7 w-28 text-xs"
                      aria-label={`Organisation role for ${person.name}`}
                      title={
                        lastAdmin
                          ? "The only admin can't be demoted. Make someone else an admin first."
                          : undefined
                      }
                    >
                      <SelectValue>
                        {(val: string | null) =>
                          val ? ORG_ROLE_LABELS[val] ?? val : "Role"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  {!person.isYou && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      disabled={lastAdmin || remove.isPending}
                      aria-label={`Remove ${person.name} from the organisation`}
                      title={
                        lastAdmin
                          ? "The only admin can't be removed."
                          : "Remove from the organisation"
                      }
                      onClick={() =>
                        setPendingRemoval({
                          id: person.id,
                          name: person.name,
                          claimed: person.claimed,
                        })
                      }
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemoval?.claimed
                ? `Remove ${pendingRemoval.name} from the organisation?`
                : `Withdraw ${pendingRemoval?.name ?? "this"}'s invitation?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.claimed
                ? "They lose access to every project and drop out of any approval chain. Everything they uploaded, entered or approved stays on the record under their name. If a project is theirs to run, hand it over from that project's settings first."
                : "They haven't signed in yet, so there is nothing on the record — the pending invitation is simply cancelled."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingRemoval) remove.mutate({ userId: pendingRemoval.id });
              }}
            >
              {pendingRemoval?.claimed ? "Remove" : "Withdraw invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
