(async()=>{
  try {
    const files=['./app-parts/01.txt','./app-parts/02.txt','./app-parts/03.txt','./app-parts/04.txt','./app-parts/05.txt','./app-parts/06.txt','./app-parts/07.txt'];
    const code=(await Promise.all(files.map(file=>fetch(file).then(r=>{if(!r.ok)throw new Error(file);return r.text()})))).join("");
    Function(code)();
  } catch(error) {
    document.getElementById("app").innerHTML=`<main style="max-width:620px;margin:40px auto;padding:24px;font-family:system-ui;direction:rtl"><h2>تعذر تشغيل التطبيق</h2><p>${String(error.message||error)}</p><button onclick="location.reload()">إعادة المحاولة</button></main>`;
  }
})();
