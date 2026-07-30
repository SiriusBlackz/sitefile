import { notFound } from "next/navigation";
import { isDemoMode } from "@/lib/demo";
import { DemoPicker } from "./demo-picker";

/**
 * Internal testing-account picker. Only exists when DEMO_MODE is on —
 * in production this route 404s instead of leaking internal copy and a
 * dead-end cookie flow to anyone who finds the URL.
 */
export default function DemoPage() {
  if (!isDemoMode()) notFound();
  return <DemoPicker />;
}
