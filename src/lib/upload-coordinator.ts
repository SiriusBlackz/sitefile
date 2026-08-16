/**
 * Tiny coordination flag between foreground uploads (review page, desktop
 * upload dialog) and the offline-queue drain. Both consume the same
 * per-user upload rate budget; letting the drain fire mid-batch is how
 * "7 photos, 4 uploaded" happened. Foreground work simply wins.
 */

let foregroundUploads = 0;

export function beginForegroundUpload(): void {
  foregroundUploads++;
}

export function endForegroundUpload(): void {
  foregroundUploads = Math.max(0, foregroundUploads - 1);
}

export function isForegroundUploading(): boolean {
  return foregroundUploads > 0;
}
