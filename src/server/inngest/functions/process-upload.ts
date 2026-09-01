import { inngest } from "../client";
import { db } from "@/server/db";
import { evidence } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const processUpload = inngest.createFunction(
  {
    id: "process-upload",
    retries: 2,
    triggers: [{ event: "evidence/uploaded" }],
  },
  async ({ event, step }) => {
    const { evidenceId } = event.data as { evidenceId: string };

    // Step 1: Fetch the evidence record
    const record = await step.run("fetch-evidence", async () => {
      const item = await db.query.evidence.findFirst({
        where: eq(evidence.id, evidenceId),
      });
      if (!item) throw new Error(`Evidence ${evidenceId} not found`);
      return item;
    });

    // Step 2: Generate thumbnail (photos only)
    if (record.type === "photo") {
      const thumbnailKey = await step.run("generate-thumbnail", async () => {
        const { fetchFromStorage, uploadToStorage } = await import(
          "@/server/services/storage"
        );

        // Fetch the original image bytes directly from storage (R2 or disk)
        const imageBuffer = await fetchFromStorage(record.storageKey);
        if (!imageBuffer) {
          console.warn(
            `[process-upload] Could not fetch image for thumbnail: ${record.storageKey}`
          );
          return null;
        }

        // Generate thumbnail with sharp
        let sharp: typeof import("sharp");
        try {
          sharp = (await import("sharp")).default;
        } catch {
          console.warn("[process-upload] sharp not available, skipping thumbnail");
          return null;
        }

        const thumbBuffer = await sharp(imageBuffer)
          .resize(400, 400, { fit: "cover", position: "centre" })
          .jpeg({ quality: 75 })
          .toBuffer();

        const thumbKey = record.storageKey.replace(/\/([^/]+)$/, "/thumb_$1");
        await uploadToStorage(thumbKey, thumbBuffer, "image/jpeg");

        return thumbKey;
      });

      // Step 3: Update evidence record with thumbnail
      if (thumbnailKey) {
        await step.run("update-thumbnail", async () => {
          await db
            .update(evidence)
            .set({ thumbnailKey })
            .where(eq(evidence.id, evidenceId));
        });
      }
    }

    return { evidenceId, processed: true };
  }
);
