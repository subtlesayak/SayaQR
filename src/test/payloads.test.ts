import { describe, expect, it } from "vitest";
import { formatPayload } from "../lib/payloads";
import { DEFAULT_RENDER_OPTIONS, buildQrSvg } from "../lib/render";
import { getScannabilityWarnings } from "../lib/scannability";

describe("QR payload formatting", () => {
  it("formats URLs with https when no scheme is provided", () => {
    expect(formatPayload("url", { url: "example.com/path" })).toBe("https://example.com/path");
  });

  it("escapes Wi-Fi reserved characters", () => {
    expect(formatPayload("wifi", { auth: "WPA", ssid: "My;Net", password: "p:ass,word", hidden: true })).toBe(
      "WIFI:T:WPA;S:My\\;Net;P:p\\:ass\\,word;H:true;;",
    );
  });

  it("formats vCard contacts", () => {
    const card = formatPayload("vcard", {
      firstName: "Jane",
      lastName: "Doe",
      company: "SayaQR Labs",
      phone: "+15551234567",
      email: "jane@example.com",
    });

    expect(card).toContain("BEGIN:VCARD");
    expect(card).toContain("VERSION:3.0");
    expect(card).toContain("N:Doe;Jane;;;");
    expect(card).toContain("FN:Jane Doe");
    expect(card).toContain("ORG:SayaQR Labs");
    expect(card).toContain("TEL;TYPE=CELL:+15551234567");
    expect(card).toContain("END:VCARD");
  });

  it("formats UPI payment links", () => {
    expect(
      formatPayload("upi", {
        payeeAddress: "alice@upi",
        payeeName: "Alice Rao",
        amount: "125.50",
        currency: "INR",
        note: "Tea fund",
      }),
    ).toBe("upi://pay?pa=alice%40upi&pn=Alice%20Rao&am=125.50&cu=INR&tn=Tea%20fund");
  });

  it("formats label-only geo searches", () => {
    expect(formatPayload("geo", { label: "India Gate" })).toBe("geo:0,0?q=India%20Gate");
  });
});

describe("exports", () => {
  it("creates SVG output", () => {
    const svg = buildQrSvg("hello", DEFAULT_RENDER_OPTIONS);
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("role=\"img\"");
    expect(svg).toContain("<rect");
    expect(svg).toContain("</svg>");
  });
});

describe("scannability warnings", () => {
  it("warns when contrast is too low", () => {
    const warnings = getScannabilityWarnings({
      foreground: "#777777",
      background: "#888888",
      transparentBackground: false,
      margin: 4,
      logoScale: 0,
      payloadLength: 20,
    });

    expect(warnings.some((warning) => warning.id === "contrast")).toBe(true);
  });

  it("warns when quiet zone is too small", () => {
    const warnings = getScannabilityWarnings({
      foreground: "#000000",
      background: "#ffffff",
      transparentBackground: false,
      margin: 2,
      logoScale: 0,
      payloadLength: 20,
    });

    expect(warnings.some((warning) => warning.id === "quiet-zone")).toBe(true);
  });
  it("warns when the payload is very long", () => {
    const warnings = getScannabilityWarnings({
      foreground: "#000000",
      background: "#ffffff",
      transparentBackground: false,
      margin: 4,
      logoScale: 0,
      payloadLength: 1300,
    });

    expect(warnings.some((warning) => warning.id === "length")).toBe(true);
  });

  it("supports 8-digit hex colors for contrast checks", () => {
    const warnings = getScannabilityWarnings({
      foreground: "#000000ff",
      background: "#ffffffff",
      transparentBackground: false,
      margin: 4,
      logoScale: 0,
      payloadLength: 20,
    });

    expect(warnings.some((warning) => warning.id === "contrast")).toBe(false);
  });
});