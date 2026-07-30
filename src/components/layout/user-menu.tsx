"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function hasDemoCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("demo_user="));
}

function DemoUserMenu() {
  const router = useRouter();

  const switchUser = () => {
    document.cookie = "demo_user=; path=/; max-age=0";
    router.push("/demo");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <span
          className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
          aria-label="Account menu"
          title="Account menu"
        >
          <UserRound className="h-4 w-4" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Base UI GroupLabel throws unless nested inside a Group */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Demo session</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={switchUser}>
          <LogOut className="mr-2 h-4 w-4" />
          Switch user
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClerkUserMenu() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return (
    <UserButton
      appearance={{
        elements: { avatarBox: "h-8 w-8" },
      }}
    />
  );
}

export function UserMenu() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setIsDemo(hasDemoCookie());
  }, []);

  if (isDemo) return <DemoUserMenu />;
  if (isClerkConfigured) return <ClerkUserMenu />;
  return null;
}
