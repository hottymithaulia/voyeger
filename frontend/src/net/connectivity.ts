import { api } from "@/net/api";
import type { AppConnectivity } from "@/types";

export async function probeConnectivity(): Promise<AppConnectivity> {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.onLine) return "OFFLINE";
  const timeout = new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(false), 2000);
  });
  const healthy = await Promise.race([api.health(), timeout]);
  return healthy ? "ONLINE_IDLE" : "OFFLINE";
}