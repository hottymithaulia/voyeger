import type { Delta, Enquiry, Event, Manifest, PackPayload, PartnerApplication, Enrichment } from "@/types";
import { HttpApi } from "@/net/httpApi";
import { MockApi } from "@/net/mockApi";

export interface ApiClient {
  health(): Promise<boolean>;
  getManifest(): Promise<Manifest>;
  getDelta(from: number, to: number): Promise<Delta>;
  getEnrichment(placeIds: string[]): Promise<Record<string, Enrichment>>;
  postEvents(events: Event[]): Promise<void>;
  applyPartner(app: PartnerApplication): Promise<void>;
  postEnquiry(enquiry: Enquiry): Promise<void>;
  getPack(version: number, language: "en" | "hi"): Promise<PackPayload>;
  getAsset(file: Manifest["files"][number]): Promise<ArrayBuffer>;
}

export const apiMode = import.meta.env["VITE_API_MODE"] === "http" ? "http" : "mock";
export const api: ApiClient = apiMode === "http" ? new HttpApi() : new MockApi();