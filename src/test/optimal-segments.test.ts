import { afterEach, describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import { qrcodegen } from "../lib/nayuki-qrcodegen";
import * as optimal from "../lib/optimal-segments";
import { createQrCode, type ErrorCorrectionLevel } from "../lib/qr";

const { QrSegment, QrCode } = qrcodegen;

function decode(qr: qrcodegen.QrCode): string | undefined {
  const scale = 5;
  const width = (qr.size + 8) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      if (!qr.getModule(Math.floor(x / scale) - 4, Math.floor(y / scale) - 4)) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  return jsQR(pixels, width, width)?.data;
}

function bruteForceBits(text: string, version: number): number {
  const chars = Array.from(text);
  const costs = new Array<number>(chars.length + 1).fill(Infinity);
  costs[0] = 0;
  for (let end = 1; end <= chars.length; end++) {
    for (let start = 0; start < end; start++) {
      const part = chars.slice(start, end).join("");
      const candidates = [QrSegment.makeBytes(Array.from(new TextEncoder().encode(part)))];
      if (QrSegment.isNumeric(part)) candidates.push(QrSegment.makeNumeric(part));
      if (QrSegment.isAlphanumeric(part)) candidates.push(QrSegment.makeAlphanumeric(part));
      for (const segment of candidates) {
        costs[end] = Math.min(costs[end], costs[start] + QrSegment.getTotalBits([segment], version));
      }
    }
  }
  return costs[chars.length];
}

afterEach(() => vi.restoreAllMocks());

describe("optimal QR segmentation", () => {
  it("matches an exhaustive partition search across all header-width groups", () => {
    const samples = ["", "a12345678901234567890b", "ABC12345678901234567890XYZ", "aABCDEFGHIJKLMNOz", "1a22A333", "hello", "മലയാളം12345678901234567890😀"];
    const alphabet = ["a", "A", "1", "😀"];
    for (let index = 0; index < 256; index++) {
      samples.push(Array.from({ length: 4 }, (_, digit) => alphabet[(index >> (digit * 2)) & 3]).join(""));
    }
    for (const version of [1, 9, 10, 26, 27, 40]) {
      for (const sample of samples) {
        expect(QrSegment.getTotalBits(optimal.makeOptimalSegments(sample, version), version)).toBe(bruteForceBits(sample, version));
      }
    }
  });

  it.each<ErrorCorrectionLevel>(["LOW", "MEDIUM", "QUARTILE", "HIGH"])("reduces mixed-content grids at %s without losing content", (ecc) => {
    const payload = "https://example.com/item/" + "1234567890".repeat(12);
    const qr = createQrCode(payload, ecc);
    const baseline = QrCode.encodeText(payload, QrCode.Ecc[ecc]);
    expect(qr.version).toBeLessThan(baseline.version);
    expect(qr.errorCorrectionLevel.ordinal).toBeGreaterThanOrEqual(QrCode.Ecc[ecc].ordinal);
    expect(decode(qr)).toBe(payload);
  });

  it.each([
    "", "12345678901234567890", "HELLO WORLD 123", "plain lowercase text",
    "WIFI:T:WPA;S:Cafe123;P:12345678901234567890;;",
    "upi://pay?pa=shop@bank&am=12345.67&pn=Shop",
    "BEGIN:VCARD\nVERSION:3.0\nFN:Test Contact\nTEL:+123456789012345\nEND:VCARD",
    "മലയാളം 😀 café 日本語 12345678901234567890",
  ])("preserves the payload and never increases grid size: %s", (payload) => {
    const qr = createQrCode(payload);
    expect(qr.size).toBeLessThanOrEqual(QrCode.encodeText(payload, QrCode.Ecc.HIGH).size);
    // Empty QR payloads need no round-trip decoder check.
    if (payload) expect(decode(qr)).toBe(payload);
  });

  it.each([20, 140, 290])("handles version-group transitions for %i numeric blocks", (count) => {
    const payload = "item:" + "1234567890".repeat(count);
    const qr = createQrCode(payload, "LOW");
    expect(qr.size).toBeLessThanOrEqual(QrCode.encodeText(payload, QrCode.Ecc.LOW).size);
    expect(decode(qr)).toBe(payload);
  });

  it("can encode mixed content that exceeds the original byte-mode capacity", () => {
    const payload = "a" + "1234567890".repeat(300);
    expect(() => QrCode.encodeText(payload, QrCode.Ecc.LOW)).toThrow("Data too long");
    expect(decode(createQrCode(payload, "LOW"))).toBe(payload);
  });

  it("recomputes segment headers when a payload needs version 27 or higher", () => {
    const payload = "item:" + "1234567890".repeat(340);
    const qr = createQrCode(payload, "LOW");
    expect(qr.version).toBeGreaterThanOrEqual(27);
    expect(decode(qr)).toBe(payload);
  });

  it("falls back if optimization throws or returns a larger grid", () => {
    const baseline = QrCode.encodeText("hello", QrCode.Ecc.HIGH);
    const spy = vi.spyOn(optimal, "encodeOptimally").mockImplementation(() => { throw new Error("Optimizer failure"); });
    expect(createQrCode("hello")).toEqual(baseline);
    spy.mockReturnValue(QrCode.encodeText("longer content".repeat(10), QrCode.Ecc.HIGH));
    expect(createQrCode("hello")).toEqual(baseline);
  });

  it("preserves rejection of invalid Unicode and oversized input", () => {
    expect(() => createQrCode("\ud800")).toThrow(URIError);
    expect(() => createQrCode("1".repeat(7090), "LOW")).toThrow("Data too long");
    expect(() => optimal.makeOptimalSegments("a", 0)).toThrow("Invalid version");
  });
});
