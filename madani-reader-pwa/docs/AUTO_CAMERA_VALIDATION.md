# Auto-camera recognition pilot — 26 October 2026

## User journey implemented
1. Open the app: the camera tab is the default.
2. Tap **تشغيل الكاميرا والقراءة مباشرة**, grant camera permission.
3. The QR symbol already printed at the top of the teaching page is scanned from the live camera (native BarcodeDetector when available, jsQR fallback).
4. The page number and projected position are computed automatically from the QR corners plus known QR locations in the official PDF: printed 15/16/17 → PDF 17/18/19.
5. Hand tracking initializes automatically; when the index fingertip dwells over a mapped glyph for 300 ms, its own official audio clip plays; no page selection, no corner calibration, no separate finger-tracking button.
6. An unknown QR or weak scan does NOT select a page or trigger audio.

## Evidence from executable tests
- Chrome (desktop, headless) tested against the **three actual printed page images** at native image size: 3/3 correct.
- Chrome tested against all three source images re-rendered at 850×1180: 3/3 correct after adding targeted image-thresholding fallback.
- Chrome exercised the **real video element and the complete app camera flow** using an animated CanvasCaptureMediaStream containing a page 15 image: automatic detection reports “تعرّفت على الصفحة 15”; frame video running; no JavaScript errors; stopped-camera overlay hidden.
- 17 node tests passed, including mapping the QR geometry to a glyph in each page and rejecting unrecognized QR codes.
- Production build succeeds. First-use MediaPipe hand model requires Internet.

## Limitations
- This is **NOT yet validated on an actual Android phone or a paper page in real lighting**, and no live finger-to-audio end-to-end result is claimed.
- QR must be visible, in focus, large enough, and correspond to the *supported edition*. Perspective extrapolation from a small QR can shift positions at the far side of the paper. Another visual reference or independent page-edge detection should be added before classroom reliability is claimed.
- The only mapped/segmented teaching pages are printed 15/16/17. Other pages remain outside the automatic speaking pilot.
- Official audio recordings were machine-segmented; 90 clips remain unapproved for instructional release.
- The 300 ms dwell is a prototype gesture. Genuine contact with the paper is not independently sensed by the camera.
- Camera frames do not leave the browser; QR decoding and hand tracking are performed locally after model download.
