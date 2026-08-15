"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@clerk/nextjs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { labelFor } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkinSwitcherCard } from "@/components/layout/skin-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Paintbrush, UserRound } from "lucide-react";

const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
};

function hasDemoCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("demo_user="));
}

function ProfileCard() {
  const { data: me, isLoading } = trpc.project.currentUser.useQuery();

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted" />;
  }
  if (!me) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="h-5 w-5" />
          Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {me.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{me.name}</div>
            <div className="text-sm text-muted-foreground">{me.email}</div>
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Organisation</dt>
            <dd className="font-medium">{me.orgName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">{labelFor(ROLE_LABELS, me.role)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

const BRAND_PRESETS = ["#3b82f6", "#0f766e", "#b45309", "#9f1239", "#4338ca", "#166534"];

function BrandingCard() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.project.currentUser.useQuery();
  const { data: org, isLoading } = trpc.org.get.useQuery();

  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState("#3b82f6");
  const [companyDetails, setCompanyDetails] = useState("");
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (org && !loaded) {
      setName(org.name);
      setBrandColor(org.brandColor ?? "#3b82f6");
      setCompanyDetails(org.companyDetails ?? "");
      setLoaded(true);
    }
  }, [org, loaded]);

  const updateMutation = trpc.org.update.useMutation({
    onSuccess: () => {
      utils.org.get.invalidate();
      toast.success("Branding saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const uploadMutation = trpc.org.uploadLogo.useMutation({
    onSuccess: () => {
      utils.org.get.invalidate();
      toast.success("Logo uploaded");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.org.removeLogo.useMutation({
    onSuccess: () => {
      utils.org.get.invalidate();
      toast.success("Logo removed");
    },
    onError: (err) => toast.error(err.message),
  });

  function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== "string") return;
      uploadMutation.mutate({ imageBase64: result.split(",")[1] ?? "" });
    };
    reader.readAsDataURL(file);
  }

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted" />;
  }
  if (!org) return null;
  const isAdmin = me?.role === "admin";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paintbrush className="h-5 w-5" />
          Organisation Branding
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your logo, colour and company details appear on every report you
          send to a client.
        </p>

        {/* Logo */}
        <div className="space-y-2">
          <Label>Company logo</Label>
          <div className="flex items-center gap-4">
            {org.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small preview of user upload
              <img
                src={org.logoUrl}
                alt="Company logo"
                className="h-14 max-w-40 rounded border bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-14 w-28 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
                No logo yet
              </div>
            )}
            {isAdmin && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadMutation.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploadMutation.isPending
                    ? "Uploading..."
                    : org.logoUrl
                      ? "Replace"
                      : "Upload logo"}
                </Button>
                {org.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate()}
                  >
                    Remove
                  </Button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files)}
                />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG or WebP, up to 2MB. Shown on the report cover.
          </p>
        </div>

        {isAdmin && (
          <>
            <div className="space-y-2">
              <Label htmlFor="org-name">Company name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Report accent colour</Label>
              <div className="flex items-center gap-2">
                {BRAND_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use colour ${c}`}
                    onClick={() => setBrandColor(c)}
                    className="h-7 w-7 rounded-full border-2"
                    style={{
                      background: c,
                      borderColor: brandColor === c ? "#0f172a" : "transparent",
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                  aria-label="Custom colour"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for headings and highlights throughout your reports.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-details">Company details</Label>
              <Textarea
                id="org-details"
                value={companyDetails}
                onChange={(e) => setCompanyDetails(e.target.value)}
                placeholder={"Riverside Contracts Ltd · Company No. 01234567\r\nUnit 4, Trade Park, Harlow CM20 · 01279 000000"}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Letterhead line on the report cover — company number, address,
                phone.
              </p>
            </div>

            <Button
              disabled={updateMutation.isPending || !name.trim()}
              onClick={() =>
                updateMutation.mutate({
                  name: name.trim(),
                  brandColor,
                  companyDetails: companyDetails.trim() || null,
                })
              }
            >
              {updateMutation.isPending ? "Saving..." : "Save branding"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DemoSessionCard() {
  const router = useRouter();

  const switchUser = () => {
    document.cookie = "demo_user=; path=/; max-age=0";
    router.push("/demo");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Demo session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You are signed in via demo mode. Demo sessions are local-only and do
          not persist between users on the same browser.
        </p>
        <Button variant="outline" onClick={switchUser}>
          <LogOut className="mr-2 h-4 w-4" />
          Switch user
        </Button>
      </CardContent>
    </Card>
  );
}

function ClerkAccountPanel() {
  return (
    <div className="flex justify-center">
      <UserProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border w-full",
          },
        }}
      />
    </div>
  );
}

export default function AccountPage() {
  const [isDemo, setIsDemo] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDemo(hasDemoCookie());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Account</h1>
      <ProfileCard />
      <BrandingCard />
      <SkinSwitcherCard />
      {isDemo ? (
        <DemoSessionCard />
      ) : isClerkConfigured ? (
        <ClerkAccountPanel />
      ) : null}
    </div>
  );
}
