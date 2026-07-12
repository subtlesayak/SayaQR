# Changelog

All notable changes to SayaQR are documented here.

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

[1.9]: https://github.com/subtlesayak/SayaQR/compare/v1.8...v1.9
