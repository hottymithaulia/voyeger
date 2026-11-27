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

type MockToggles = { offline: boolean; failSyncMidway: boolean; version: number };

const mockToggles: MockToggles = { offline: false, failSyncMidway: false, version: 1 };

function packBase(version: number): string {
  const root = import.meta.env["VITE_PACK_BASE_URL"] || "/pack";
  return `${root.replace(/\/$/, "")}/v${version}`;
}

async function getJson<T>(path: string): Promise<T> {
  if (mockToggles.offline) throw new Error("Mock network is offline");
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Mock pack request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function downloadAsset(file: Manifest["files"][number]): Promise<ArrayBuffer> {
  if (mockToggles.offline) throw new Error("Mock network is offline");
  const response = await fetch(file.path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Mock pack request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual.toLowerCase() !== file.sha256.toLowerCase()) throw new Error(`Checksum mismatch: ${file.path}`);
  return bytes;
}

export function readMockToggles(): Readonly<MockToggles> {
  return { ...mockToggles };
}

export function setMockToggle(key: "offline" | "failSyncMidway", value: boolean): void {
  if (key === "offline") mockToggles.offline = value;
  else mockToggles.failSyncMidway = value;
}

export function bumpMockVersion(): void {
  mockToggles.version = 2;
}

export function consumeMockMidwayFailure(): boolean {
  if (!mockToggles.failSyncMidway) return false;
  mockToggles.failSyncMidway = false;
  return true;
}

export class MockApi implements ApiClient {
  async health(): Promise<boolean> {
    return !mockToggles.offline;
  }

  async getManifest(): Promise<Manifest> {
    return getJson<Manifest>(`${packBase(mockToggles.version)}/manifest.json`);
  }

  async getDelta(from: number, to: number): Promise<Delta> {
    if (from === 1 && to === 2) {
      return getJson<Delta>(`${packBase(2)}/delta-from-v1.json`);
    }
    throw new Error(`No sample delta is available from v${from} to v${to}`);
  }

  async getEnrichment(placeIds: string[]): Promise<Record<string, Enrichment>> {
    if (mockToggles.offline) throw new Error("Mock network is offline");
    return Object.fromEntries(placeIds.map((id) => [id, {}]));
  }

  async postEvents(_events: Event[]): Promise<void> {
    if (mockToggles.offline) throw new Error("Mock network is offline");
  }

  async applyPartner(_application: PartnerApplication): Promise<void> {
    if (mockToggles.offline) throw new Error("Mock network is offline");
  }

  async postEnquiry(_enquiry: Enquiry): Promise<void> {
    if (mockToggles.offline) throw new Error("Mock network is offline");
  }

  async getPack(version: number, language: Language): Promise<PackPayload> {
    const manifest = await this.getManifest();
    if (manifest.version !== version) throw new Error("Pack version changed during download");
    const suffixes = ["places.json", "partners.json", `i18n/${language}.json`, "search/index.json"];
    const files = suffixes.map((suffix) => {
      const file = manifest.files.find((entry) => entry.path.endsWith(suffix));
      if (!file) throw new Error(`Required pack file is missing: ${suffix}`);
      return file;
    });
    const bytes = await Promise.all(files.map((file) => downloadAsset(file)));
    const values = bytes.map((data) => JSON.parse(new TextDecoder().decode(data)) as unknown);
    const places = values[0] as PackPayload["places"];
    const partners = values[1] as PackPayload["partners"];
    const text = values[2] as PackPayload["text"];
    const searchIndex = values[3] as PackPayload["searchIndex"];
    return { places, partners, text, searchIndex };
  }

  getAsset(file: Manifest["files"][number]): Promise<ArrayBuffer> {
    return downloadAsset(file);
  }
}