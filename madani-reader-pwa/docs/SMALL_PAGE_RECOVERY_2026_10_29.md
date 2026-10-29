# معالجة فقد محاذاة الصفحة البعيدة داخل صورة الجوال — 29 أكتوبر 2026

## البلاغ الميداني
أظهرت صورتان فعليتان من هاتف أندرويد أن صفحة الحروف المطبوعة رقم 15 ظاهرة كاملة داخل الكاميرا، لكن القارئ يكرر «وجّه الكاميرا إلى الصفحة كاملة لتحديد الحروف بدقة». تظهر الصفحة صغيرة نسبيًا في النصف السفلي، ومعها ورقة بيضاء كبيرة والصفحة المقابلة.

## السبب الفني الذي أكدته المحاكاة
- خوارزمية ORB/RANSAC على الإطار الكامل قد تُعيد تحويلًا هندسيًا مستحيلًا عندما يشغل جدول الحروف مساحة صغيرة، بسبب تشابه أشكال الحروف المتكررة.
- النظام السابق لم يبحث داخل منطقة الكتاب المحسّنة إذا فشلت المطابقة الأولى، بل واصل انتظار صفحة كبيرة في الإطار.
- QR يحدد رقم الصفحة فعليًا؛ لا حاجة لإعادة مسحه لإصلاح المحاذاة.

## التحسين
- Validate homography by projecting known physical page corners into the camera frame; reject singular, folded, extremely tiny or implausible page poses.
- When the initial full-frame result is missing/weak AND the current page is known, search up to three partial camera ROIs automatically, especially lower-left/lower-middle areas containing a distant book.
- Convert each accepted crop homography and its inlier anchors back to **full camera normalized coordinates** to preserve fingertip mapping correctly. Reject low-visual-evidence solutions with too few inliers.
- Use crop search only while reacquiring a lost page. Once tracking works, retain the existing lightweight optical-flow updates.
- Keep the strict pointer-only/pen detector disabled following false-positive observations on Android.
- Camera frames stay on the child's device; no upload.

## Test results
- 46/46 Node tests pass; new tests validate impossible pose rejection and crop-to-full-frame geometry conversion.
- Desktop browser simulated page reference image as a **small printed page low in portrait video**, with blank background and partial neighboring page. Recovery found 147–167 inliers in standard small views and 84–159 in more distant views.
- Blank page with no lesson returned no match.
- Camera end-to-end simulation: QR -> smaller printed page (390×550 inside 850×1180 camera) -> `aligned: true`, `handReady: true`, optical flow tracking started.
- These are **simulated desktop results**, not proof that every low-quality Android frame is correctly registered. Real phone field testing with the two user-provided screenshots' scene remains required.

## Non-goals
- Does not enable unverified pen/tip-only detection.
- Does not change mapped audio recordings or educational content.
- Does not ask for manual page selection or calibration.
- Entire book still not supported (pilot printed pages 15–17 only).

## Rollback
The last known hand-only preview before this change was `https://madani-reader-pilot-7zhiwb0kw-muzn2.vercel.app`.
