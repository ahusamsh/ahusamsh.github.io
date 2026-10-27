# Handheld performance and occlusion pilot — 27 October 2026

## Why this change
Actual Android user testing confirmed that QR scanning, page alignment and finger-triggered voice **work**, but felt slow; hand occlusion caused a repeated setup impression. The system is an embeddable module of a future host app, not an independent lesson-management app.

## Engineering changes
- Use native QR barcode detection directly from the video when the Android browser offers it; avoid video screenshot allocation on this fast path. JS QR fallback now tries the central crop first, with a smaller frame.
- Initialize visual-page matching and MediaPipe hand model concurrently after QR recognition, rather than serially.
- Keep the recognized page ID throughout brief and prolonged occlusions; do not return to QR scan unless the user ends the session.
- Use JSFeat Lucas–Kanade optical flow to update distributed page anchors between full perspective (ORB/RANSAC) matches.
- Reacquire the full page if optical-flow tracking or pose validation fails; never play based on indefinitely stale page geometry.
- Reject unrealistic pose jumps and wrong-page selections to reduce adjacent-letter playback risk.
- Permit replaying the same teaching letter after the fingertip leaves the zone and returns.
- Keep existing Arabic educational recordings and camera-only UI.

## Executed tests
- Three real pilot source images / correct QR identification: previously tested.
- Browser simulation of moving page plus partial hand-like occlusion: optical flow continued for 8 frames (7–17 ms per update in that desktop test; 48–53 ms full ORB match).
- Browser simulation of **total page occlusion ~3.8 seconds**: phase remained `point`, alignment became temporarily unavailable, and then recovered automatically to `aligned:true` after page reappearance. No QR rescan.
- Existing end-to-end fake camera video: QR -> page -> hand model ready, no JavaScript page errors.
- Local Node test suite: all green.
- These are **desktop simulated results, not Android latency guarantees**. Genuine child-hand, low-end-phone battery/performance and MP3 timing remain to be field tested.
- Camera hand model initial load still uses a network dependency, and only printed pages 15–17 are mapped.

## Future field priorities
1. Benchmark p50/p95 timings on actual Android hardware for QR, alignment, finger and audio, with no raw images uploaded.
2. Handle partially visible fingertips when the palm falls outside the camera frame.
3. Replace full generic hand landmark inference when a lightweight fingertip detector has been validated on multiple children/hands.
4. Package MediaPipe runtime/assets for robust offline repeat use after checking distribution licensing.
5. Expand beyond the three pilot pages once the phoneme/cell audio editorial review is complete.
