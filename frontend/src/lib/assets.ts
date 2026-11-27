export type PackEnv = Record<string, string | boolean | undefined>;

export function resolvePackAssetUrl(assetPath: string, env: PackEnv = import.meta.env): string {
  if (!assetPath) return assetPath;
  const apiMode = env["VITE_API_MODE"] === "http" ? "http" : "mock";
  const rawBase = env["VITE_API_BASE_URL"];
  const apiBaseUrl = (typeof rawBase === "string" ? rawBase : "").replace(/\/$/, "");
  if (apiMode === "http" && apiBaseUrl && assetPath.startsWith("/pack/")) {
    return `${apiBaseUrl}${assetPath}`;
  }
  return assetPath;
}

export function fallbackPackAssetUrl(currentSrc: string, assetPath: string): string | null {
  if (!assetPath || currentSrc === assetPath) return null;
  if (assetPath.startsWith("/pack/")) return assetPath;
  return null;
}
