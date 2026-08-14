"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { MapPin, Calendar, Film, Play, Check } from "lucide-react";

interface LinkedTask {
  taskId: string;
  taskName: string;
}

export interface EvidenceItem {
  id: string;
  publicUrl: string;
  thumbnailUrl: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  capturedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  type: string;
  note: string | null;
  deviceInfo: string | null;
  uploader: { id: string; name: string } | null;
  linkedTasks: LinkedTask[];
}

interface EvidenceCardProps {
  item: EvidenceItem;
  onClick?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function EvidenceCard({ item, onClick, selected, onToggleSelect }: EvidenceCardProps) {
  const isVideo = item.type === "video";
  const hasGps = item.latitude != null && item.longitude != null;
  const capturedDate = item.capturedAt ? formatDate(item.capturedAt) : null;

  return (
    <Card
      className={`overflow-hidden cursor-pointer transition-all group ${
        selected
          ? "ring-2 ring-primary"
          : "hover:ring-2 hover:ring-primary/20"
      }`}
      onClick={onClick}
    >
      <div className="relative aspect-square bg-muted">
        {isVideo ? (
          <div className="relative flex h-full items-center justify-center bg-zinc-900">
            <video
              src={item.publicUrl}
              preload="metadata"
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
                <Play className="h-5 w-5 text-zinc-900 ml-0.5" />
              </div>
            </div>
            <Badge variant="secondary" className="absolute bottom-1.5 left-1.5 gap-1 text-[10px] bg-black/60 text-white border-0">
              <Film className="h-3 w-3" />
              Video
            </Badge>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- user-uploaded R2 content */
          <img
            src={item.thumbnailUrl ?? item.publicUrl}
            alt={item.originalFilename ?? "Evidence photo"}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Thumbnail missing or unservable — fall back to the original once.
              const img = e.currentTarget;
              if (item.thumbnailUrl && !img.dataset.fellBack) {
                img.dataset.fellBack = "true";
                img.src = item.publicUrl;
              }
            }}
          />
        )}
        {onToggleSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/70 bg-black/30 text-transparent hover:border-white"
            }`}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        {hasGps && (
          <div className="absolute top-1.5 right-1.5">
            <Badge variant="secondary" className="gap-1 text-xs bg-background/80 backdrop-blur-sm">
              <MapPin className="h-3 w-3" />
            </Badge>
          </div>
        )}
      </div>
      <div className="p-2 space-y-1">
        {/* Caption-first: the note is the photo's report title; raw camera
            filenames (IMG_1234.jpg) are a muted fallback, not a headline. */}
        <p
          className={
            item.note
              ? "text-xs font-medium truncate"
              : "text-xs truncate text-muted-foreground"
          }
        >
          {item.note ?? item.originalFilename ?? "Untitled — add a caption"}
        </p>
        {capturedDate && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {capturedDate}
          </div>
        )}
        {item.linkedTasks.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.linkedTasks.map((t) => (
              <Badge key={t.taskId} variant="outline" className="text-[10px] px-1 py-0">
                {t.taskName}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
