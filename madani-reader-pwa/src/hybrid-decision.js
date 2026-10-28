// Conservative fusion: geometry locates the candidate; appearance independently
// verifies visible ink. An occluded letter cannot be OCR-verified from pixels.
export function decideHybrid({geometryStrong=false,stableFrames=0,appearance}={}){
 const status=appearance?.status||"inconclusive";
 if(status==="match")return {allow:true,reason:"geometry-and-appearance"};
 if(status==="mismatch")return {allow:false,reason:"clear-shape-mismatch"};
 if(geometryStrong&&stableFrames>=2)return {allow:true,reason:"strong-pose-with-occluded-letter"};
 return {allow:false,reason:"insufficient-confidence"};
}
