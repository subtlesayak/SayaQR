import { describe, expect, it, vi } from "vitest";
import { ModelJob, type WorkerLike } from "../lib/model-job";

describe("local geometry job lifetime", () => {
  const worker = (): WorkerLike => ({ onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() });
  it("cancels old work and ignores its late completion", async () => {
    const workers: WorkerLike[] = [];
    const job = new ModelJob(() => { const next = worker(); workers.push(next); return next; });
    const first = job.run("first").catch((error) => error.name);
    const progress = vi.fn();
    const second = job.run<string>("second", progress);
    workers[0].onmessage!({ data: { result: "stale" } } as MessageEvent);
    workers[1].onmessage!({ data: { stage: "Checking topology" } } as MessageEvent);
    workers[1].onmessage!({ data: { result: "fresh" } } as MessageEvent);
    expect(await first).toBe("AbortError");
    expect(await second).toBe("fresh");
    expect(progress).toHaveBeenCalledWith("Checking topology");
    expect(workers.every((w) => vi.mocked(w.terminate).mock.calls.length === 1)).toBe(true);
  });

  it("terminates cancelled and failed jobs", async () => {
    const w = worker(), job = new ModelJob(() => w);
    const cancelled = job.run("model");
    job.cancel();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    const failed = job.run("model");
    w.onmessage!({ data: { error: "Invalid geometry" } } as MessageEvent);
    await expect(failed).rejects.toThrow("Invalid geometry");
  });
});
