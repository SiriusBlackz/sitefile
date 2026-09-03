import { cn } from "@/lib/utils";
import type { DiaryProvenance } from "@/server/db/enums";

const LABELS: Record<DiaryProvenance, string> = {
  auto: "AUTO",
  carried: "CARRIED",
  edited: "EDITED",
  you: "YOU",
};

/**
 * Evidential provenance stamp — costs the foreman nothing, defeats
 * "rubber-stamping" attacks: AUTO the system observed; CARRIED prefilled
 * from yesterday and left untouched; EDITED adjusted today; YOU entered
 * fresh.
 */
export function ProvenanceChip({
  value,
  className,
}: {
  value: DiaryProvenance;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1 py-px font-mono text-[8px] font-bold tracking-widest",
        value === "auto" && "bg-muted text-muted-foreground",
        value === "carried" &&
          "border border-dashed border-muted-foreground/40 text-muted-foreground",
        value === "edited" && "bg-accent text-(--accent-ink)",
        value === "you" && "bg-foreground/90 text-background",
        className
      )}
      title={
        value === "auto"
          ? "Recorded automatically"
          : value === "carried"
            ? "Carried from yesterday, unchanged"
            : value === "edited"
              ? "Adjusted today"
              : "Entered today"
      }
    >
      {LABELS[value]}
    </span>
  );
}
