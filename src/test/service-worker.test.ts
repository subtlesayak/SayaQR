import { describe, expect, it, vi } from "vitest";
import source from "../../public/sw.js?raw";
import manifest from "../../public/manifest.webmanifest?raw";

function worker(failAsset = false) {
  const entries = new Map<string, Response>();
  const handlers: Record<string, (event: any) => void> = {};
  const cache = {
    addAll: vi.fn(async () => {}),
    add: vi.fn(async () => { if (failAsset) throw new Error("Asset unavailable"); }),
    put: vi.fn(async (key: URL | string, value: Response) => { entries.set(String(key), value); }),
    match: vi.fn(async (key: URL | string) => entries.get(String(key))),
  };
  const self = {
    registration: { scope: "https://example.invalid/SayaQR/" },
    location: { origin: "https://example.invalid" },
    addEventListener: (type: string, fn: (event: any) => void) => { handlers[type] = fn; },
    skipWaiting: vi.fn(), clients: { claim: vi.fn() },
  };
  const fetch = vi.fn(async (_input: unknown, _options?: unknown) => new Response('<script src="./assets/app.js"></script><link href="./assets/app.css">'));
  const caches = { open: async () => cache, keys: async () => ["sayaqr-v2", "sayaqr-v3"], delete: vi.fn(async () => true) };
  const api = new Function("self", "caches", "fetch", "URL", "Response", "crypto", source + ";return { networkFirst, receiveShare, cacheFreshShell };")(
    self, caches, fetch, URL, Response, { randomUUID: () => "test-token" },
  );
  return { ...api, handlers, self, caches, cache, fetch, entries };
}

describe("private share and verified offline shell", () => {
  it("uses POST for the installed share target", () => {
    expect(JSON.parse(manifest).share_target).toMatchObject({ method: "POST", action: "./share" });
  });

  it("does not fetch or cache payload-bearing navigation URLs", async () => {
    const w = worker();
    await w.networkFirst({ url: "https://example.invalid/SayaQR/?text=SECRET&url=PRIVATE&theme=dark" });
    expect(w.fetch.mock.calls[0][0]).toBe("https://example.invalid/SayaQR/?theme=dark");
    expect(w.entries.size).toBe(0);
  });

  it("keeps POST payloads in memory for a single local handoff", async () => {
    const w = worker();
    const data = new FormData();
    data.set("text", "PRIVATE QR PAYLOAD");
    const response = await w.receiveShare({ formData: async () => data });
    expect(response.headers.get("location")).toBe("https://example.invalid/SayaQR/#share=test-token");
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.entries.size).toBe(0);
    const reply = vi.fn();
    const event = { source: { url: w.self.registration.scope }, data: { type: "take-share", token: "test-token" }, ports: [{ postMessage: reply }] };
    w.handlers.message(event);
    expect(reply).toHaveBeenLastCalledWith({ value: "PRIVATE QR PAYLOAD" });
    w.handlers.message(event);
    expect(reply).toHaveBeenLastCalledWith({ value: "" });
  });

  it("rejects installation if any required asset fails", async () => {
    const w = worker(true);
    let install: Promise<void> | undefined;
    w.handlers.install({ waitUntil: (promise: Promise<void>) => { install = promise; } });
    await expect(install).rejects.toThrow("Asset unavailable");
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    expect(w.entries.has("https://example.invalid/SayaQR/offline-ready")).toBe(false);
  });

  it("marks readiness only after successful shell caching and removes old caches", async () => {
    const w = worker();
    await w.cacheFreshShell(w.cache);
    expect(w.entries.has("https://example.invalid/SayaQR/offline-ready")).toBe(true);
    let activation: Promise<void> | undefined;
    w.handlers.activate({ waitUntil: (promise: Promise<void>) => { activation = promise; } });
    await activation;
    expect(w.caches.delete).toHaveBeenCalledWith("sayaqr-v2");
    expect(w.caches.delete).not.toHaveBeenCalledWith("sayaqr-v3");
  });
});
