import { describe, expect, it } from "vitest";
import { suggestExportName } from "../lib/export-name";

describe("content-aware export names", () => {
  it("names URL exports from the hostname", () => {
    expect(suggestExportName("url", { url: "https://github.com/subtlesayak/SayaQR" })).toBe("github-com-qr");
  });

  it("names Wi-Fi exports from the SSID", () => {
    expect(suggestExportName("wifi", { ssid: "Cafe" })).toBe("cafe-wifi-qr");
  });

  it("names contact exports from the contact name", () => {
    expect(suggestExportName("vcard", { firstName: "Jane", lastName: "Doe" })).toBe("jane-doe-contact-qr");
  });

  it("names UPI exports from the merchant name", () => {
    expect(suggestExportName("upi", { payeeName: "Merchant Name" })).toBe("merchant-name-upi-qr");
  });

  it("names event exports from the event title", () => {
    expect(suggestExportName("event", { title: "Team Meeting" })).toBe("team-meeting-event-qr");
  });

  it("names geo exports from the location label", () => {
    expect(suggestExportName("geo", { label: "New Delhi" })).toBe("new-delhi-location-qr");
  });

  it("removes unsafe filename characters", () => {
    expect(suggestExportName("vcard", { fullName: "Jane / Doe <Admin>" })).toBe("jane-doe-admin-contact-qr");
  });

  it("uses a safe caller fallback when fields are empty", () => {
    expect(suggestExportName("url", {}, "My QR")).toBe("my-qr");
  });
});
