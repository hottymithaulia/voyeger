import { describe, expect, it } from "vitest";

import { resolvePackAssetUrl } from "@/lib/assets";

describe("resolvePackAssetUrl", () => {
  it("prepends VITE_API_BASE_URL for /pack/ assets when running in http mode", () => {
    expect(
      resolvePackAssetUrl("/pack/v3/images/birla-mandir-bhopal-placeholder.webp", {
        VITE_API_MODE: "http",
        VITE_API_BASE_URL: "http://127.0.0.1:8000/",
      }),
    ).toBe("http://127.0.0.1:8000/pack/v3/images/birla-mandir-bhopal-placeholder.webp");
  });

  it("keeps relative path unchanged in mock mode or when VITE_API_BASE_URL is empty", () => {
    expect(
      resolvePackAssetUrl("/pack/v1/images/sample.webp", {
        VITE_API_MODE: "mock",
        VITE_API_BASE_URL: "http://127.0.0.1:8000",
      }),
    ).toBe("/pack/v1/images/sample.webp");

    expect(
      resolvePackAssetUrl("/pack/v3/images/sample.webp", {
        VITE_API_MODE: "http",
        VITE_API_BASE_URL: "",
      }),
    ).toBe("/pack/v3/images/sample.webp");
  });
});
