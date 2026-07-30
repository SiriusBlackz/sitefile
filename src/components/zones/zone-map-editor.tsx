"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { trpc } from "@/lib/trpc";
import { getPolygonBounds } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ZoneMapEditorProps {
  projectId: string;
}

interface PendingZone {
  polygon: { type: "Polygon"; coordinates: [number, number][][] };
  drawId: string;
}

export function ZoneMapEditor({ projectId }: ZoneMapEditorProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [pendingZone, setPendingZone] = useState<PendingZone | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [zoneColor, setZoneColor] = useState("#3B82F6");
  const [defaultTaskId, setDefaultTaskId] = useState<string>("");
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  // Incremented every time the map style finishes loading (initial load and
  // any style change) — zones can only be drawn once the style is ready.
  const [styleGen, setStyleGen] = useState(0);
  const didFitBoundsRef = useRef(false);

  const utils = trpc.useUtils();
  const { data: zones = [] } = trpc.zone.list.useQuery({ projectId });
  const { data: tasks = [] } = trpc.task.list.useQuery({ projectId });

  const createMutation = trpc.zone.create.useMutation({
    onSuccess: () => {
      utils.zone.list.invalidate({ projectId });
      setPendingZone(null);
      setZoneName("");
      setZoneColor("#3B82F6");
      setDefaultTaskId("");
      toast.success("Zone created");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.zone.delete.useMutation({
    onSuccess: () => {
      utils.zone.list.invalidate({ projectId });
      toast.success("Zone deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-1.5, 53.8], // UK default
      zoom: 6,
    });

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    });

    map.addControl(draw);
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // "style.load" fires on initial load and whenever the style is replaced
    // (which wipes custom sources/layers) — bump styleGen so zones re-draw.
    map.on("style.load", () => setStyleGen((gen) => gen + 1));

    map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features[0];
      if (feature?.geometry.type === "Polygon") {
        const geom = feature.geometry as GeoJSON.Polygon;
        setPendingZone({
          polygon: {
            type: "Polygon" as const,
            coordinates: geom.coordinates.map((ring) =>
              ring.map((coord) => [coord[0], coord[1]] as [number, number])
            ),
          },
          drawId: feature.id as string,
        });
      }
    });

    mapRef.current = map;
    drawRef.current = draw;

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, []);

  // Render existing zones on the map — only after the style has loaded
  // (styleGen > 0); adding sources before then silently fails, and a style
  // change wipes them, so this re-runs on every style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleGen === 0) return;

    // Remove old zone layers
    for (const zone of zones) {
      const sourceId = `zone-${zone.id}`;
      if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`);
      if (map.getLayer(`${sourceId}-outline`)) map.removeLayer(`${sourceId}-outline`);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }

    // Add zone layers
    for (const zone of zones) {
      const sourceId = `zone-${zone.id}`;
      const polygon = zone.polygon as GeoJSON.Polygon;

      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { name: zone.name },
          geometry: polygon,
        },
      });

      map.addLayer({
        id: `${sourceId}-fill`,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": zone.color ?? "#3B82F6",
          "fill-opacity": 0.2,
        },
      });

      map.addLayer({
        id: `${sourceId}-outline`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": zone.color ?? "#3B82F6",
          "line-width": 2,
        },
      });
    }

    // Centre the map on the project's zones once, on first draw; keep the
    // default UK view when the project has no zones yet.
    if (zones.length > 0 && !didFitBoundsRef.current) {
      didFitBoundsRef.current = true;
      let minLng = Infinity,
        minLat = Infinity,
        maxLng = -Infinity,
        maxLat = -Infinity;
      for (const zone of zones) {
        const polygon = zone.polygon as GeoJSON.Polygon;
        const { sw, ne } = getPolygonBounds(polygon.coordinates);
        if (sw[0] < minLng) minLng = sw[0];
        if (sw[1] < minLat) minLat = sw[1];
        if (ne[0] > maxLng) maxLng = ne[0];
        if (ne[1] > maxLat) maxLat = ne[1];
      }
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 48, maxZoom: 17, animate: false }
      );
    }
  }, [zones, styleGen]);

  function handleCreateZone() {
    if (!pendingZone || !zoneName) return;
    createMutation.mutate({
      projectId,
      name: zoneName,
      polygon: pendingZone.polygon,
      defaultTaskId: defaultTaskId || null,
      color: zoneColor,
    });
    // Remove from draw control
    if (drawRef.current) {
      drawRef.current.delete(pendingZone.drawId);
    }
  }

  function handleCancelZone() {
    if (pendingZone && drawRef.current) {
      drawRef.current.delete(pendingZone.drawId);
    }
    setPendingZone(null);
    setZoneName("");
  }

  return (
    <div className="flex flex-col gap-4 md:h-[600px] md:flex-row">
      <div className="min-h-[400px] flex-1 rounded-lg overflow-hidden border">
        <div ref={mapContainer} className="h-full w-full" />
      </div>

      <div className="w-full space-y-3 md:w-72 md:overflow-y-auto">
        <h3 className="text-sm font-semibold">Zones</h3>
        {zones.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Draw a polygon on the map to create a zone.
          </p>
        )}
        {zones.map((zone) => (
          <div
            key={zone.id}
            className="flex items-center gap-2 rounded-lg border p-2"
          >
            <div
              className="h-4 w-4 rounded-full shrink-0"
              style={{ backgroundColor: zone.color ?? "#3B82F6" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{zone.name}</p>
              {zone.defaultTask && (
                <Badge variant="outline" className="text-[10px] mt-0.5">
                  {zone.defaultTask.name}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setDeleteZoneId(zone.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog
        open={pendingZone !== null}
        onOpenChange={(open) => {
          if (!open) handleCancelZone();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this Zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Zone Name *</Label>
              <Input
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="e.g. Building A Foundation"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  type="color"
                  value={zoneColor}
                  onChange={(e) => setZoneColor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Task</Label>
                <Select
                  value={defaultTaskId}
                  onValueChange={(val) =>
                    setDefaultTaskId(val === "__none__" ? "" : (val ?? ""))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {"—".repeat(t.depth)} {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelZone}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateZone}
              disabled={!zoneName || createMutation.isPending}
            >
              {createMutation.isPending ? "Saving..." : "Create Zone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteZoneId !== null}
        onOpenChange={(open) => { if (!open) setDeleteZoneId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Zone</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the zone and its GPS associations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteZoneId) deleteMutation.mutate({ id: deleteZoneId });
                setDeleteZoneId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
