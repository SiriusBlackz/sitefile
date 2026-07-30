"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@clerk/nextjs";
import { trpc } from "@/lib/trpc";
import { labelFor } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, UserRound } from "lucide-react";

const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
};

function hasDemoCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("demo_user="));
}

function ProfileCard() {
  const { data: me, isLoading } = trpc.project.currentUser.useQuery();

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted" />;
  }
  if (!me) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="h-5 w-5" />
          Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {me.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{me.name}</div>
            <div className="text-sm text-muted-foreground">{me.email}</div>
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Organisation</dt>
            <dd className="font-medium">{me.orgName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">{labelFor(ROLE_LABELS, me.role)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function DemoSessionCard() {
  const router = useRouter();

  const switchUser = () => {
    document.cookie = "demo_user=; path=/; max-age=0";
    router.push("/demo");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Demo session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You are signed in via demo mode. Demo sessions are local-only and do
          not persist between users on the same browser.
        </p>
        <Button variant="outline" onClick={switchUser}>
          <LogOut className="mr-2 h-4 w-4" />
          Switch user
        </Button>
      </CardContent>
    </Card>
  );
}

function ClerkAccountPanel() {
  return (
    <div className="flex justify-center">
      <UserProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border w-full",
          },
        }}
      />
    </div>
  );
}

export default function AccountPage() {
  const [isDemo, setIsDemo] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDemo(hasDemoCookie());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Account</h1>
      <ProfileCard />
      {isDemo ? (
        <DemoSessionCard />
      ) : isClerkConfigured ? (
        <ClerkAccountPanel />
      ) : null}
    </div>
  );
}
