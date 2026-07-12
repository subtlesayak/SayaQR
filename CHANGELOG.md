# Changelog

All notable changes to SayaQR are documented here.

## [1.9.4] - 2026-07-13

### Fixed

- Removed the large desktop gap between QR controls and Batch generation.
- Increased slider touch targets for easier mobile use.
- Simplified the empty preview so inactive scan and export controls stay hidden.

### Changed

- Compacted the desktop header while preserving the mobile live preview.
- Clarified automatic QR type detection copy.
- Placed Copy and More formats in an equal two-column row, with native Share below when supported.

## [1.9.3] - 2026-07-13

### Changed

- Made Square the default finder pattern for new and reset designs.
- Kept previously saved finder-style preferences unchanged.

## [1.9.2] - 2026-07-13

### Added

- Opt-in, versioned local design preferences with strict schema validation and a reset action.
- Automatic CSV content and filename column suggestions.
- Batch row validation, concise summaries, five-row previews, and a collapsed full report.
- Chunked batch generation with progress, generated/skipped counts, and cancellation.
- Deterministic duplicate filename suffixes and `batch-report.csv` for skipped rows.
- A locally generated sample CSV.

### Changed

- Preferred export format can be remembered with the rest of the visual design.
- Preview scrolling remains available while its scrollbar is visually hidden.
- Batch generation remains collapsed and now explains its local-only workflow.

### Privacy

- Design memory cannot serialize QR content, payload fields, credentials, uploaded logos, imported images, or batch data.

## [1.9.1] - 2026-07-13

### Fixed

- Improved mobile QR photo import with bounded overlapping crop passes when the full image cannot be decoded.
- PDF export now matches the styled preview instead of rebuilding an unstyled QR.

### Added

- Lossless WYSIWYG PDF export through the bundled pdf-lib dependency.
- PNG image clipboard copy with browser feature detection.
- Native PNG file sharing with content-aware filenames and cancellation handling.
- Installed-PWA GET share target for incoming links and text.
- Clear guidance for PNG, SVG, PDF, and WebP formats.

### Privacy and compatibility

- Copy, share, PDF, and all raster exports use the current local SVG without uploading content.
- Native share text is generic and never includes the QR payload.
- Incoming share parameters are removed from the address bar and browser history immediately after local processing.
- Unsupported clipboard and file-sharing actions remain hidden without silently downloading.

## [1.9] - 2026-07-13

### Added

- Local QR image import from the file picker, drag and drop, and pasted screenshots.
- Six advisory local scan simulations covering size, blur, contrast, and slight rotation.
- Excellent, Good, Risky, Poor, and Unavailable scan-confidence grades.
- A conservative Fix automatically action for risky or poor QR designs.
- Collapsed per-simulation scan test details.
- Bundled jsQR decoding for fully offline operation.

### Security and privacy

- QR images, generated simulations, logos, and payloads remain in the browser and are never uploaded.
- Imported images are limited to 12 MB and decoded at a maximum 1600px canvas dimension.
- Custom logos are limited to 5 MB and rasterized locally to PNG at a maximum 1024px dimension.
- Custom SVG logos reject scripts, event handlers, foreign objects, external references, and nested active SVG content before rasterization.
- Stale asynchronous scan results cannot overwrite a newer QR result.

### Quality

- Added pure tests for scan grading, exact payload matching, file validation, aspect-ratio sizing, automatic fixes, stale-run protection, SVG safety, and imported-content detection.
- Verified 87 tests, a successful production build, 320px and 375px layouts, local PNG/drop/paste import, automatic repair, custom SVG rasterization, and installed-PWA offline reload.

[1.9.1]: https://github.com/subtlesayak/SayaQR/compare/v1.9...v1.9.1
[1.9]: https://github.com/subtlesayak/SayaQR/compare/v1.8...v1.9
