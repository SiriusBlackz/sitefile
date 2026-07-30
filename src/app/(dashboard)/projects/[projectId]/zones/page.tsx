"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";

const ZoneMapEditor = dynamic(
  () =>
    import("@/components/zones/zone-map-editor").then(
      (mod) => mod.ZoneMapEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] items-center justify-center rounded-lg border bg-muted">
        <p className="text-muted-foreground">Loading zones...</p>
      </div>
    ),
  }
);

export default function ZonesPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // NEXT_PUBLIC_* vars are statically inlined at build time, so this check is
  // identical on server and client — no window guard, no hydration mismatch.
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const hasMapboxToken =
    mapboxToken.length > 0 && !/placeholder/i.test(mapboxToken);

  // The editor always renders the zone list (rename / recolor / default task
  // still work without a map); only the map canvas needs the token.
  return (
    <div className="space-y-4">
      <ProjectBreadcrumb items={[{ label: "GPS Zones" }]} />
      <h2 className="text-2xl font-bold tracking-tight">GPS Zones</h2>
      <ZoneMapEditor projectId={projectId} mapEnabled={hasMapboxToken} />
    </div>
  );
}
