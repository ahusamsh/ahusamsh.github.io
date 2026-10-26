# القاعدة المدنية الذكية — Madani Reader PWA
## Status: engineering prototype, not a published educational product
This PWA provides: PDF import rendered locally with pdfjs-dist; manually switchable pages; actual word bounding boxes extracted from the official 104-page PDF for pages 13, 17, 25, 69, 75; 91 pages of URL-linked audio/QR metadata extracted from the PDF annotations; page QR outbound link; local page-audio upload; time-range audio segment editor; touch-to-play **only for approved segments**; camera capture; four-corner page calibration via projective homography; optional MediaPipe hand-landmark finger location (loads model over the internet on first use); installable application shell.

### How to run
1. `npm ci` (or `npm install` if lockfile is not yet available).
2. `npm run dev`; visit the localhost URL. Camera access requires localhost or HTTPS.
3. Choose the official PDF downloaded separately from https://files.a-alqasim.com/books/AbdulMuhsin/AlQaaidahAlMadaniyahAlQiraaah.pdf
4. Select one of the pilot PDF pages 13,17,25,69,75; toggle touch zones; use page QR link.
5. Download/obtain legitimately authorized page recording, load it via the Audio tab, tap a word, mark start/end while listening, then approve locally and export JSON for editorial review.
6. To test camera, choose camera tab, enable camera, select correct page number, calibrate physical page corners in order top-left/top-right/bottom-right/bottom-left on **the screen image**, then enable finger tracking. A finger dwell of 700ms selects the mapped word.

### Important technical limits
- **NO independently verified word-level recordings yet**. Original QR short links can redirect to servers that deny automated access (observed HTTP 403). Page audio cannot be assumed to contain clean isolated words or fixed timing; segment boundaries need manual educational review.
- **OCR bounding boxes are not verified**: PDF word extraction mishandles some mixed script, Arabic ligatures and small tokens, particularly pages 13 and 75. An instructor must correct all boundaries/text before production. No claims of 100% accuracy.
- Calibration is manual: the camera does not yet reliably detect the page number, camera corners or whether a finger actually physically touches the page. Pointing works in prototype conditions only; real tablet/mobile tests necessary.
- Camera stream is kept local and never uploaded. Uploaded PDF and WAV stay in the browser; page timing metadata is localStorage (which can be exported).
- No official PDF, private recording, or copyright material is committed to this repository. Publish only after permission/approval.
- MediaPipe WASM/model need internet on first invocation; full offline camera-hand tracking requires bundling these locally.
- **Security**: unapproved segments remain silent. The PWA has no auth and no server data collection.

### Data files
`public/data/demo-pages.json`: normalized PDF-coordinate pilot zones, auto-extracted with PyMuPDF from authoritative edition; `reviewed:false`.
`public/data/page-links.json`: PDF annotation URLs, indexes are 1-based PDF page positions (different from printed folio numbers).
Mapping JSON schema: `{"schema":1,"segments":{"p17-w12":{"start":0.5,"end":0.9,"reviewed":true}}}` as locally reviewed data, not yet formal approval.

### Next gates
1. Confirm legal permission to package printed pages and sound recording assets.
2. Acquire and review 3-5 official audio pages; align word clips with reliable start/end times (not inferred by text alone).
3. Curate 100% word polygon mappings for sample pages with instructional expert; fix diacritic/object grouping.
4. Evaluate finger tracking and perspective rectification on Android devices, in variable illumination.
5. Bundle hand model offline and validate with tests on devices.
6. Integrate this folder into its own institute-owned repo after GitHub repository creation is authorized/enabled. Current connected GitHub plugin offers file writes to accessible repos but **no create_repository operation**; this project resides in a feature branch of the accessible `ahusamsh/ahusamsh.github.io` repo as a safe, unmerged staging location.
No existing site code is modified, and nothing is published or deployed.
