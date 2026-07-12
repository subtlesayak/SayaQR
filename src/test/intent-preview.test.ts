import { describe, expect, it } from "vitest";
import { buildIntentPreview } from "../lib/intent-preview";
import type { PayloadFields, QrMode } from "../lib/payloads";

describe("intent previews", () => {
  it.each([
    ["text", { text: "Hello" }, "Hello", "Plain text"],
    ["url", { url: "https://example.com/path" }, "https://example.com/path", "Open example.com"],
    ["wifi", { ssid: "Cafe Wi-Fi", auth: "WPA" }, "WIFI:T:WPA;S:Cafe Wi-Fi;;", "Join Cafe Wi-Fi"],
    ["email", { email: "name@example.com" }, "mailto:name@example.com", "Email name@example.com"],
    ["sms", { phone: "+15551234567" }, "SMSTO:+15551234567:", "Text +15551234567"],
    ["phone", { phone: "+15551234567" }, "tel:+15551234567", "Call +15551234567"],
    ["vcard", { firstName: "Jane", lastName: "Doe" }, "BEGIN:VCARD", "Add Jane Doe to contacts"],
    ["upi", { payeeAddress: "name@upi", payeeName: "Name", amount: "250" }, "upi://pay", "Pay \u20B9250 to Name"],
    ["event", { title: "Team Meeting" }, "BEGIN:VCALENDAR", "Add Team Meeting to calendar"],
    ["geo", { latitude: "28.6139", longitude: "77.2090", label: "New Delhi" }, "geo:28.6139,77.2090", "Open New Delhi in maps"],
  ] as Array<[QrMode, PayloadFields, string, string]>)("summarizes %s intent", (mode, fields, payload, title) => {
    expect(buildIntentPreview(mode, fields, payload).title).toBe(title);
  });

  it("includes plain-text character count", () => {
    expect(buildIntentPreview("text", { text: "Hello" }, "Hello").details).toContain("5 characters");
  });

  it("warns about HTTP URLs", () => {
    expect(buildIntentPreview("url", { url: "http://example.com" }, "http://example.com").warnings.join(" ")).toContain("HTTP");
  });

  it("warns about punycode hostnames", () => {
    expect(buildIntentPreview("url", { url: "https://xn--e1afmkfd.xn--p1ai" }, "").warnings.join(" ")).toContain("encoded international");
  });

  it("warns about custom URL schemes", () => {
    expect(buildIntentPreview("url", { url: "myapp://open/item" }, "").warnings.join(" ")).toContain("custom myapp scheme");
  });

  it("warns about open Wi-Fi", () => {
    expect(buildIntentPreview("wifi", { ssid: "Cafe", auth: "nopass" }, "").warnings.join(" ")).toContain("Open Wi-Fi");
  });

  it("warns about invalid and non-positive UPI amounts", () => {
    expect(buildIntentPreview("upi", { payeeAddress: "name@upi", amount: "abc" }, "").warnings).toContain("UPI amount must be a positive number.");
    expect(buildIntentPreview("upi", { payeeAddress: "name@upi", amount: "0" }, "").warnings).toContain("UPI amount must be a positive number.");
  });

  it("warns when the UPI payee address is missing", () => {
    expect(buildIntentPreview("upi", { payeeName: "Name", amount: "250" }, "").warnings).toContain("Add a UPI payee address before sharing this QR.");
  });

  it("warns when an event ends before it starts", () => {
    expect(buildIntentPreview("event", { startsAt: "2026-07-12T14:00", endsAt: "2026-07-12T13:00" }, "").warnings).toContain("Event end time is before its start time.");
  });

  it("warns about latitude outside its range", () => {
    expect(buildIntentPreview("geo", { latitude: "91", longitude: "77" }, "").warnings).toContain("Latitude must be between -90 and 90.");
  });

  it("warns about longitude outside its range", () => {
    expect(buildIntentPreview("geo", { latitude: "28", longitude: "181" }, "").warnings).toContain("Longitude must be between -180 and 180.");
  });
});
