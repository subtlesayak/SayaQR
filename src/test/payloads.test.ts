import { describe, expect, it } from "vitest";
import { formatPayload } from "../lib/payloads";
import { DEFAULT_RENDER_OPTIONS, buildQrSvg, type ModuleStyle } from "../lib/render";
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
  it("uses square finder patterns by default", () => {
    expect(DEFAULT_RENDER_OPTIONS.finderStyle).toBe("square");
  });

  it("creates SVG output", () => {
    const svg = buildQrSvg("hello", DEFAULT_RENDER_OPTIONS);
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("role=\"img\"");
    expect(svg).toContain("<rect");
    expect(svg).toContain("</svg>");
  });

  it("renders module and finder colors independently", () => {
    const svg = buildQrSvg("hello", {
      ...DEFAULT_RENDER_OPTIONS,
      foreground: "#0F766E",
      finderColor: "#172554",
    });
    expect(svg).toContain('<g fill="#0F766E"');
    expect(svg).toContain('<g fill="#172554"');
  });

  it.each([
    ["dots", "<circle"],
    ["pixel", "width=\"0.92\""],
    ["soft-square", "rx=\"0.2\""],
    ["neon", 'stroke="#22D3EE"'],
    ["split-finders", "<g fill=\"#172554\""],
    ["sticker", "stroke=\"#172554\""],
  ] as Array<[ModuleStyle, string]>)("renders the %s module style", (moduleStyle, expected) => {
    const svg = buildQrSvg("hello", {
      ...DEFAULT_RENDER_OPTIONS,
      foreground: "#0F766E",
      finderColor: "#172554",
      moduleStyle,
    });
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("</svg>");
    expect(svg).toContain(expected);
  });

  it("renders neon without filter-dependent blanking", () => {
    const svg = buildQrSvg("hello", {
      ...DEFAULT_RENDER_OPTIONS,
      moduleStyle: "neon",
    });
    expect(svg).toContain('stroke="#22D3EE"');
    expect(svg).not.toContain("filter=");
    expect(svg).not.toContain("<filter");
  });

  it("can render an uploaded logo without a background", () => {
    const svg = buildQrSvg("hello", {
      ...DEFAULT_RENDER_OPTIONS,
      logoDataUrl: "data:image/png;base64,logo",
      transparentBackground: true,
      logoBackground: "none",
    });
    expect(svg).toContain("<image href=");
    expect(svg).not.toContain('fill="#ffffff"');
  });

  it("can render a custom logo stroke", () => {
    const svg = buildQrSvg("hello", {
      ...DEFAULT_RENDER_OPTIONS,
      logoDataUrl: "data:image/png;base64,logo",
      logoStroke: true,
      logoStrokeColor: "#FF00AA",
    });
    expect(svg).toContain('stroke="#FF00AA"');
    expect(svg).toContain('fill="none"');
  });

  it("repairs blank module and finder colors at render time", () => {
    const svg = buildQrSvg("hello", {
      ...DEFAULT_RENDER_OPTIONS,
      foreground: "#FFFFFF",
      finderColor: "#FFFFFF",
      background: "#FFFFFF",
    });
    expect(svg).toContain('<g fill="#0F172A"');
    expect(svg).not.toContain('<g fill="#FFFFFF"');
  });

  it("keeps transparent white QR exports readable on white surfaces", () => {
    const svg = buildQrSvg("hello", {
      ...DEFAULT_RENDER_OPTIONS,
      foreground: "#FFFFFF",
      finderColor: "#FFFFFF",
      transparentBackground: true,
    });
    expect(svg).toContain('<g fill="#0F172A"');
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

  it("warns when only the finder color has low contrast", () => {
    const warnings = getScannabilityWarnings({
      foreground: "#000000",
      finderColor: "#EEEEEE",
      background: "#FFFFFF",
      transparentBackground: false,
      margin: 4,
      logoScale: 0,
      payloadLength: 20,
    });

    expect(warnings.find((warning) => warning.id === "contrast")?.message).toContain("Finder color");
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
