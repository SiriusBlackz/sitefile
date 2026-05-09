/**
 * IndexedDB-backed offline capture queue.
 * Stores photos taken without network and auto-uploads when online.
 */

const DB_NAME = "sitefile-offline";
const DB_VERSION = 2;
const STORE_NAME = "capture-queue";
const STAGING_STORE = "capture-staging";

export interface OfflineCapture {
  id: string;
  projectId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  note: string;
  taskId: string | null;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  createdAt: number;
}

/**
 * Used for the capture → review handoff. We previously stashed photos as
 * data URLs in sessionStorage which would silently truncate large batches
 * (sessionStorage is ~5 MB). IndexedDB stores blobs natively without the
 * base64 inflation and has a much higher quota.
 */
export interface CaptureStaging {
  sessionId: string;
  photos: {
    id: string;
    blob: Blob;
    timestamp: string;
    latitude: number | null;
    longitude: number | null;
  }[];
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STAGING_STORE)) {
        db.createObjectStore(STAGING_STORE, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addToQueue(capture: OfflineCapture): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(capture);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueue(): Promise<OfflineCapture[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingQueue(): Promise<OfflineCapture[]> {
  const all = await getQueue();
  return all.filter((c) => c.status === "pending");
}

export async function updateQueueItem(
  id: string,
  update: Partial<OfflineCapture>
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      if (item) store.put({ ...item, ...update });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearCompleted(): Promise<void> {
  const all = await getQueue();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const item of all) {
      if (item.status === "done") store.delete(item.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getQueueCount(): Promise<number> {
  return getPendingQueue().then((q) => q.length);
}

// ─── Capture staging (capture → review handoff) ───────────────────────────

export async function stashCapture(staging: CaptureStaging): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STAGING_STORE, "readwrite");
    tx.objectStore(STAGING_STORE).put(staging);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStashedCapture(
  sessionId: string
): Promise<CaptureStaging | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STAGING_STORE, "readonly");
    const req = tx.objectStore(STAGING_STORE).get(sessionId);
    req.onsuccess = () => resolve((req.result as CaptureStaging) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearStashedCapture(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STAGING_STORE, "readwrite");
    tx.objectStore(STAGING_STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
