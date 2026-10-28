# CHANGELOG

## 2026-10-25 — تأسيس سياسة هندسة الوكلاء (وثائق فقط)
- إضافة/تحديث `.github/PULL_REQUEST_TEMPLATE.md` مع فحص مستوى المخاطر، أدلة الاختبار، الحدود الأمنية، والتراجع وفق المنهج؛ لم تُفعَّل حماية فروع أو CI من خلال ذلك.
- إنشاء ملفات `AGENTS.md` و`CLAUDE.md` و`docs/ENGINEERING_PLAYBOOK.md` و`docs/CHANGE_POLICY.md` مع قواعد مخصوصة بالمشروع ومراجع FerroxLabs/OpenAI/Anthropic/NIST/OWASP/DORA.
- التحقق: معاينة بعض ملفات المستودع قبل وضع التعليمات. لم تُعدل شيفرة التشغيل، ولم تُشغل اختبارات، ولم يتم أي نشر أو تفعيل CI.

## 2026-10-26 — Madani Reader PWA: first three lesson pages
- Added source-linked timing and geometry for printed pages 15–17 (PDF 17–19): 90 word/shape clips, 58 physical-box clips, three full-page recordings.
- Added repeatable audio extraction, independent review UI, standalone HTML packaging, and offline asset preparation; media is generated rather than committed.
- Added an explicit trial playback mode without marking clips scientifically reviewed; fixed stale page audio, playback cancellation and whole-page cutoff.
- Verification: 11 Node tests, Vite build, Chromium decoding of 151 MP3s, mobile-width RTL checks. Human listening review and physical Android/camera checks remain outstanding.
- Prepared an isolated Vercel trial project on the connected institutional-email account following the user's request for a testing link. No main-site files or existing deployments are changed.

## 2026-10-28 — Madani camera response and weak-image reliability
- Replace small-QR-only camera geometry with local printed-grid feature matching in a worker; normalize weak lighting and clear stale page positions.
- Predecode bounded audio cache, shorten stable interior pointing to 80 ms, reject sweeps and duplicate jitter; use GPU hand inference with CPU fallback, autofocus/exposure and optional torch.
- Preserve the 104-page catalog, 18 edition maps and all review states. 34 Node tests pass; 18 degraded-image cases and perspective/occlusion/unsupported-page checks pass. Nine simulated points schedule audio in 148–200 ms, median 182 ms. Physical Android optics/fingers and acoustic latency remain unverified.
- Full evidence and operating limits: madani-reader-pwa/docs/CAMERA_PERFORMANCE_2026-10-28.md. Roll back by restoring the preceding Vercel deployment.

### 2026-10-28 - Cold audio startup follow-up
- Stage the 90 pilot clips while camera models initialize; retain compressed audio in a bounded 8 MiB cache alongside the existing 24 MiB decoded cache.
- Production baseline exposed network misses (477 ms median); avoid refetching clips when turning pages. Added memory-bound, retry and detached-buffer reuse tests. All 36 tests and production build pass.
