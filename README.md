# SayaQR

SayaQR is a privacy-first QR code generator that runs fully in the browser. QR content is generated locally with Nayuki's MIT-licensed QR encoder; there is no tracking, no server upload, and no content API call.

## Design Philosophy

SayaQR stays intentionally simple: content -> style -> download. The default screen keeps the common path short, while advanced controls are tucked behind disclosure for people who need export details, logo tuning, batch CSV, or scan reliability settings.

The app takes high-level inspiration from visual QR tools such as QRBTF and QRFrame, but it does not copy their source code, UI, assets, or GPL code. SayaQR remains local-first, browser-only, and MIT-licenseable.

## Screenshots

Add release screenshots or GIFs here after visual approval:

- `docs/screenshots/desktop.png` - desktop simple view
- `docs/screenshots/mobile.png` - mobile live-preview flow
- `docs/screenshots/presets.gif` - style preset switching

## Features

- Vite + TypeScript single-page app
- Offline PWA with service worker and web app manifest
- Nayuki QR-Code-generator core vendored in `src/lib/nayuki-qrcodegen.ts`
- QR modes: plain text, URL, Wi-Fi, email, SMS, phone, vCard contact, UPI payment, event/calendar, and geo location
- QR templates for WhatsApp messages, social profiles, app deep links, UPI, guest Wi-Fi, and vCard contacts
- Style presets: Classic, Rounded, Dots, Soft Square, Neon, Minimal Mono, Sticker, Glass, Pixel, Malayalam Ornamental, Retro Terminal, and Business Card
- Brand Kit stored locally for up to 3 brand colors, preferred style, and supported logo data
- Exports: SVG, PNG, WebP, PDF, transparent PNG, white-background PNG, copy SVG, print PDF, and sticker sheet PDF
- Design controls: main color, custom foreground/background colors, transparent background, quiet zone, module size, rounded modules, finder pattern style, center logo upload, and logo size control
- QR Health badge plus scannability checks for low contrast, small quiet zones, oversized logos, and long payloads
- Batch CSV mode with content-column mapping and ZIP export
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

The Vite config uses `base: "./"` so the app can be served from a subpath such as GitHub Pages. `pnpm build` also prepares a `dist/beta/` copy for the beta URL at `https://subtlesayak.github.io/SayaQR/beta/`. The service worker caches the app shell and same-origin assets after the first load.

## Privacy

SayaQR does not need a backend. QR payloads, logos, brand colors, CSV files, and generated exports stay in the browser. Local preferences use browser storage only.

## License Attribution

This project uses the QR Code generator library by Project Nayuki:

- Source: https://github.com/nayuki/QR-Code-generator
- Homepage: https://www.nayuki.io/page/qr-code-generator-library
- License: MIT License
- Vendored file: `src/lib/nayuki-qrcodegen.ts`

The Nayuki source file includes its original MIT license header. Keep that copyright and permission notice in all copies or substantial portions of the software.

## Inspiration Credits

- QRBTF: https://github.com/latentcat/qrbtf
- QRFrame: https://github.com/zhengkyl/qrframe

These projects are credited as inspiration only. SayaQR's implementation, UI, and assets are independent.
