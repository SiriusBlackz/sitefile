"use client";

/**
 * Offline drafts for inspection projects — a SEPARATE IndexedDB database
 * from the capture queue (`sitefile-offline`), so this feature can never
 * bump that database's version and strand a cached older page with a
 * VersionError while a Marriott phone is offline (gate C15/C29). Both
 * stores are created at v1 now; this database is never upgraded.
 *
 * A draft holds the itemCreate payload plus its photos as blobs. Draining
 * is item-first: create the item (idempotent on the client-generated id),
 * then hand each photo to the ordinary capture queue tagged with the item
 * id and role, then drain that queue.
 */
import { addToQueue, type OfflineCapture } from "./offline-queue";
import { processOfflineQueue } from "./offline-queue-processor";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/routers/_app";

const DB_NAME = "sitefile-inspection";
const DB_VERSION = 1; // never bump — see header
const ITEM_STORE = "item-drafts";
const OBS_STORE = "observation-drafts"; // Phase C uses this; created now so no upgrade is ever needed

export interface ItemDraft {
  id: string; // becomes the item id (itemCreate is idempotent on it)
  projectId: string;
  visitDate: string;
  stage: "initial_walkthrough" | "interim_reinspection" | "end_of_defects_period";
  payload: Record<string, unknown>; // itemCreate input minus id/visitId
  photos: { blob: Blob; filename: string; mimeType: string; role: string; capturedAt: string; latitude: number | null; longitude: number | null }[];
  createdAt: number;
  status: "pending" | "syncing" | "done" | "error";
  error?: string;
  ref?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEM_STORE)) db.createObjectStore(ITEM_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(OBS_STORE)) db.createObjectStore(OBS_STORE, { keyPath: "id" });
    };
    req.onblocked = () => {
      window.dispatchEvent(new CustomEvent("inspection-db-blocked"));
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveItemDraft(draft: ItemDraft): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEM_STORE, "readwrite");
    tx.objectStore(ITEM_STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function listItemDrafts(projectId?: string): Promise<ItemDraft[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDB();
    const all = await new Promise<ItemDraft[]>((resolve, reject) => {
      const req = db.transaction(ITEM_STORE, "readonly").objectStore(ITEM_STORE).getAll();
      req.onsuccess = () => resolve(req.result as ItemDraft[]);
      req.onerror = () => reject(req.error);
    });
    return projectId ? all.filter((d) => d.projectId === projectId) : all;
  } catch {
    return [];
  }
}
async function patchDraft(id: string, patch: Partial<ItemDraft>) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ITEM_STORE, "readwrite");
    const store = tx.objectStore(ITEM_STORE);
    const req = store.get(id);
    req.onsuccess = () => { if (req.result) store.put({ ...req.result, ...patch }); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function removeItemDraft(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEM_STORE, "readwrite");
    tx.objectStore(ITEM_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let draining = false;
let client: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null;
function trpcClient() {
  if (!client) {
    client = createTRPCProxyClient<AppRouter>({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }) })],
    });
  }
  return client;
}

/** Item-first drain. Safe to call often; single-flight; no-op offline. */
export async function drainInspectionDrafts(): Promise<{ synced: number; remaining: number }> {
  if (typeof window === "undefined" || draining) return { synced: 0, remaining: 0 };
  if (!navigator.onLine) return { synced: 0, remaining: (await listItemDrafts()).filter((d) => d.status !== "done").length };
  draining = true;
  let synced = 0;
  try {
    const drafts = (await listItemDrafts()).filter((d) => d.status === "pending" || d.status === "error");
    for (const d of drafts) {
      try {
        await patchDraft(d.id, { status: "syncing" });
        const api = trpcClient();
        const visit = await api.inspection.visitEnsure.mutate({ projectId: d.projectId, visitDate: d.visitDate, stage: d.stage });
        const item = await api.inspection.itemCreate.mutate({ ...(d.payload as object), projectId: d.projectId, id: d.id, visitId: visit.id } as Parameters<typeof api.inspection.itemCreate.mutate>[0]);
        for (const p of d.photos) {
          const capture: OfflineCapture = {
            id: crypto.randomUUID(),
            projectId: d.projectId,
            blob: p.blob,
            filename: p.filename,
            mimeType: p.mimeType,
            capturedAt: p.capturedAt,
            latitude: p.latitude,
            longitude: p.longitude,
            altitude: null,
            note: "",
            taskId: null,
            inspectionItemId: item.id,
            photoRole: p.role,
            status: "pending",
            createdAt: Date.now(),
          };
          await addToQueue(capture);
        }
        await patchDraft(d.id, { status: "done", ref: item.ref, photos: [] });
        await removeItemDraft(d.id);
        synced++;
      } catch (err) {
        await patchDraft(d.id, { status: "error", error: err instanceof Error ? err.message : "Sync failed" });
      }
    }
    if (synced > 0) await processOfflineQueue();
  } finally {
    draining = false;
    window.dispatchEvent(new CustomEvent("inspection-drafts-changed"));
  }
  return { synced, remaining: (await listItemDrafts()).filter((d) => d.status !== "done").length };
}
