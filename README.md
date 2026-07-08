# SayaQR

SayaQR is a modern, privacy-first QR code generator that runs fully in your browser. QR content is formatted and encoded locally; the app does not upload QR data, use analytics, or require a server after installation.

## Features

- TypeScript + Vite single-page app.
- Browser-only QR generation using a Nayuki QR-Code-generator-compatible encoder facade with MIT attribution preserved in `THIRD_PARTY_NOTICES.md`.
- Offline PWA support through a web app manifest and service worker.
- QR modes: plain text, URL, Wi-Fi, email, SMS, phone, vCard contact, UPI payment, calendar event, and geo location.
- Export formats: SVG, PNG, WebP, and PDF.
- Design controls: foreground/background color, transparent background, quiet zone, module size, rounded modules, finder style selector, center logo upload, and logo size warning.
- Scannability checks for contrast, quiet zone, logo size, and long payloads.
- Batch CSV mode with column mapping and downloadable archive of generated SVG QR codes.
- Privacy UI badges: “Generated locally”, “No tracking”, and “No upload”.

## Local development

```bash
npm install
npm run dev
```

Run tests:

```bash
npm test
```

Build for production:

```bash
npm run build
```

> Note: this environment may block npm registry access. In a normal development environment, install the dependencies listed in `package.json` first.

## Deployment

1. Run `npm run build`.
2. Deploy the generated `dist/` directory to any static host such as GitHub Pages, Netlify, Vercel, Cloudflare Pages, or an internal static server.
3. Serve over HTTPS so browsers enable service workers and offline PWA behavior.

No backend is required. All QR payloads remain in the user’s browser.

## License attribution

This project is MIT licensed. SayaQR preserves attribution for Project Nayuki’s MIT-licensed QR-Code-generator library in `THIRD_PARTY_NOTICES.md`.
