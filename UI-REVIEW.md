# SayaQR — UI Review

**Audited:** 2026-07-09
**Baseline:** Abstract GSD 6-pillar standards; no UI-SPEC.md found
**Screenshots:** Captured with Playwright/installed Chrome
**Screenshot directory:** `.planning/ui-reviews/standalone-postfix-20260709-154448`

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Clear domain labels and privacy copy, but dense mode/tool labels could use more workflow-oriented grouping on mobile. |
| 2. Visuals | 3/4 | Strong app-like hierarchy and QR preview, but all ten mode buttons stack before the preview on mobile. |
| 3. Color | 3/4 | Professional contrast and privacy/status colors; export button colors read as semantic states without explanation. |
| 4. Typography | 4/4 | Compact scale is consistent and appropriate for a tool UI. |
| 5. Spacing | 3/4 | Mobile overflow was found and fixed; remaining mobile page is long but usable. |
| 6. Experience Design | 4/4 | Core states, warnings, disabled batch controls, exports, and local/privacy signals are covered. |

**Overall: 20/24**

---

## Mobile Verdict

**Yes, after the CSS fix in this audit pass, it works on mobile.**

Measured viewport results after the fix:

| Viewport | Horizontal overflow | Undersized buttons | QR preview |
|----------|---------------------|--------------------|------------|
| 320 x 700 | 0 overflowers; scrollWidth 320 | 0 | 266 x 300 |
| 375 x 812 | 0 overflowers; scrollWidth 375 | 0 | 321 x 321 |
| 768 x 1024 | 0 overflowers; scrollWidth 768 | 0 | 669 x 566 |
| 1440 x 900 | 0 overflowers; scrollWidth 1440 | 0 | 662 x 566 |

Before the fix, 375px mobile measured `scrollWidth: 389` after the first pass and originally `scrollWidth: 412`, with form controls/card content overflowing the viewport. The final CSS rules now allow grid children and native form controls to shrink within the viewport.

---

## Top 3 Priority Fixes

1. **Mobile control density** — The app now fits on mobile, but ten mode buttons stack before the QR preview, pushing the primary output down. Consider a compact segmented select or horizontally scrollable tab rail below 720px.
2. **Export color semantics** — SVG/PNG/WebP/PDF buttons use four different strong colors, which can imply status or risk. Use one primary export color plus neutral secondary styling unless format-specific color meaning is intentional.
3. **Batch mode discoverability** — CSV mapping is functional, but the empty state only says `No CSV loaded`. Add concise helper copy near the CSV upload to clarify expected headers and what the selected content column does.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **WARNING:** Privacy copy is strong and direct: `Generated locally`, `No tracking`, and `No upload` in `src/main.ts:144-147` satisfy the privacy-first promise.
- **WARNING:** Mode labels are clear (`Plain text`, `URL`, `Wi-Fi`, `vCard contact`, `UPI payment`, etc.) in `src/lib/payloads.ts`, but on mobile they become a long command list before the user reaches the QR preview.
- **WARNING:** Batch empty copy at `src/main.ts:195` is accurate but minimal. Users uploading CSVs would benefit from one line that explains column mapping.

### Pillar 2: Visuals (3/4)

- **WARNING:** The first screen is the actual tool, not a landing page, and the QR preview has a strong focal area via `.preview-zone` and `.qr-preview` in `src/main.ts:175-186` and `src/style.css:285-305`.
- **WARNING:** On mobile, the controls appear before preview and require a long scroll through all mode buttons and design controls. This is usable but slows the main workflow.
- **PASS:** The preview QR remains visibly large after the mobile fix: 321 x 321 at 375px width and 266 x 300 at 320px width.

### Pillar 3: Color (3/4)

- **WARNING:** The palette uses several strong hues: navy, teal, amber, and brown (`src/style.css:371-385`). That keeps it from being one-note, but the export row uses color as decoration rather than clear meaning.
- **PASS:** Privacy/status chips use a restrained green treatment (`src/style.css:103-111`) and warning states use distinct info/warning/danger colors (`src/style.css:334-349`).
- **PASS:** Default QR contrast is high: foreground `#0f172a` on `#ffffff`.

### Pillar 4: Typography (4/4)

- **PASS:** Type scale is compact and suitable for a repeated-use utility: `h1` at 1.35rem, `h2` at 0.95rem, labels around 0.84rem, and supporting text around 0.82-0.88rem (`src/style.css:75-93`, `src/style.css:204-210`, `src/style.css:329-359`).
- **PASS:** No viewport-scaled font sizes were found; this avoids unpredictable mobile text resizing.
- **WARNING:** Heavy label weights (`750`/`850`) are consistent but visually dense; acceptable for a tool UI, not a blocker.

### Pillar 5: Spacing (3/4)

- **BLOCKER FOUND AND FIXED:** Mobile horizontal overflow was caused by grid children/native controls retaining intrinsic widths. Fixed with `min-width: 0`/`max-width: 100%` rules on `.tool-surface`, grids, form rows, section-heading children, and controls in `src/style.css:123-125` and `src/style.css:187-201`.
- **PASS:** Responsive breakpoints collapse the two-column workspace at 1040px and controls to one-column at 720px (`src/style.css:418-449`).
- **WARNING:** The mobile page height is around 2806px at 375px, mostly because content, design controls, preview, and batch mode all live on one page. This is usable but not the fastest mobile flow.

### Pillar 6: Experience Design (4/4)

- **PASS:** Scannability warnings are live and specific through `renderWarnings()` in `src/main.ts:260-273`.
- **PASS:** Empty/too-long QR states are handled in `src/main.ts:288-306`.
- **PASS:** Batch export disables controls until CSV data exists and shows a generating state during ZIP export (`src/main.ts:341-360`, `src/main.ts:383-385`).
- **PASS:** Export actions are local browser downloads only; this supports the privacy-first premise.

---

## Registry Safety

Skipped. No `components.json` or third-party UI registry usage found.

---

## Files Audited

- `src/main.ts`
- `src/style.css`
- `src/lib/payloads.ts`
- `src/lib/scannability.ts`
- `src/lib/render.ts`
- `public/manifest.webmanifest`
- `public/sw.js`
- `.github/workflows/deploy-pages.yml`
