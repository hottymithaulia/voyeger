/// <reference types="vite-plugin-pwa/client" />

function isPreviewHost(hostname: string): boolean {
  const domain = hostname.endsWith(".lovable.app") || hostname.endsWith(".gpt-eng.com") || hostname.endsWith(".gptengineer.run");
  const firstLabel = hostname.split(".")[0] ?? "";
  return domain && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(firstLabel);
}

function isPlatformPreview(hostname: string): boolean {
  const blockedProjectDev = /^project--[^.]+-dev\.(?:lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(hostname);
  const lovableProject = hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com");
  const lovableProjectDev = hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com");
  const beta = hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev");
  return blockedProjectDev || lovableProject || lovableProjectDev || beta;
}

async function unregisterVoyegerWorkers(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => {
        const workers = [registration.active, registration.waiting, registration.installing];
        return workers.some((worker) => worker?.scriptURL.endsWith("/sw.js"));
      })
      .map((registration) => registration.unregister()),
  );
}

export async function registerVoyegerWorker(): Promise<void> {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const hostname = window.location.hostname.toLowerCase();
  const inFrame = window.top !== window.self;
  const disabled = new URLSearchParams(window.location.search).get("sw") === "off";
  const refused =
    !import.meta.env.PROD ||
    inFrame ||
    isPreviewHost(hostname) ||
    isPlatformPreview(hostname) ||
    disabled;
  if (refused) {
    await unregisterVoyegerWorkers();
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}