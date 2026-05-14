"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, UserRound } from "lucide-react";

const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function hasDemoCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("demo_user="));
}

function getDemoUserKey() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)demo_user=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function DemoAccountPanel() {
  const router = useRouter();
  const demoUser = getDemoUserKey();

  const switchUser = () => {
    document.cookie = "demo_user=; path=/; max-age=0";
    router.push("/demo");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="h-5 w-5" />
          Demo session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You are signed in as{" "}
          <span className="font-medium text-foreground">{demoUser ?? "(unknown)"}</span>{" "}
          via demo mode. Demo sessions are local-only and do not persist
          between users on the same browser.
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
      {isDemo ? <DemoAccountPanel /> : isClerkConfigured ? <ClerkAccountPanel /> : null}
    </div>
  );
}
