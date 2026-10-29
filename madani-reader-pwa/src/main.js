import {mountMadaniReader} from "./reader-module.js";
const reader=mountMadaniReader(document.getElementById("reader-root"),{assetBase:"./",recognitionMode:new URLSearchParams(window.location.search).get("recognition")==="ocr"?"ocr":"geometry"});
window.__madaniReader=reader;
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
