"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scales the 210mm (794px) report page to the pane's width so a report
 * reads at desk size rather than postage-stamp size. Shared by the
 * inspection builder and dialog; the progress builder keeps its own copy.
 */
export function A4Preview({ html, minHeight = "70vh" }: { html: string; minHeight?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1.25, Math.max(0.3, el.clientWidth / 794)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrapRef} className="min-h-0 flex-1 overflow-auto rounded border bg-muted/40" style={{ minHeight }}>
      <iframe
        title="Report preview"
        sandbox=""
        srcDoc={html}
        style={{
          width: 794,
          height: `calc(max(${minHeight}, 100%) / ${scale})`,
          minHeight: `calc(${minHeight} / ${scale})`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="bg-white"
      />
    </div>
  );
}
