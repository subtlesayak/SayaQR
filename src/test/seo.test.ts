import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import robots from "../../public/robots.txt?raw";
import sitemap from "../../public/sitemap.xml?raw";
import llms from "../../public/llms.txt?raw";
import mainSource from "../main.ts?raw";

describe("discoverability contract", () => {
  it("publishes canonical search and social metadata", () => {
    expect(indexHtml).toContain('<link rel="canonical" href="https://subtlesayak.github.io/SayaQR/"');
    expect(indexHtml).toContain('property="og:title"');
    expect(indexHtml).toContain('name="twitter:card"');
    expect(indexHtml).toContain("Free Offline QR Code Generator");
  });

  it("describes the website and web application with JSON-LD", () => {
    expect(indexHtml).toContain('type="application/ld+json"');
    expect(indexHtml).toContain('"@type": "WebSite"');
    expect(indexHtml).toContain('"@type": "WebApplication"');
    expect(indexHtml).toContain('"codeRepository": "https://github.com/subtlesayak/SayaQR"');
  });

  it("exposes crawler and answer-engine discovery files", () => {
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("https://subtlesayak.github.io/SayaQR/sitemap.xml");
    expect(sitemap).toContain("https://subtlesayak.github.io/SayaQR/");
    expect(llms).toContain("QR content never leaves the user's browser");
  });

  it("keeps truthful privacy and feature answers in the initial HTML", () => {
    expect(indexHtml).toContain("A free, open-source QR code generator that works offline");
    expect(indexHtml).toContain("Is SayaQR private?");
    expect(indexHtml).toContain("What QR codes and formats are supported?");
    expect(mainSource).not.toContain('class="about-sayaqr"');
  });
});
