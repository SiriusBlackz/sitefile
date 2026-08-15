import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../index";
import { gpsZones, evidence } from "@/server/db/schema";
import { assertProjectAccess, assertTaskInProject } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const zoneRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      return ctx.db.query.gpsZones.findMany({
        where: eq(gpsZones.projectId, input.projectId),
        with: {
          defaultTask: { columns: { id: true, name: true } },
        },
      });
    }),

  // Zone harvest: the map never has to start blank. Photo GPS points
  // that fall outside every drawn zone are clustered (greedy, ~60m
  // radius), and clusters of 3+ photos come back as suggested zones —
  // a buffered bounding box the PM just names and confirms.
  harvestSuggestions: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);

      const rows = await ctx.db
        .select({ latitude: evidence.latitude, longitude: evidence.longitude })
        .from(evidence)
        .where(and(eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt)));
      const points = rows.filter(
        (r): r is { latitude: number; longitude: number } =>
          r.latitude != null && r.longitude != null
      );
      if (points.length === 0) return { suggestions: [] };

      const zones = await ctx.db.query.gpsZones.findMany({
        where: eq(gpsZones.projectId, input.projectId),
        columns: { polygon: true },
      });
      const { pointInPolygon } = await import("@/lib/geo");
      const uncovered = points.filter(
        (pt) =>
          !zones.some((zn) =>
            pointInPolygon(
              [pt.longitude, pt.latitude],
              (zn.polygon as { coordinates: number[][][] }).coordinates
            )
          )
      );
      if (uncovered.length < 3) return { suggestions: [] };

      // Greedy clustering: metres via local equirectangular approximation.
      const mPerDegLat = 111_320;
      const CLUSTER_RADIUS_M = 60;
      const clusters: { lat: number; lng: number; pts: typeof uncovered }[] = [];
      for (const pt of uncovered) {
        const mPerDegLng = mPerDegLat * Math.cos((pt.latitude * Math.PI) / 180);
        const hit = clusters.find((c) => {
          const dLat = (pt.latitude - c.lat) * mPerDegLat;
          const dLng = (pt.longitude - c.lng) * mPerDegLng;
          return Math.hypot(dLat, dLng) <= CLUSTER_RADIUS_M;
        });
        if (hit) {
          hit.pts.push(pt);
          hit.lat = hit.pts.reduce((s2, p2) => s2 + p2.latitude, 0) / hit.pts.length;
          hit.lng = hit.pts.reduce((s2, p2) => s2 + p2.longitude, 0) / hit.pts.length;
        } else {
          clusters.push({ lat: pt.latitude, lng: pt.longitude, pts: [pt] });
        }
      }

      const BUFFER_M = 25;
      const suggestions = clusters
        .filter((c) => c.pts.length >= 3)
        .map((c, i) => {
          const lats = c.pts.map((p2) => p2.latitude);
          const lngs = c.pts.map((p2) => p2.longitude);
          const mPerDegLng = mPerDegLat * Math.cos((c.lat * Math.PI) / 180);
          const dLat = BUFFER_M / mPerDegLat;
          const dLng = BUFFER_M / mPerDegLng;
          const minLat = Math.min(...lats) - dLat;
          const maxLat = Math.max(...lats) + dLat;
          const minLng = Math.min(...lngs) - dLng;
          const maxLng = Math.max(...lngs) + dLng;
          return {
            id: `harvest-${i}`,
            count: c.pts.length,
            centroid: { latitude: c.lat, longitude: c.lng },
            polygon: {
              type: "Polygon" as const,
              coordinates: [
                [
                  [minLng, minLat],
                  [maxLng, minLat],
                  [maxLng, maxLat],
                  [minLng, maxLat],
                  [minLng, minLat],
                ] as [number, number][],
              ],
            },
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      return { suggestions };
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1, "Zone name is required"),
        polygon: polygonSchema,
        defaultTaskId: z.string().uuid().nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      if (input.defaultTaskId) {
        await assertTaskInProject(ctx.db, input.defaultTaskId, input.projectId);
      }
      const [zone] = await ctx.db
        .insert(gpsZones)
        .values({
          projectId: input.projectId,
          name: input.name,
          polygon: input.polygon,
          defaultTaskId: input.defaultTaskId ?? null,
          color: input.color ?? "#3B82F6",
        })
        .returning();
      writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "create", entityType: "gps_zone", entityId: zone.id, metadata: { name: zone.name } });
      return zone;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        polygon: polygonSchema.optional(),
        defaultTaskId: z.string().uuid().nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const zone = await ctx.db.query.gpsZones.findFirst({
        where: eq(gpsZones.id, input.id),
        columns: { projectId: true },
      });
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "Zone not found" });
      await assertProjectAccess(ctx.db, zone.projectId, ctx.orgId, ctx.userId);
      if (input.defaultTaskId) {
        await assertTaskInProject(ctx.db, input.defaultTaskId, zone.projectId);
      }

      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(gpsZones)
        .set(data)
        .where(and(eq(gpsZones.id, id), eq(gpsZones.projectId, zone.projectId)))
        .returning();
      writeAuditLogAsync(ctx.db, { projectId: zone.projectId, userId: ctx.userId, action: "update", entityType: "gps_zone", entityId: id });
      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const zone = await ctx.db.query.gpsZones.findFirst({
        where: eq(gpsZones.id, input.id),
        columns: { projectId: true },
      });
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "Zone not found" });
      await assertProjectAccess(ctx.db, zone.projectId, ctx.orgId, ctx.userId);

      await ctx.db.delete(gpsZones).where(eq(gpsZones.id, input.id));
      writeAuditLogAsync(ctx.db, { projectId: zone.projectId, userId: ctx.userId, action: "delete", entityType: "gps_zone", entityId: input.id });
      return { success: true };
    }),
});
