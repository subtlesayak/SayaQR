import { describe, expect, it } from "vitest";
import manifestRaw from "../../public/manifest.webmanifest?raw";
import mainSource from "../main.ts?raw";
import renderSource from "../lib/render.ts?raw";
import shareSource from "../lib/share.ts?raw";
import { calculatePdfPageLayout } from "../lib/render";

const manifest = JSON.parse(manifestRaw) as {
  share_target?: {
    action: string;
    method: string;
    enctype: string;
    params: { title: string; text: string; url: string };
  };
};

describe("WYSIWYG export contract", () => {
  it("calculates centered square PDF pages with point margins", () => {
    expect(calculatePdfPageLayout(1600, 1600, 36)).toEqual({
      pageSize: 1672,
      imageWidth: 1600,
      imageHeight: 1600,
      x: 36,
      y: 36,
    });
    expect(calculatePdfPageLayout(1200, 600, 40)).toEqual({
      pageSize: 1280,
      imageWidth: 1200,
      imageHeight: 600,
      x: 40,
      y: 340,
    });
  });

  it("uses the current styled SVG for every single and batch export", () => {
    expect(mainSource).toContain('svgBlob(currentSvg)');
    expect(mainSource).toContain('svgToRasterBlob(currentSvg, "image/png")');
    expect(mainSource).toContain('svgToRasterBlob(currentSvg, "image/webp")');
    expect(mainSource).toContain('await svgToPdfBlob(currentSvg)');
    expect(mainSource).toContain('data: await svgToPdfBlob(svg)');
    expect(mainSource).not.toContain("qrPdfBlob");
  });

  it("uses lossless PNG with a white PDF background at 1600px minimum", () => {
    expect(renderSource).toContain('minimumRasterSize = Math.max(1600');
    expect(renderSource).toContain('background: "#ffffff"');
    expect(renderSource).toContain("pdf.embedPng");
    expect(renderSource).not.toContain("embedJpg");
  });

  it("presents copy, share, and honest format guidance", () => {
    expect(mainSource).toContain('id="copyImage"');
    expect(mainSource).toContain('id="shareImage"');
    expect(mainSource).toContain("QR image copied");
    expect(shareSource).toContain("QR code generated locally with SayaQR");
    expect(mainSource).toContain("transparent backgrounds become white");
  });
});

describe("installed PWA sharing", () => {
  it("declares a relative GET share target", () => {
    expect(manifest.share_target).toEqual({
      action: "./",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    });
  });

  it("processes and removes incoming share parameters at startup", () => {
    expect(mainSource).toContain("selectShareTargetValue(params)");
    expect(mainSource).toContain("history.replaceState");
    expect(mainSource).toContain("removeShareTargetParams(window.location.href)");
    expect(mainSource).toContain("applyShareTargetFromUrl();");
  });
});
