# قارئ القاعدة المدنية — مكوّن قابل للدمج

**واجهة الطالب:** زر تشغيل الكاميرا، ثم تقريب رمز QR من العدسة لمرة واحدة، ثم إبعاد الكاميرا لتظهر الصفحة والإشارة بالسبابة إلى الحرف. لا اختيار صفحة ولا معايرة يدوية ولا PDF ولا أدوات إدارة.

## البناء
```sh
npm ci
npm test
npm run build
```

يمكن استخدام الاستضافة المستقلة على HTTPS، أو تحميل مخرجات `dist/sdk/madani-reader.es.js` وملف `dist/sdk/madani-reader.css` داخل التطبيق المضيف.

## الاستيراد في تطبيق آخر
```js
import {mountMadaniReader} from "/modules/madani-reader.es.js";
const reader=mountMadaniReader(document.querySelector("#camera-reader"),{
  assetBase:"/madani-reader/",
  onPage: ({page,printedPage})=>console.log("recognized",printedPage),
  onWord: ({zoneId,text})=>console.log("played",text),
  onStatus: message=>console.log(message)
});
// reader.start() on an actual button click, or keep the built-in single start button.
// reader.stop(); await reader.destroy() on navigation.
```

تحتاج المسارات تحت `assetBase` إلى `data/pilot-audio.json` و`pilot-media` المرتبطة به. تُحمّل صورة/ملف الصوت من أصل الاستضافة نفسه دون رفع صور الكاميرا. تتطلب كاميرا المتصفح HTTPS، ويتطلب نموذج MediaPipe اتصالًا أول مرة.

**الطبعة الحالية التجريبية:** صفحات 15–17 المطبوعة فقط. كل رقم QR محفوظ يطابق رقم صفحة PDF 17–19. المقاطع الصوتية التسعون لم تُعتمد سمعيًا بعد.

**ملاحظات الدقة:** QR يحدد هوية الصفحة، وليس هندسة الورقة بالكامل. بعد إبعاد الهاتف يتتبع المكوّن شكل الصفحة أو يعاود استخدام موضع QR متى أمكن. لن ينطق الحرف عندما يفقد التحديد الهندسي؛ يلزم اختبار ميداني في الإضاءة والزوايا الحقيقية. عند تكرار التجربة يجب تثبيت الهاتف فوق الكتاب، حتى لا تختلط هندسة المسح القريب مع هندسة الصفحة الواسعة.
