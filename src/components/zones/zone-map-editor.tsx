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
import { MapPin, Pencil, PenLine, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ZoneMapEditorProps {
  projectId: string;
  /** False when NEXT_PUBLIC_MAPBOX_TOKEN is missing — the zone list still
   * renders and zones remain editable; only the map canvas is replaced. */
  mapEnabled: boolean;
}

interface PendingZone {
  polygon: { type: "Polygon"; coordinates: [number, number][][] };
  drawId: string;
}

export function ZoneMapEditor({ projectId, mapEnabled }: ZoneMapEditorProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [pendingZone, setPendingZone] = useState<PendingZone | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [zoneColor, setZoneColor] = useState("#3B82F6");
  const [defaultTaskId, setDefaultTaskId] = useState<string>("");
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  const [editZoneId, setEditZoneId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#3B82F6");
  const [editTaskId, setEditTaskId] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);
  // Address/place search — most users are on phones, so typing the site
  // address beats pan-and-pinch hunting across a country-level map.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; name: string; center: [number, number] }[]
  >([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Set when Mapbox rejects tile/search requests (403 = account/billing
  // problem) — a silent white map looks like an app bug; name the cause.
  const [mapDegraded, setMapDegraded] = useState(false);
  // Incremented every time the map style finishes loading (initial load and
  // any style change) — zones can only be drawn once the style is ready.
  const [styleGen, setStyleGen] = useState(0);
  const didFitBoundsRef = useRef(false);

  const utils = trpc.useUtils();
  const { data: zones = [] } = trpc.zone.list.useQuery({ projectId });
  // Harvested zone suggestions: clusters of photo GPS outside every
  // drawn zone — the map never has to start blank.
  const { data: harvest } = trpc.zone.harvestSuggestions.useQuery({ projectId });
  const suggestions = harvest?.suggestions ?? [];
  const [harvestNames, setHarvestNames] = useState<Record<string, string>>({});
  const { data: tasks = [] } = trpc.task.list.useQuery({ projectId });

  // Base UI renders the raw value (a task UUID) in the trigger when the value
  // is preset and the popup has never mounted — `items` supplies the labels.
  const taskItems = {
    "": "None",
    __none__: "None",
    ...Object.fromEntries(tasks.map((t) => [t.id, t.name])),
  };

  const createMutation = trpc.zone.create.useMutation({
    onSuccess: () => {
      utils.zone.list.invalidate({ projectId });
      utils.zone.harvestSuggestions.invalidate({ projectId });
      setPendingZone(null);
      setZoneName("");
      setZoneColor("#3B82F6");
      setDefaultTaskId("");
      toast.success("Zone created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.zone.update.useMutation({
    onSuccess: () => {
      utils.zone.list.invalidate({ projectId });
      setEditZoneId(null);
      toast.success("Zone updated");
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
    if (!mapEnabled || !mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      // Satellite imagery: contractors recognise their site by buildings
      // and groundworks, not street lines — and it matches the report's
      // photo-location map style.
      style: "mapbox://styles/mapbox/satellite-streets-v12",
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

    // Surface tile 401/403s (token or account/billing rejection) instead of
    // leaving a silent blank map.
    map.on("error", (e) => {
      const status = (e.error as { status?: number } | undefined)?.status;
      if (status === 401 || status === 403) setMapDegraded(true);
    });

    // "style.load" fires on initial load and whenever the style is replaced
    // (which wipes custom sources/layers) — bump styleGen so zones re-draw.
    map.on("style.load", () => setStyleGen((gen) => gen + 1));

    // Mode drops back to simple_select when a polygon is finished or the
    // user presses Escape — either way the "drawing" hint should clear.
    map.on("draw.modechange", (e: { mode: string }) => {
      setIsDrawing(e.mode === "draw_polygon");
    });

    map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
      setIsDrawing(false);
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
  }, [mapEnabled]);

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

    // Harvested suggestions render as dashed amber outlines — clearly
    // provisional, never solid until confirmed.
    for (let i = 0; i < 8; i++) {
      const sid = `harvest-${i}`;
      if (map.getLayer(`${sid}-outline`)) map.removeLayer(`${sid}-outline`);
      if (map.getLayer(`${sid}-fill`)) map.removeLayer(`${sid}-fill`);
      if (map.getSource(sid)) map.removeSource(sid);
    }
    for (const sug of suggestions) {
      const sid = sug.id;
      map.addSource(sid, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: sug.polygon },
      });
      map.addLayer({
        id: `${sid}-fill`,
        type: "fill",
        source: sid,
        paint: { "fill-color": "#E8940A", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: `${sid}-outline`,
        type: "line",
        source: sid,
        paint: {
          "line-color": "#E8940A",
          "line-width": 2,
          "line-dasharray": [2, 2],
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
  }, [zones, suggestions, styleGen]);

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

  function runSearch(query: string) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!query.trim() || !token) {
      setSearchResults([]);
      return;
    }
    // POI types included so site landmarks ("Stansted Airport") resolve,
    // GB-biased for the pilot, proximity-biased to wherever the map sits.
    const center = mapRef.current?.getCenter();
    const params = new URLSearchParams({
      access_token: token,
      limit: "5",
      autocomplete: "true",
      country: "GB",
      types: "poi,address,place,postcode,locality",
    });
    if (center) params.set("proximity", `${center.lng},${center.lat}`);
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        query
      )}.json?${params.toString()}`
    )
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401 || r.status === 403) setMapDegraded(true);
          toast.error("Address search is unavailable right now.");
          throw new Error(`geocoding ${r.status}`);
        }
        return r.json();
      })
      .then(
        (data: {
          features?: { id: string; place_name: string; center: [number, number] }[];
        }) => {
          setSearchResults(
            (data.features ?? []).map((f) => ({
              id: f.id,
              name: f.place_name,
              center: f.center,
            }))
          );
        }
      )
      .catch(() => setSearchResults([]));
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    if (value.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => runSearch(value), 350);
  }

  function selectSearchResult(result: {
    name: string;
    center: [number, number];
  }) {
    mapRef.current?.flyTo({ center: result.center, zoom: 16 });
    setSearchQuery(result.name);
    setSearchResults([]);
  }

  function startDrawing() {
    drawRef.current?.changeMode("draw_polygon");
    setIsDrawing(true);
  }

  function cancelDrawing() {
    drawRef.current?.changeMode("simple_select");
    setIsDrawing(false);
  }

  function openEditZone(zone: (typeof zones)[number]) {
    setEditZoneId(zone.id);
    setEditName(zone.name);
    setEditColor(zone.color ?? "#3B82F6");
    setEditTaskId(zone.defaultTaskId ?? "");
  }

  function handleUpdateZone() {
    if (!editZoneId || !editName) return;
    updateMutation.mutate({
      id: editZoneId,
      name: editName,
      color: editColor,
      defaultTaskId: editTaskId || null,
    });
  }

  return (
    <div className="flex flex-col gap-4 md:h-[600px] md:flex-row">
      {mapEnabled ? (
        <div className="relative min-h-[400px] flex-1 rounded-lg overflow-hidden border">
          <div ref={mapContainer} className="h-full w-full" />
          {/* Always light: the box floats over map imagery, which is light in
              both app themes — theme tokens made it invisible in dark mode. */}
          <div className="absolute left-2 top-2 z-10 w-72 max-w-[calc(100%-4rem)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    clearTimeout(searchTimerRef.current);
                    runSearch(searchQuery);
                  }
                }}
                placeholder="Search site address or postcode"
                aria-label="Search for a location"
                className="border-slate-300 bg-white pl-8 text-slate-900 shadow-md placeholder:text-slate-500"
              />
            </div>
            {searchResults.length > 0 && (
              <ul className="mt-1 overflow-hidden rounded-md border border-slate-300 bg-white text-slate-900 shadow-md">
                {searchResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                      onClick={() => selectSearchResult(r)}
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {mapDegraded && (
            <div className="absolute inset-x-2 bottom-2 z-10 rounded-md border border-amber-500/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-md dark:bg-amber-950 dark:text-amber-300">
              Map imagery couldn&apos;t load — Mapbox is refusing requests for
              this account (usually a billing or usage-limit issue). Zones
              still save and work; check the Mapbox account to restore the
              map.
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-[400px] flex-1 items-center justify-center rounded-lg border bg-muted/40 p-6">
          <div className="max-w-sm space-y-2 text-center text-sm text-muted-foreground">
            <MapPin className="mx-auto h-8 w-8" />
            <p className="font-medium text-foreground">Maps unavailable</p>
            <p>
              Maps aren&apos;t available right now, so new zones can&apos;t be
              drawn. Existing zones can still be edited from the list.
            </p>
            <details className="text-left text-xs">
              <summary className="cursor-pointer">For administrators</summary>
              <p className="mt-2">
                Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in the environment
                and redeploy to enable maps.
              </p>
            </details>
          </div>
        </div>
      )}

      <div className="w-full space-y-3 md:w-72 md:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Zones</h3>
          {mapEnabled &&
            (isDrawing ? (
              <Button variant="outline" size="xs" onClick={cancelDrawing}>
                Cancel drawing
              </Button>
            ) : (
              <Button size="xs" onClick={startDrawing}>
                <PenLine className="h-3 w-3" />
                Draw new zone
              </Button>
            ))}
        </div>
        {isDrawing && (
          <p className="rounded-md border border-dashed bg-muted p-2 text-xs text-muted-foreground">
            Click the map to add corner points, then double-click (or press
            Enter) to close the zone.
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/50 bg-accent/40 p-2.5">
            <p className="text-xs font-medium">
              Suggested from your photos — confirm to create:
            </p>
            {suggestions.map((sug) => (
              <div key={sug.id} className="space-y-1.5">
                <button
                  type="button"
                  className="text-left text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    mapRef.current?.flyTo({
                      center: [sug.centroid.longitude, sug.centroid.latitude],
                      zoom: 17,
                    })
                  }
                >
                  {sug.count} photos cluster here — name this zone?
                </button>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={harvestNames[sug.id] ?? ""}
                    onChange={(e) =>
                      setHarvestNames((prev) => ({
                        ...prev,
                        [sug.id]: e.target.value,
                      }))
                    }
                    placeholder="e.g. Car park works"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="xs"
                    disabled={
                      !harvestNames[sug.id]?.trim() || createMutation.isPending
                    }
                    onClick={() =>
                      createMutation.mutate({
                        projectId,
                        name: harvestNames[sug.id].trim(),
                        polygon: sug.polygon,
                        defaultTaskId: null,
                        color: "#E8940A",
                      })
                    }
                  >
                    Create
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {zones.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {mapEnabled
              ? "No zones yet. Click “Draw new zone”, then click the map to outline an area."
              : "No zones yet. Zones are drawn on the map, which is currently unavailable."}
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
              aria-label={`Edit zone ${zone.name}`}
              onClick={() => openEditZone(zone)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete zone ${zone.name}`}
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

      <Dialog
        open={editZoneId !== null}
        onOpenChange={(open) => {
          if (!open) setEditZoneId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Zone Name *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Building A Foundation"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Task</Label>
                <Select
                  items={taskItems}
                  value={editTaskId}
                  onValueChange={(val) =>
                    setEditTaskId(val === "__none__" ? "" : (val ?? ""))
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
            <p className="text-xs text-muted-foreground">
              To change the zone&apos;s shape, delete it and draw a new one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditZoneId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateZone}
              disabled={!editName || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
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
