"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_WORKING_DAYS } from "@/lib/dates";

const DAY_LABELS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
];

/**
 * Site working-days + timezone — drives diary streaks, coverage % and
 * missed-day nudges. 5, 6 or 7-day weeks per project.
 */
export function WorkingDaysCard({
  projectId,
  workingDays,
  timezone,
}: {
  projectId: string;
  workingDays: unknown;
  timezone: string | null;
}) {
  const utils = trpc.useUtils();
  const initial =
    Array.isArray(workingDays) && workingDays.length > 0
      ? (workingDays as number[])
      : DEFAULT_WORKING_DAYS;
  const [days, setDays] = useState<number[]>(initial);
  const [tz, setTz] = useState(timezone ?? "Europe/London");
  const [dirty, setDirty] = useState(false);

  const update = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("Site calendar saved");
      setDirty(false);
      utils.project.get.invalidate({ id: projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  function toggle(day: number) {
    setDays((prev) => {
      const next = prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b);
      return next.length === 0 ? prev : next; // at least one working day
    });
    setDirty(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Site calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Which days count as working days — drives the site diary&apos;s
            streaks, coverage and missed-day nudges. Tap to toggle.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map(([num, label]) => (
              <button
                key={num}
                type="button"
                onClick={() => toggle(num)}
                aria-pressed={days.includes(num)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  days.includes(num)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:border-muted-foreground/40"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Site timezone (for end-of-day diary locking).
          </p>
          <Input
            list="tz-options"
            value={tz}
            onChange={(e) => {
              setTz(e.target.value);
              setDirty(true);
            }}
            className="w-64"
            aria-label="Site timezone"
          />
          <datalist id="tz-options">
            {(typeof Intl.supportedValuesOf === "function"
              ? Intl.supportedValuesOf("timeZone")
              : ["Europe/London"]
            ).map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </div>
        {dirty && (
          <div className="flex justify-end border-t pt-3">
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({ id: projectId, workingDays: days, timezone: tz })
              }
            >
              {update.isPending ? "Saving..." : "Save site calendar"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
