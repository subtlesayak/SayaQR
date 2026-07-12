import { describe, expect, it } from "vitest";
import {
  exportFilename,
  isShareCancellation,
  removeShareTargetParams,
  selectShareTargetValue,
} from "../lib/share";

describe("PWA share-target helpers", () => {
  it("prefers URL, then text, then title", () => {
    expect(selectShareTargetValue(new URLSearchParams("title=Title&text=Body&url=https%3A%2F%2Fexample.com"))).toBe("https://example.com");
    expect(selectShareTargetValue(new URLSearchParams("title=Title&text=Body"))).toBe("Body");
    expect(selectShareTargetValue(new URLSearchParams("title=Title"))).toBe("Title");
    expect(selectShareTargetValue(new URLSearchParams("text=%20%20&title=Fallback"))).toBe("Fallback");
  });

  it("removes share parameters while retaining unrelated query data and hashes", () => {
    expect(removeShareTargetParams("https://example.com/SayaQR/?url=secret&theme=dark#preview")).toBe("/SayaQR/?theme=dark#preview");
  });
});

describe("export and native-share helpers", () => {
  it("builds content-aware filenames with the requested extension", () => {
    expect(exportFilename("url", { url: "https://www.example.com/path" }, "png")).toBe("example-com-qr.png");
    expect(exportFilename("wifi", { ssid: "Cafe Guest" }, "pdf")).toBe("cafe-guest-wifi-qr.pdf");
  });

  it("classifies only AbortError as user cancellation", () => {
    expect(isShareCancellation({ name: "AbortError" })).toBe(true);
    expect(isShareCancellation({ name: "NotAllowedError" })).toBe(false);
    expect(isShareCancellation(new Error("cancelled"))).toBe(false);
  });
});
