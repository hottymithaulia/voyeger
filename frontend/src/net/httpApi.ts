import type { ApiClient } from "@/net/api";
import type {
  Delta,
  Enquiry,
  Enrichment,
  Event,
  Language,
  Manifest,
  PackPayload,
  PartnerApplication,
} from "@/types";

export class HttpApi implements ApiClient {
  private readonly baseUrl = (import.meta.env["VITE_API_BASE_URL"] || "").replace(/\/$/, "");

  private async fetchAsset(path: string): Promise<Response> {
    const base = this.baseUrl || window.location.origin;
    return fetch(new URL(path, base));
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!response.ok) throw new Error(`Voyeger API request failed (${response.status})`);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, { method: "HEAD" });
      if (response.status === 404 || response.status === 405 || response.status === 501) {
        const fallback = await fetch(`${this.baseUrl}/api/health`);
        return fallback.ok;
      }
      return response.ok;
    } catch {
      return false;
    }
  }

  getManifest(): Promise<Manifest> {
    return this.request("/api/manifest");
  }

  getDelta(from: number, to: number): Promise<Delta> {
    return this.request(`/api/delta?from=${from}&to=${to}`);
  }

  getEnrichment(placeIds: string[]): Promise<Record<string, Enrichment>> {
    return this.request(`/api/enrichment?place_ids=${encodeURIComponent(placeIds.join(","))}`);
  }

  async postEvents(events: Event[]): Promise<void> {
    await this.request<void>("/api/events", { method: "POST", body: JSON.stringify(events) });
  }

  async applyPartner(application: PartnerApplication): Promise<void> {
    await this.request<void>("/api/partners/apply", { method: "POST", body: JSON.stringify(application) });
  }

  async postEnquiry(enquiry: Enquiry): Promise<void> {
    await this.request<void>("/api/enquiries", { method: "POST", body: JSON.stringify(enquiry) });
  }

  async getPack(version: number, language: Language): Promise<PackPayload> {
    const manifest = await this.getManifest();
    if (manifest.version !== version) throw new Error("Pack version changed during download");
    const files = manifest.files.filter((file) =>
      file.path.endsWith("places.json") ||
      file.path.endsWith("partners.json") ||
      file.path.endsWith(`i18n/${language}.json`) ||
      file.path.endsWith("search/index.json"),
    );
    const loaded = await Promise.all(files.map(async (file) => [file.path, await this.getAsset(file)] as const));
    const values = new Map(loaded);
    const getPath = (suffix: string) => {
      const entry = files.find((file) => file.path.endsWith(suffix));
      const data = entry ? values.get(entry.path) : undefined;
      return data ? JSON.parse(new TextDecoder().decode(data)) as unknown : undefined;
    };
    return {
      places: getPath("places.json") as PackPayload["places"],
      partners: getPath("partners.json") as PackPayload["partners"],
      text: getPath(`i18n/${language}.json`) as PackPayload["text"],
      searchIndex: getPath("search/index.json") as PackPayload["searchIndex"],
    };
  }

  async getAsset(file: Manifest["files"][number]): Promise<ArrayBuffer> {
    const response = await this.fetchAsset(file.path);
    if (!response.ok) throw new Error(`Pack file unavailable: ${file.path}`);
    const bytes = await response.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual.toLowerCase() !== file.sha256.toLowerCase()) throw new Error(`Checksum mismatch: ${file.path}`);
    return bytes;
  }
}