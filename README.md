# SayaQR

SayaQR is a modern, privacy-first QR code generator that runs fully in the browser. QR content is generated locally with Nayuki's MIT-licensed QR encoder; there is no tracking, no server upload, and no content API call.

Its default flow is intentionally simple: paste content, understand the detected intent, preview the QR, and download a PNG. Structured fields, customization, technical payloads, alternate formats, and batch generation remain available through progressive disclosure.

## Features

- Vite + TypeScript single-page app
- Offline PWA with service worker and web app manifest
- Nayuki QR-Code-generator core vendored in `src/lib/nayuki-qrcodegen.ts`
- QR modes: plain text, URL, Wi-Fi, email, SMS, phone, vCard contact, UPI payment, event/calendar, and geo location
- One-click PNG download, plus SVG, WebP, and PDF in More formats
- Human-readable intent previews with local warnings for risky links, payments, events, Wi-Fi, and coordinates
- Progressive disclosure for structured fields, customization, technical payloads, and batch generation
- Content-aware export filenames based on the QR intent
- Design controls: foreground/background colors, transparent background, quiet zone, module size, rounded modules, finder pattern style, center logo upload, logo preset dropdown, and logo size control
- Scannability checks for low contrast, small quiet zones, oversized logos, and long payloads
- Batch CSV/TXT mode with CSV column mapping, comma/newline text lists, and ZIP export
- Privacy indicators for generated locally, no tracking, and no upload

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
