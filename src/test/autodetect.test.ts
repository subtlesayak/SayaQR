import { describe, expect, it } from "vitest";
import { detectQrContent } from "../lib/autodetect";

describe("QR content auto detection", () => {
  it("detects URLs", () => {
    const result = detectQrContent("example.com/path");

    expect(result.mode).toBe("url");
    expect(result.fields.url).toBe("example.com/path");
  });

  it("detects and unescapes Wi-Fi QR payloads", () => {
    const result = detectQrContent("WIFI:T:WPA;S:My\\;Net;P:p\\:ass;H:true;;");

    expect(result.mode).toBe("wifi");
    expect(result.fields).toMatchObject({ auth: "WPA", ssid: "My;Net", password: "p:ass", hidden: true });
  });

  it("detects vCard contacts", () => {
    const result = detectQrContent([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Doe;Jane;;;",
      "FN:Jane Doe",
      "TEL;TYPE=CELL:+15551234567",
      "EMAIL:jane@example.com",
      "END:VCARD",
    ].join("\n"));

    expect(result.mode).toBe("vcard");
    expect(result.fields).toMatchObject({ firstName: "Jane", lastName: "Doe", fullName: "Jane Doe", phone: "+15551234567", email: "jane@example.com" });
  });

  it("detects UPI payment links", () => {
    const result = detectQrContent("upi://pay?pa=alice%40upi&pn=Alice%20Rao&am=125.50&cu=INR&tn=Tea");

    expect(result.mode).toBe("upi");
    expect(result.fields).toMatchObject({ payeeAddress: "alice@upi", payeeName: "Alice Rao", amount: "125.50", currency: "INR", note: "Tea" });
  });

  it("detects coordinates as geo location", () => {
    const result = detectQrContent("28.6139, 77.2090");

    expect(result.mode).toBe("geo");
    expect(result.fields).toMatchObject({ latitude: "28.6139", longitude: "77.2090" });
  });

  it("detects Google Maps links with embedded coordinates", () => {
    const result = detectQrContent("https://www.google.com/maps/place/India+Gate/@28.6129,77.2295,17z/data=!3m1!4b1");

    expect(result.mode).toBe("geo");
    expect(result.label).toBe("Google Maps location");
    expect(result.fields).toMatchObject({ latitude: "28.6129", longitude: "77.2295", label: "India Gate" });
  });

  it("detects Apple Maps links with ll coordinates", () => {
    const result = detectQrContent("https://maps.apple.com/?ll=28.6139,77.2090&q=New%20Delhi");

    expect(result.mode).toBe("geo");
    expect(result.label).toBe("Apple Maps location");
    expect(result.fields).toMatchObject({ latitude: "28.6139", longitude: "77.2090", label: "New Delhi" });
  });

  it("detects map search links without coordinates", () => {
    const result = detectQrContent("https://www.google.com/maps/search/?api=1&query=India%20Gate");

    expect(result.mode).toBe("geo");
    expect(result.label).toBe("Map location search");
    expect(result.fields).toMatchObject({ label: "India Gate" });
  });

  it("keeps unresolved short map links as URLs", () => {
    const result = detectQrContent("https://maps.app.goo.gl/example123");

    expect(result.mode).toBe("url");
    expect(result.label).toBe("Map short link");
    expect(result.fields.url).toBe("https://maps.app.goo.gl/example123");
  });
});