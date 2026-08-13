import { inngest } from "../client";
import { deleteStoragePrefix } from "@/server/services/storage";

/**
 * Async storage cleanup after a project row is deleted. The DB delete
 * cascades every table synchronously; R2 objects (photos, thumbnails,
 * report PDFs, client logo) are removed here so the tRPC mutation stays
 * fast and cleanup survives transient R2 failures via Inngest retries.
 * deleteStoragePrefix hard-guards the prefix shape, so this can never
 * delete outside one project's subtree.
 */
export const deleteProjectStorage = inngest.createFunction(
  {
    id: "delete-project-storage",
    retries: 3,
    triggers: [{ event: "project/deleted" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as { projectId: string };
    const deleted = await step.run("delete-storage", () =>
      deleteStoragePrefix(`projects/${projectId}/`)
    );
    return { projectId, objectsDeleted: deleted };
  }
);
