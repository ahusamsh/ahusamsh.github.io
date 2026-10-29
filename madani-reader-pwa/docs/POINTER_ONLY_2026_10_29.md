# Pointer-only reader — finger tip or ordinary pen (29 October 2026)

## Why
Real Android field screenshot showed an index fingertip aimed at «ح» while MediaPipe reported the hand was not visible. The user wants a child to point using only a fingertip or an ordinary pen, with no hand calibration or requirement to present the palm.

## Implementation
- Keep the previous location-based word/audio selection, QR-first identification and optical-flow page recovery unchanged.
- Add optional `PointerVision` in `src/pointer-vision.js`. It warps camera pixels to the already recognized printed page, compares with that page's reference image, and extracts a prominent foreground implement entering the educational grid from its margins.
- The farthest connected, elongated foreground protrusion gives a fingertip/pen endpoint. Bridge small straight breaks caused by the printed ink and table borders.
- Reject ambiguous competing components and implausible broad lighting changes. No interpretation of tool type or children's identity, no images transmitted to servers.
- Run foreground fallback only when hand landmark detection has no fingertip and recent page alignment is available.
- Fallback runs at a lower cadence; a selection must be observed twice before playing audio. Preserve the last candidate across the detector's sampling gaps but never trigger audio from a missing pointer.
- This is an **image-appearance heuristic**, not a trained general pen detector. Actual performance in real hands, cluttered desks, different pencil colors, shadows and lighting is yet unverified.

## Validation (desktop simulator, real source page and audio)
- Bare partial fingertip → identified target `p17-w6` («ح») and actual WebAudio status `playing`.
- Plain dark pen → identified `p17-w6` and audio `playing`.
- No fingertip or pen → no target; audio remained `idle`.
- With camera motion, the page pose was tracked and the pen activated the correct word.
- Known synthetic camera pose shifted +0.5%, +1%, +2%, -2%: pen endpoint stayed in the correct target `p17-w6`; clean reference page gave no false pointer.
- Initial attempts did not pass because dark text crossed the pen shaft and because the fallback's slower sampling reset the finger selection; both were corrected, then rerun.

## Follow-up field checks
- Different pen colors/materials (dark, blue, metallic, translucent), skin tones, low light and print editions.
- On actual Android phones: latency and battery, confusion between adjacent zones, failure-to-detect rate and false audio trigger rate.
- Do not remove MediaPipe fallback or require a pen marker/sticker.
- Keep last known working preview available if the regression test on the phone is unsatisfactory.
