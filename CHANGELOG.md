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
