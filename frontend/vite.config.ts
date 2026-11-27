// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin, PluginOption } from "vite";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

const pwaOptions: Partial<VitePWAOptions> = {
  strategies: "generateSW",
  filename: "sw.js",
  outDir: "dist/client",
  registerType: "autoUpdate",
  injectRegister: null,
  includeAssets: ["favicon.ico", "icons/voyeger-192.png", "icons/voyeger-512.png"],
  manifest: {
    id: "/",
    name: "Voyeger — Bhopal",
    short_name: "Voyeger",
    description: "An offline-first guide to Bhopal.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f2",
    theme_color: "#b91c1c",
    icons: [
      { src: "/icons/voyeger-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/voyeger-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  },
  devOptions: { enabled: false },
  workbox: {
    globDirectory: "dist/client",
    globPatterns: ["index.html", "assets/*.{js,css}"],
    navigateFallback: "index.html",
    navigateFallbackDenylist: [/^\/~oauth(?:\/|$)/],
    runtimeCaching: [
      {
        urlPattern: /\/api\/(?:manifest|delta)(?:\?|$)/,
        handler: "NetworkFirst",
        options: { cacheName: "voyeger-api", networkTimeoutSeconds: 3, expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 } },
      },
      {
        urlPattern: /\/pack\/v\d+\/.*\.json$/i,
        handler: "CacheFirst",
        options: { cacheName: "voyeger-pack-json", expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 } },
      },
      {
        urlPattern: /\/pack\/v\d+\/images\/.*\.(?:webp|png|jpg|jpeg)$/i,
        handler: "CacheFirst",
        options: { cacheName: "img-v1", expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 365 } },
      },
      {
        urlPattern: /\/tiles\/bhopal\.pmtiles$/,
        handler: "CacheFirst",
        options: { cacheName: "map-tiles-v1", rangeRequests: true },
      },
      {
        urlPattern: /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "osm-fallback-tiles",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      { urlPattern: /\.(?:mp4|webm)(?:\?.*)?$/i, handler: "NetworkOnly" },
    ],
  },
};

const pwaPlugins = VitePWA(pwaOptions);

function generateSwAfterPrerender(): Plugin {
  return {
    name: "voyeger:pwa-post-prerender",
    apply: "build",
    enforce: "post",
    buildApp: {
      order: "post",
      async handler(builder) {
        const mainPlugin = builder.config.plugins.find((p) => p.name === "vite-plugin-pwa") as
          | { api?: { generateSW?: () => Promise<void> } }
          | undefined;
        if (mainPlugin?.api?.generateSW) {
          await mainPlugin.api.generateSW();
        }
      },
    },
  };
}

export default defineConfig({
  nitro: false,
  vite: {
    optimizeDeps: {
      include: [
        "use-sync-external-store/shim",
        "use-sync-external-store/shim/with-selector",
        "@tanstack/react-store",
        "maplibre-gl",
        "pmtiles",
      ],
    },
    plugins: [pwaPlugins as unknown as PluginOption, generateSwAfterPrerender()],
  },
  tanstackStart: {
    server: { entry: "server" },
    spa: {
      enabled: true,
      prerender: {
        outputPath: "/index.html",
      },
    },
  },
});
