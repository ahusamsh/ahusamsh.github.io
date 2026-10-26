import {defineConfig} from "vite";
export default defineConfig({build:{outDir:"dist/sdk",emptyOutDir:false,lib:{entry:"src/reader-module.js",name:"MadaniReader",formats:["es"],fileName:"madani-reader.es"},cssCodeSplit:false,rollupOptions:{output:{assetFileNames:"madani-reader.[ext]"}}}});
