"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  SwitchCamera,
  Zap,
  ZapOff,
  Image as ImageIcon,
  Send,
  ArrowLeft,
} from "lucide-react";
import { usePWA } from "@/lib/use-pwa";
import { stashCapture } from "@/lib/offline-queue";

interface CapturedPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  timestamp: Date;
  latitude: number | null;
  longitude: number | null;
}

export default function CapturePage() {
  return (
    <Suspense>
      <CaptureContent />
    </Suspense>
  );
}

function CaptureContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureFlash, setCaptureFlash] = useState(false);

  const { isOnline } = usePWA();

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Check flash/torch capability
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
      setHasFlash(!!caps?.torch);

      setCameraReady(true);
      setCameraError(null);
    } catch (err: unknown) {
      setCameraReady(false);
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError("Camera access denied. Please allow camera access in your browser settings and reload.");
      } else if (name === "NotFoundError") {
        setCameraError("No camera found on this device.");
      } else {
        setCameraError("Could not start camera. Please try again.");
      }
    }
  }, [facingMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async camera init must set state on completion
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  // Toggle flash/torch
  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !flashEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setFlashEnabled(next);
    } catch {
      // torch not supported
    }
  }

  // Capture photo
  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Flash animation — clear any pending hide so rapid taps still flash
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setCaptureFlash(true);
    flashTimerRef.current = setTimeout(() => {
      setCaptureFlash(false);
      flashTimerRef.current = null;
    }, 200);

    // Vibrate if available
    navigator.vibrate?.(50);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // URL.createObjectURL keeps the blob in memory but avoids the
        // base64 inflation of toDataURL — important when capturing dozens
        // of photos in one session.
        const previewUrl = URL.createObjectURL(blob);
        const photo: CapturedPhoto = {
          id: crypto.randomUUID(),
          blob,
          previewUrl,
          timestamp: new Date(),
          latitude: null,
          longitude: null,
        };

        // Get GPS — guard against unmounted state updates
        navigator.geolocation?.getCurrentPosition(
          (pos) => {
            if (!mountedRef.current) return;
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === photo.id
                  ? {
                      ...p,
                      latitude: pos.coords.latitude,
                      longitude: pos.coords.longitude,
                    }
                  : p
              )
            );
          },
          () => {},
          { enableHighAccuracy: true, timeout: 5000 }
        );

        setPhotos((prev) => [...prev, photo]);
      },
      "image/jpeg",
      0.95
    );
  }

  // Switch camera
  function switchCamera() {
    setFacingMode((prev) =>
      prev === "environment" ? "user" : "environment"
    );
  }

  // Navigate to review — stash blobs in IndexedDB instead of sessionStorage
  // so large capture batches don't hit the ~5 MB sessionStorage quota.
  async function goToReview() {
    const sessionId = crypto.randomUUID();
    try {
      await stashCapture({
        sessionId,
        photos: photos.map((p) => ({
          id: p.id,
          blob: p.blob,
          timestamp: p.timestamp.toISOString(),
          latitude: p.latitude,
          longitude: p.longitude,
        })),
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error("[capture] stash failed:", err);
      return;
    }
    router.push(
      `/capture/review?projectId=${projectId}&session=${sessionId}`
    );
  }

  if (!projectId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-medium">No project selected</p>
          <p className="text-sm text-zinc-400 mt-2">
            Open a project and tap &quot;Capture&quot; to start taking photos.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/projects")}
          >
            Go to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Camera viewfinder */}
      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label="Live camera feed"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Capture flash overlay */}
        {captureFlash && (
          <div className="absolute inset-0 bg-white/80 pointer-events-none" />
        )}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
          <button
            onClick={() => router.back()}
            className="rounded-full bg-black/40 p-2 active:bg-black/60"
            aria-label="Back to project"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge className="bg-amber-500/90 text-white text-[10px]">
                Offline
              </Badge>
            )}
            {photos.length > 0 && (
              <Badge className="bg-blue-500/90 text-white">
                {photos.length} photo{photos.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          <button
            onClick={toggleFlash}
            disabled={!hasFlash}
            className="rounded-full bg-black/40 p-2 active:bg-black/60 disabled:opacity-30"
            aria-label={flashEnabled ? "Turn off flash" : "Turn on flash"}
          >
            {flashEnabled ? (
              <Zap className="h-5 w-5 text-yellow-400" />
            ) : (
              <ZapOff className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Camera not ready */}
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            {cameraError ? (
              <div className="text-center" role="alert">
                <Camera className="h-10 w-10 text-zinc-500 mx-auto mb-3" />
                <p className="text-zinc-300 font-medium">{cameraError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => { setCameraError(null); startCamera(); }}
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <p className="text-zinc-400">Starting camera...</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between bg-black px-6 py-5 safe-bottom">
        {/* Thumbnail of last capture */}
        <button
          onClick={photos.length > 0 ? goToReview : undefined}
          className="h-12 w-12 rounded-lg overflow-hidden border-2 border-zinc-700 bg-zinc-900"
          aria-label={photos.length > 0 ? "Review captured photos" : "No photos captured"}
        >
          {photos.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element -- camera data URL
            <img
              src={photos[photos.length - 1].previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-5 w-5 m-auto text-zinc-600" />
          )}
        </button>

        {/* Capture button */}
        <button
          onClick={capturePhoto}
          disabled={!cameraReady}
          className="h-[72px] w-[72px] rounded-full border-[5px] border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
          aria-label="Take photo"
        >
          <div className="h-[58px] w-[58px] rounded-full bg-white" />
        </button>

        {/* Switch camera */}
        <button
          onClick={switchCamera}
          className="rounded-full bg-zinc-800 p-3 active:bg-zinc-700"
          aria-label="Switch camera"
        >
          <SwitchCamera className="h-5 w-5" />
        </button>
      </div>

      {/* Batch indicator - tap to review */}
      {photos.length > 0 && (
        <button
          onClick={goToReview}
          className="flex items-center justify-center gap-2 bg-blue-600 py-3 text-sm font-medium active:bg-blue-700"
        >
          <Send className="h-4 w-4" />
          Review & Upload {photos.length} Photo{photos.length !== 1 ? "s" : ""}
        </button>
      )}
    </>
  );
}
