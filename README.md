# SayaQR

SayaQR is a modern, privacy-first QR code generator that runs fully in the browser. QR content is generated locally with Nayuki's MIT-licensed QR encoder; there is no tracking, no server upload, and no content API call.

Its default flow is intentionally simple: paste content, understand the detected intent, preview the QR, and download a PNG. Structured fields, customization, technical payloads, alternate formats, and batch generation remain available through progressive disclosure.

## Phase 4: Design memory and batch polish

Design memory is opt-in. Enable **Use this design next time** to keep only visual settings in localStorage under the versioned key `sayaqr:design:v1`. QR content, payload fields, Wi-Fi passwords, contact details, uploaded logos, imported images, and batch rows are never stored.

Batch generation stays collapsed until needed. It suggests likely content and filename columns, validates rows before generation, resolves duplicate filenames deterministically, yields during large jobs, supports cancellation, and adds `batch-report.csv` to the ZIP when rows are skipped. A sample CSV is generated locally from the batch panel.

## Features

- Vite + TypeScript single-page app
- Offline PWA with service worker and web app manifest
- Nayuki QR-Code-generator core vendored in `src/lib/nayuki-qrcodegen.ts`
- QR modes: plain text, URL, Wi-Fi, email, SMS, phone, vCard contact, UPI payment, event/calendar, and geo location
- One-click PNG download, plus SVG, WebP, and WYSIWYG PDF in More formats
- Copy PNG directly to the image clipboard when supported
- Native PNG file sharing with content-aware filenames when supported
- Installed-PWA share target for links and text shared into SayaQR
- Human-readable intent previews with local warnings for risky links, payments, events, Wi-Fi, and coordinates
- Progressive disclosure for structured fields, customization, technical payloads, and batch generation
- Content-aware export filenames based on the QR intent
- Design controls: foreground/background colors, transparent background, quiet zone, module size, rounded modules, finder pattern style, center logo upload, logo preset dropdown, and logo size control
- Scannability checks for low contrast, small quiet zones, oversized logos, and long payloads
- Local QR image import from the file picker, drag and drop, or pasted screenshots
- Local scan-confidence simulations at multiple sizes, blur, contrast, and rotation conditions
- Conservative automatic fixes for QR designs rated risky or poor
- Custom logo uploads, including SVG files, are rasterized locally to PNG before embedding
- Batch CSV/TXT mode with CSV column mapping, comma/newline text lists, and ZIP export
- Privacy indicators for generated locally, no tracking, and no upload

## Local Guardian Privacy

Imported QR images stay on the device and are decoded locally with the bundled jsQR library. Pasted screenshots, dropped images, custom logos, generated scan variants, and decoded payloads are never uploaded.

Scan confidence is an advisory local test, not a guarantee that every camera or scanning app will read the QR. The six simulations help identify common size, blur, contrast, and rotation risks before printing or sharing. Simulation canvases are released after each check and are not stored.

Mobile QR photo import uses bounded local crop passes after the full-image attempt, improving detection when a QR occupies only part of a phone photo while keeping every canvas at or below 1600px.

## WYSIWYG Export And Sharing

SVG, PNG, WebP, PDF, clipboard copy, and native sharing all use the current styled SVG as their canonical source. PDF export rasterizes that SVG to a lossless PNG of at least 1600 x 1600 pixels, embeds it without JPEG recompression, and preserves colors, background, rounded modules, finder style, logos, logo backing, quiet zone, and proportions. Transparent QR backgrounds are rendered on white for PDF because ordinary printed paper has a background.

Copy image appears only when PNG clipboard writing is supported. Share appears only when the browser supports sharing a PNG file. Share cancellation is silent, unsupported features remain hidden, and neither action silently falls back to downloading. The generic share message never includes the encoded payload.

When installed as a PWA, SayaQR can receive shared URLs or text through its relative GET share target. Incoming share parameters are auto-detected locally and immediately removed from the address bar with `history.replaceState`. Browser feature detection provides graceful fallback where clipboard, file sharing, or PWA share targets are unavailable.

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the dev server:

```bash
pnpm dev
```

Run tests:

```bash
pnpm test
```

Build production assets:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## Deployment

The app is a static Vite build. Deploy the generated `dist/` directory to any static host, including GitHub Pages, Netlify, Cloudflare Pages, or Vercel static hosting.

The Vite config uses `base: "./"` so the app can be served from a subpath such as GitHub Pages. The service worker caches the app shell and same-origin assets after the first load.

## License Attribution

This project uses the QR Code generator library by Project Nayuki:

- Source: https://github.com/nayuki/QR-Code-generator
- Homepage: https://www.nayuki.io/page/qr-code-generator-library
- License: MIT License
- Vendored file: `src/lib/nayuki-qrcodegen.ts`

The Nayuki source file includes its original MIT license header. Keep that copyright and permission notice in all copies or substantial portions of the software.

Embedded logo presets use local SVG path data from Material Design Icons, Simple Icons, and Wikimedia Commons where available. These marks are bundled for offline use and are not requested from a server at runtime. Brand names and logos may still be trademarks of their respective owners.

## QR Decoder Attribution

Local QR image decoding uses [jsQR](https://github.com/cozmo/jsQR), bundled with the application for offline use under the Apache License 2.0. No decoder code, images, or payloads are loaded from or sent to a remote service.
