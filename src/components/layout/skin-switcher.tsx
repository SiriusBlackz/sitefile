"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Paintbrush } from "lucide-react";

/**
 * Experimental brand-skin trial from the design competition. Entirely
 * client-side and reversible: a data-skin attribute on <html> switches
 * the CSS token blocks appended to globals.css; no attribute = the
 * shipped UI, untouched. Selection persists per device in localStorage
 * and can also be driven by a ?skin= URL param (?skin=off resets).
 */

const STORAGE_KEY = "sitefile.skin";

const SKINS = [
  { id: null, label: "Current" },
  { id: "site-boots", label: "Site Boots", swatch: "#d95000" },
  { id: "friday-report", label: "Friday Report", swatch: "#e8940a" },
  { id: "one-thread", label: "One Thread", swatch: "#f09d1f" },
] as const;

const VALID = new Set(["site-boots", "friday-report", "one-thread"]);

function apply(skin: string | null) {
  if (skin && VALID.has(skin)) {
    document.documentElement.dataset.skin = skin;
  } else {
    delete document.documentElement.dataset.skin;
  }
}

/** Mounted once in the root layout — applies the stored/URL skin. */
export function SkinApplier() {
  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get("skin");
      if (param !== null) {
        if (VALID.has(param)) localStorage.setItem(STORAGE_KEY, param);
        else localStorage.removeItem(STORAGE_KEY);
      }
      apply(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Storage unavailable — skin trial quietly absent.
    }
  }, []);
  return null;
}

/** The picker card, shown on the account page. */
export function SkinSwitcherCard() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    try {
      setActive(localStorage.getItem(STORAGE_KEY));
    } catch {
      // ignore
    }
  }, []);

  function choose(id: string | null) {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    apply(id);
    setActive(id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4" />
          UI skin (experimental)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Trial palettes from the design competition — this device only,
          fully reversible, and it never touches the reports you send.
        </p>
        <div className="flex flex-wrap gap-2">
          {SKINS.map((s) => (
            <Button
              key={s.label}
              variant={active === s.id || (!active && !s.id) ? "default" : "outline"}
              size="sm"
              onClick={() => choose(s.id)}
            >
              {"swatch" in s && s.swatch && (
                <span
                  className="mr-1.5 inline-block h-3 w-3 rounded-full border"
                  style={{ backgroundColor: s.swatch }}
                />
              )}
              {s.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
