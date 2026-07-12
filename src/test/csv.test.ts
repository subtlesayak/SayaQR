import { describe, expect, it } from "vitest";
import { parseCsv, parseTextList } from "../lib/csv";

describe("batch file parsing", () => {
  it("parses one TXT item per line and ignores blanks", () => {
    const data = parseTextList("https://one.example\n\n https://two.example \r\n");
    expect(data.headers).toEqual(["Content"]);
    expect(data.rows).toEqual([
      { Content: "https://one.example" },
      { Content: "https://two.example" },
    ]);
  });

  it("parses comma and newline separated TXT items", () => {
    const data = parseTextList("https://one.example, https://two.example\nhttps://three.example");
    expect(data.rows.map((row) => row.Content)).toEqual([
      "https://one.example",
      "https://two.example",
      "https://three.example",
    ]);
  });

  it("preserves quoted commas inside TXT items", () => {
    const data = parseTextList("\"https://example.com/a,b\",https://two.example");
    expect(data.rows.map((row) => row.Content)).toEqual([
      "https://example.com/a,b",
      "https://two.example",
    ]);
  });

  it("keeps CSV header mapping unchanged", () => {
    const data = parseCsv("url,name\nhttps://one.example,First");
    expect(data.headers).toEqual(["url", "name"]);
    expect(data.rows).toEqual([{ url: "https://one.example", name: "First" }]);
  });
});
