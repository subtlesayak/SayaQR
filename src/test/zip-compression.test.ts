import { describe, expect, it, vi } from "vitest";
import { createZip } from "../lib/zip";
import { zipText } from "./zip-reader";

describe("optional ZIP compression", () => {
  it("round trips compressed UTF-8 names and contents", async () => {
    const content = "<vertex x=\"12.34\" y=\"0\" z=\"2\"/>".repeat(1000);
    const blob = await createZip([{ name: "模型.model", data: content }], { compress: true });
    expect(blob.size).toBeLessThan(content.length / 10);
    expect(await zipText(blob)).toBe("模型.model\n" + content);
  });
  it("falls back to stored ZIP on older browsers", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    try {
      const blob = await createZip([{ name: "test.txt", data: "content".repeat(50) }], { compress: true });
      expect(new DataView(await blob.arrayBuffer()).getUint16(8, true)).toBe(0);
      expect(await zipText(blob)).toContain("content".repeat(50));
    } finally { vi.unstubAllGlobals(); }
  });
});
