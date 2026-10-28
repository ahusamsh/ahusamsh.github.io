# Camera response and degraded-image validation — 28 October 2026

## Problem and implemented behavior
The preceding camera reader scanned a small QR about once per 1,050 ms, extrapolated the whole page from four nearby QR corners, waited 300 ms on a target and opened a new MP3 on each selection. A small/blurred or covered QR could prevent reading even while the letter grid was legible.

The camera now matches printed content across the page in an isolated Web Worker (OpenCV ORB and RANSAC) and recomputes the perspective transform approximately every 170–350 ms without running that search on the UI thread. Reference features are restricted to the teaching grid so common headers/borders cannot identify a different lesson. It requires distributed matching features, rejects ambiguous candidates and requires two consistent observations. It clears a lost/stale mapping within 900 ms instead of retaining it for about four seconds.

Dark/low-contrast frames receive a percentile-based grayscale stretch before matching. The application requests continuous autofocus/exposure only when advertised by the camera and exposes a torch button only on supporting hardware. Hand inference prefers GPU, with CPU fallback on initialization failure and a measured sampling interval. Images stay on the device.

A stable interior target needs at least two observations and 80 ms; borders need 160 ms. Sweeps reset the target, short missed-hand detections do not replay it, and deliberate withdrawal re-arms playback. Audio is decoded ahead of time into a bounded 24 MiB LRU cache with three warm-up requests at a time. A canceled pending request cannot start sound later. Manual recordings and uncached timestamp-based catalog entries retain their existing playback behavior.

## Reproducible evidence
- Existing catalog, edition and audio-map regression tests plus lifecycle, pointer and audio cancellation tests pass (see test output and reports).
- 18 synthetic camera scenes, using all three actual page images: normal, 22% brightness, low contrast, 1.1px blur, 480px frame width and QR covered. New visual matching identified 18/18. The prior jsQR fallback did not recognize the deliberately small QR in those same framed scenes; this is a bounded comparison, not a general camera accuracy claim.
- Vision inference in those scenes: approximately 134–220 ms on the test workstation, running outside the UI thread.
- Perspective and simulated-hand occlusion checks; two actual unsupported book pages must be rejected.
- The real OpenCV worker and real MediaPipe model initialize in Chromium from same-origin assets. A subsequent pipeline test supplies synthetic fingertip landmarks to isolate mapping and audio timing: nine correct clips across three page switches; median 182 ms and maximum 200 ms from supplied stable fingertip position to Web Audio source start. All nine clips were pre-decoded.
- These times do **not** measure physical hand-detection delay, the MP3's existing silence padding, hardware output latency or acoustic speaker onset. There is no claim of validation on a physical Android camera or a human hand in darkness.
- The review status of source audio remains unchanged; nothing is auto-approved.

## Scope and operation
Camera recognition still covers printed pages 15–17 (PDF 17–19). The existing 104-page catalog and 18 edition maps are preserved; their presence does not mean every page has verified camera recognition or audio.

`npm ci`, `npm test`, `npm run build` prepare the application. The build restores pinned pilot media and copies pinned OpenCV/MediaPipe assets; the hand model's SHA-256 is checked. Large vision assets load on camera use and are cached locally for later sessions, rather than being forced into the initial offline install. No paid inference service is used.

Browser QA scripts accept a base URL argument, `PLAYWRIGHT_MODULE` (module or file URL) and `CHROME_EXECUTABLE`; results go into `.qa/`. Tests use generated canvas video and fresh browser contexts, not a person's camera or browser profile. Keep the preceding deployment as the rollback target.

## Sources and dependencies
- OpenCV.js 4.11.0 via pinned `@techstark/opencv-js@4.11.0-release.1`; feature matching/RANSAC with geometric checks.
- MediaPipe Tasks Vision 0.10.21 and pinned hand model; same-origin copies, browser-only inference.
- `src/page-vision.js` remains as the legacy QR implementation and benchmark baseline; the current camera controller uses `VisualTracker`.

## First-network-use follow-up
The first production check passed, but eight of nine synthetic selections still needed a network fetch: median 477 ms, maximum 565 ms (see camera-live-cold-baseline.json). Camera startup now stages all 90 pilot MP3s (about 0.76 MB total) in a separate bounded 8 MiB compressed cache while loading the models. The active page is decoded immediately; compressed bytes remain available after decoded-cache eviction, avoiding a second network request when turning pages. Copies prevent decodeAudioData from detaching cached bytes. Staging is limited to three workers and 96 entries, shares pending fetches, and retries failures. Two regression tests cover reuse and memory bounds; all 36 Node tests and the production build pass.
