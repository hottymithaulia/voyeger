/// <reference types="vite-plugin-pwa/client" />

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
  const inFrame = window.top !== window.self;
  const disabled = new URLSearchParams(window.location.search).get("sw") === "off";
  const refused =
    !import.meta.env.PROD ||
    inFrame ||
    disabled;
  if (refused) {
    await unregisterVoyegerWorkers();
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}