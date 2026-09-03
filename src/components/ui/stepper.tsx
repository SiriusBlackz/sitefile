"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gloves-on counter for the phone ritual: big tap targets, no typing.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  className?: string;
}) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 10) / 10));
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 10) / 10));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          aria-label={`Decrease ${label ?? "value"}`}
          className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-foreground active:bg-muted disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-12 text-center font-mono text-lg font-bold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          aria-label={`Increase ${label ?? "value"}`}
          className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-foreground active:bg-muted disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
