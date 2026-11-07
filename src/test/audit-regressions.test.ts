import { describe, expect, it } from "vitest";
import { detectQrContent } from "../lib/autodetect";
import { formatPayload } from "../lib/payloads";
import { parseTextList } from "../lib/csv";
import { buildBatchReportCsv, validateBatchRows } from "../lib/batch";
import { LatestOperation } from "../lib/latest-operation";
import { originalStructuredPayload } from "../lib/payload-source";

describe("audit input regressions", () => {
  it("preserves complete signed/payment and contact payloads before editing", () => {
    const upi = "upi://pay?pa=shop@bank&mc=1234&tr=order-1&sign=ABC%2BDEF";
    const card = "BEGIN:VCARD\nVERSION:3.0\nFN:Test\nADR;TYPE=WORK:;;Street;City;State;123;Country\nEND:VCARD";
    for (const value of [upi, card]) expect(originalStructuredPayload(value, true)).toBe(value);
    expect(originalStructuredPayload(upi, false)).toBeNull();
    expect(originalStructuredPayload("example.com", true)).toBeNull();
    expect(detectQrContent(card).fields).toMatchObject({ street: "Street", city: "City", region: "State", postalCode: "123", country: "Country" });
  });
  it("preserves significant spaces in Wi-Fi credentials", () => {
    const input = "WIFI:T:WPA;S: Network ;P: secret ;H:false;;";
    const detected = detectQrContent(input);
    expect(formatPayload(detected.mode, detected.fields)).toBe(input);
  });

  it("accepts malformed URI escapes without leaving generation stuck", () => {
    expect(detectQrContent("mailto:%").fields.email).toBe("%");
    expect(detectQrContent("mailto:test+tag@example.com").fields.email).toBe("test+tag@example.com");
    expect(() => detectQrContent("geo:%,%")).not.toThrow();
  });

  it("keeps commas and quotes in literal TXT rows", () => {
    expect(parseTextList('Hello, world\ngeo:28.6139,77.2090\n"quoted"').rows.map((row) => row.Content))
      .toEqual(["Hello, world", "geo:28.6139,77.2090", '"quoted"']);
  });

  it("neutralizes formulas in downloadable batch error reports", () => {
    const data = { headers: ["content", "filename"], rows: [{ content: "", filename: "=1+1" }] };
    const result = validateBatchRows(data, "content", "filename", () => true);
    expect(buildBatchReportCsv(result.rows)).toContain("'=1+1");
  });

  it("invalidates pending operations on newer input or requests", () => {
    const latest = new LatestOperation();
    const first = latest.start();
    const second = latest.start();
    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(true);
    latest.invalidate();
    expect(latest.isCurrent(second)).toBe(false);
  });
});
