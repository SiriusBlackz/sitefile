"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { User } from "lucide-react";
import { SitefileMark } from "@/components/layout/sitefile-mark";

const DEMO_USERS = [
  {
    key: "contractor-1",
    label: "Contractor 1",
    description: "Test as the first contractor with their own projects and data",
  },
  {
    key: "contractor-2",
    label: "Contractor 2",
    description: "Test as a second contractor with separate isolated data",
  },
];

export function DemoPicker() {
  const router = useRouter();

  const selectUser = useCallback((key: string) => {
    document.cookie = `demo_user=${key}; path=/; max-age=${60 * 60 * 24 * 30}`;
    router.push("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12">
            <SitefileMark size={48} />
          </div>
          <h1 className="text-2xl font-bold text-white">Sitefile Demo</h1>
          <p className="text-zinc-400">
            Select your testing account to get started
          </p>
        </div>

        <div className="space-y-3">
          {DEMO_USERS.map((user) => (
            <button
              key={user.key}
              onClick={() => selectUser(user.key)}
              className="w-full flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-blue-600 hover:bg-zinc-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/10 text-blue-500">
                <User className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-white">{user.label}</div>
                <div className="text-sm text-zinc-400">{user.description}</div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-zinc-600">
          Demo mode — each account has isolated data
        </p>
      </div>
    </div>
  );
}
