import { describe, expect, it } from "vitest";
import {
  BatchCancellationController,
  buildBatchReportCsv,
  resolveDuplicateFilenames,
  suggestContentColumn,
  suggestFilenameColumn,
  validateBatchRows,
} from "../lib/batch";
import type { CsvData } from "../lib/csv";

describe("batch planning", () => {
  it("suggests common content and filename columns by priority", () => {
    expect(suggestContentColumn(["Name", "URL", "Payload"])).toBe("URL");
    expect(suggestContentColumn(["Notes", "Value"])).toBe("Value");
    expect(suggestFilenameColumn(["Content", "Title", "ID"])).toBe("Title");
    expect(suggestFilenameColumn(["Content"])).toBe("");
  });

  it("resolves duplicate filenames deterministically", () => {
    expect(resolveDuplicateFilenames(["ticket", "ticket", "Ticket", "ticket-2"]))
      .toEqual(["ticket", "ticket-2", "Ticket-3", "ticket-2-2"]);
  });

  it("classifies ready, empty, invalid, duplicate, and too-long rows", () => {
    const data: CsvData = {
      headers: ["url", "filename"],
      rows: [
        { url: "https://example.com", filename: "ticket" },
        { url: "", filename: "blank" },
        { url: "not a url", filename: "invalid" },
        { url: "https://example.org", filename: "ticket" },
        { url: "https://example.com/" + "x".repeat(40), filename: "large" },
      ],
    };
    const result = validateBatchRows(data, "url", "filename", (payload) => payload.length < 40);
    expect(result.rows.map((row) => row.status)).toEqual([
      "ready",
      "empty",
      "invalid",
      "duplicate-filename",
      "too-long",
    ]);
    expect(result.generatableCount).toBe(2);
    expect(result.skippedCount).toBe(3);
  });

  it("tracks cancellation state and can reset it", () => {
    const controller = new BatchCancellationController();
    expect(controller.isCancelled).toBe(false);
    controller.cancel();
    expect(controller.isCancelled).toBe(true);
    controller.reset();
    expect(controller.isCancelled).toBe(false);
  });

  it("builds a CSV report for skipped rows", () => {
    const data: CsvData = {
      headers: ["content", "filename"],
      rows: [
        { content: "", filename: "blank" },
        { content: "ready", filename: "ok" },
      ],
    };
    const result = validateBatchRows(data, "content", "filename", () => true);
    const report = buildBatchReportCsv(result.rows);
    expect(report).toContain("row,status,reason,requested_filename,output_filename");
    expect(report).toContain("1,empty,Content is empty,blank,blank");
    expect(report).not.toContain("2,ready");
  });
});
