# Direct local letter reading — experimental branch
Date: 29 October 2026
Branch: `feature/madani-local-letter-reader`
Scope: First printed alphabet lesson (printed page 15 / PDF page 17) only. Keeps prior production preview untouched.

## Requested change
A pupil can show only part of the book and point with an index fingertip or a plain dark pen. The selected audio must come from the printed character near that tip, **not** from a stored page-coordinate rectangle.

## Architecture
1. QR still identifies the *source book and audio library* at the beginning of the pilot session. The page itself need NOT be entirely visible after that.
2. Extract visual letter exemplars from approved printed source artwork once in the browser. Printed page coordinates are used **only to prepare exemplars**, never to decide which camera character was touched.
3. Build an image-space glyph inventory from black ink clusters in the camera frame. Compare each nearby printed glyph to the exemplar bank using normalized masks and bidirectional distance transforms. The recognition is local; a partial cropped page is supported.
4. Detect the actual *tip* of a visible skin-colored finger or dark thin pen using connected image-space components and their entry boundary. The full palm is not needed. This does not use MediaPipe palm detection or page homography.
5. Choose only a nearby visually recognized glyph if the label score and the second-best margin are adequate; use a cached clear image from before the finger covered the letter. Reconcile small handheld translations by other visible glyph labels.
6. Require the same selection in two independent observations at least 140 ms apart. Do not play on ambiguous, absent or unrecognized pointers. Audio is still played from the stored instructional recording.

## What was actually verified
- Reference alphabet page 15 at several scaled positions: 28/28 printed letter labels recognized in a synthetic transformed-image test under loose confidence parameters. This is **not** a phone-photo field accuracy figure.
- Independent image-space finger/pen detection: positive for synthetic skin-colored fingertip and plain dark pen; negative on a clean book image, dark broad page shadow and black frame border.
- Integrated Chrome fake-camera test: QR -> partially visible page -> no audio in clear/untouched scene -> point to the letter `ش` -> audio `شين` starts. Same result with a dark pen and small camera motion. Other glyphs `ح` and `ا` passed; `ت` deliberately abstained when the match was ambiguous.
- 52 unit tests passed after integration.
- **Not yet verified on actual Android camera feed**: false positives on varied real desk/clothing colors, pencil shapes, skin tones, blurring/lighting and child's natural rapid movements.
- **Only printed page 15 isolated alphabet characters** use the local path. Page 16/17 continues with previous page-based approach, and longer words/multi-character segments need a different local OCR/word grouping model before release.
- It is not scientifically possible to read a glyph completely hidden by the finger from a single frame. The current prototype uses recently seen unobstructed ink and refuses unsupported guesses.

## Non-regression / field trial
- Do not replace the stable `feature/madani-reader-pwa` branch on the basis of synthetic tests alone.
- Phone test should cover a blank scene, a normal book with no pointer, a dark pen, bare fingertip, pointer near cell borders, page cut at left/right/top/bottom, shadows, glare, nearby printed page, and moving phone.
- Measure false audible activations (must be zero in the acceptance set) and correct audio from confirmed visible target. Focus on alphabet pairs ب/ت/ث, ج/ح/خ, س/ش, ص/ض, ط/ظ, ع/غ, ف/ق.
- Avoid announcing experimental predictions as approved teaching content without editorial listening review.
