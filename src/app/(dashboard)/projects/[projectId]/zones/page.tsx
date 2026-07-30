"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { MapPin } from "lucide-react";

const ZoneMapEditor = dynamic(
  () =>
    import("@/components/zones/zone-map-editor").then(
      (mod) => mod.ZoneMapEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] items-center justify-center rounded-lg border bg-muted">
        <p className="text-muted-foreground">Loading map...</p>
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

  if (!hasMapboxToken) {
    return (
      <div className="space-y-4">
        <ProjectBreadcrumb items={[{ label: "GPS Zones" }]} />
        <h2 className="text-2xl font-bold tracking-tight">GPS Zones</h2>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Maps Unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Maps aren&apos;t available right now. Site zones will appear here
              once maps are enabled.
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer">For administrators</summary>
              <p className="mt-2">
                Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in the environment and
                redeploy to enable maps.
              </p>
            </details>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectBreadcrumb items={[{ label: "GPS Zones" }]} />
      <h2 className="text-2xl font-bold tracking-tight">GPS Zones</h2>
      <ZoneMapEditor projectId={projectId} />
    </div>
  );
}
