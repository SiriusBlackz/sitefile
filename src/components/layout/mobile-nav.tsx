"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  FolderKanban,
  Menu,
  UserRound,
} from "lucide-react";
import { SitefileMark } from "./sitefile-mark";
import { useState } from "react";
import { OfflineQueueIndicator } from "./offline-queue-indicator";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { CaptureLauncher } from "@/components/capture/capture-launcher";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/account", label: "Account", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden flex h-14 items-center border-b px-4">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger>
          <span className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
            <Menu className="h-5 w-5" />
          </span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-14 items-center gap-2 border-b px-4">
            <SitefileMark size={24} />
            <span className="text-lg font-semibold">Sitefile</span>
          </div>
          <div className="px-2 pt-2">
            <CaptureLauncher variant="primary" onNavigated={() => setOpen(false)} />
          </div>
          <nav className="space-y-1 p-2">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    buttonVariants({ variant: isActive ? "secondary" : "ghost" }),
                    "w-full justify-start gap-2"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2 ml-2">
        <SitefileMark size={20} />
        <span className="font-semibold">Sitefile</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <CaptureLauncher variant="icon" />
        <OfflineQueueIndicator />
        <ThemeToggle />
        <UserMenu />
      </div>
    </div>
  );
}
