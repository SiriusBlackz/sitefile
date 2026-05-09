"use client";

import { useEffect, useState, useCallback } from "react";
import { processOfflineQueue } from "./offline-queue-processor";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWA() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);

      // Listen for sync messages from SW
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "PROCESS_OFFLINE_QUEUE") {
          window.dispatchEvent(new CustomEvent("process-offline-queue"));
        }
      });
    }

    // Drain the offline queue. Runs on:
    //   - the `online` event (network came back)
    //   - the SW background-sync trigger ("process-offline-queue")
    //   - manual retries from the indicator ("process-offline-queue")
    //   - tab becoming visible (catches the case where the user re-opens
    //     the PWA after going through a tunnel — visibility flips even
    //     when the online event already fired in the background)
    const drain = () => {
      processOfflineQueue().catch((err) =>
        console.error("[offline-queue] drain failed:", err)
      );
    };

    // Track online status
    const onOnline = () => {
      setIsOnline(true);
      drain();
    };
    const onOffline = () => setIsOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) drain();
    };
    const onProcessQueue = () => drain();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("process-offline-queue", onProcessQueue);
    document.addEventListener("visibilitychange", onVisibility);

    // Drain once on mount in case the tab opened with pending items —
    // common after a quit/relaunch of the PWA after offline capture.
    if (typeof navigator !== "undefined" && navigator.onLine) drain();

    // Capture install prompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("process-offline-queue", onProcessQueue);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (outcome === "accepted") setIsInstalled(true);
    return outcome === "accepted";
  }, [installPrompt]);

  return {
    isOnline,
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
