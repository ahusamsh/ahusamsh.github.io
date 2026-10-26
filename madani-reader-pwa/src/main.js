import {mountMadaniReader} from "./reader-module.js";
const reader=mountMadaniReader(document.getElementById("reader-root"),{assetBase:"./"});
window.__madaniReader=reader;
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
