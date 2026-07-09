import { describe, expect, it } from "vitest";
import serviceWorker from "../../public/sw.js?raw";

describe("service worker caching", () => {
  it("uses a bumped cache namespace", () => {
    expect(serviceWorker).toContain('CACHE_NAME = "sayaqr-v2"');
    expect(serviceWorker).toContain('key.startsWith("sayaqr-")');
  });

  it("serves navigations with a network-first strategy", () => {
    expect(serviceWorker).toContain("function networkFirst");
    expect(serviceWorker).toContain("isNavigationRequest(event.request) ? networkFirst(event.request) : cacheFirst(event.request)");
  });
});