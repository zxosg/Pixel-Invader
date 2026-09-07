import { describe, expect, it } from "vitest";
import {
  artisticThreshold,
  renderArtisticOrdered,
  renderArtisticPairField,
} from "./artistic-ordered.js";
import { DEFAULT_CONVERSION_SETTINGS, convertToZx } from "./index.js";
import { DITHER_ENGINES, assertCompatibleEngines, isCompatibleEnginePair } from "./engines.js";
import { decodeAttribute, zxColor } from "./palette.js";
import type { ConversionSettings } from "./types.js";
const base: ConversionSettings = { ...DEFAULT_CONVERSION_SETTINGS, framing: "stretch", resampling: "nearest",
  attributeOptimizerId: "zx-guide-reference-halo-v1", ditherEngineId: "artistic-ordered-hybrid-v1",
  dithering: "ordered", ditheringAmount: 100, artisticPattern: "checkerboard" };
const fixture = (fn: (x: number, y: number) => readonly number[]) => {
  const data = new Uint8Array(256 * 192 * 4);
  for (let y = 0; y < 192; y++) for (let x = 0; x < 256; x++) data.set([...fn(x, y), 255], (y * 256 + x) * 4);
  return data;
};
const source = fixture((x,y) => [x, y, (x+y)&255]);
const black = { r: 0, g: 0, b: 0 }, white = { r: 255, g: 255, b: 255 };
const amountCoverage = (coverage:number,amount:number) => amount === 0
  ? Number(coverage >= 0.5)
  : Math.max(0,Math.min(1,0.5+(coverage-0.5)/(amount/100)));
const srgbLinear=(value:number)=>{
  const v=value/255;
  return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
};
const meanLuma=(rgba:Uint8Array,x=0,y=0,width=256,height=192,stride=256)=>{
  let total=0;
  for(let yy=y;yy<y+height;yy++) for(let xx=x;xx<x+width;xx++) {
    const offset=(yy*stride+xx)*4;
    total+=0.2126*srgbLinear(rgba[offset]!)+0.7152*srgbLinear(rgba[offset+1]!)+0.0722*srgbLinear(rgba[offset+2]!);
  }
  return total/(width*height);
};

describe("Artistic ordered hybrid v1", () => {
  it.each([1,2,4,8] as const)("is deterministic, legal, and zero-byte-identical at height %i", (attributeHeight) => {
    const settings = { ...base, attributeHeight, paletteSelections: [{ screenIndex: 0, enabledColorIds: [0,2,4,7], brightMode: "off" as const }] };
    const a = convertToZx(source,256,192,settings,"draft");
    const b = convertToZx(source,256,192,settings,"draft");
    expect(a.frames[0]!.encoded).toEqual(b.frames[0]!.encoded);
    for (const attribute of a.attributes) {
      expect(attribute & 0xc0).toBe(0);
      expect([0,2,4,7]).toContain(attribute & 7);
      expect([0,2,4,7]).toContain((attribute >> 3) & 7);
    }
    for (let y=0; y<192; y++) for(let x=0;x<256;x++) {
      const i=y*256+x;
      const pair=decodeAttribute(a.attributes[Math.floor(y/attributeHeight)*32+Math.floor(x/8)]!);
      const color=a.pixels[i] ? pair.ink : pair.paper;
      if (a.previewRgba[i*4] !== color.r || a.previewRgba[i*4+1] !== color.g || a.previewRgba[i*4+2] !== color.b) throw new Error("Illegal pixel");
    }
    const zero = convertToZx(source,256,192,{...settings,ditheringAmount:0},"draft");
    const none = convertToZx(source,256,192,{...settings,ditherEngineId:"none-discrete-v2",dithering:"none",ditheringAmount:0},"draft");
    expect(zero.frames[0]!.encoded).toEqual(none.frames[0]!.encoded);
  });
  it("uses the same Artistic carrier for 8x1 and 8x2", () => {
    const sourceRows = fixture((_x, y) => y % 2 === 0 ? [32, 32, 32] : [224, 224, 224]);
    const attributes8x1 = new Uint8Array(32 * 192).fill(71);
    const attributes8x2 = new Uint8Array(32 * 96).fill(71);
    const guide = new Uint8Array(256 * 192);
    for (let y = 0; y < 192; y++) guide.fill(y % 2 === 0 ? 0 : 1, y * 256, (y + 1) * 256);
    const one = renderArtisticOrdered(sourceRows, attributes8x1, 1, 31, "checkerboard", guide, 4);
    const two = renderArtisticOrdered(sourceRows, attributes8x2, 2, 31, "checkerboard", guide, 4);
    expect(one).toEqual(two);
  });
  it.each(["on", "off", "auto"] as const)("preserves palette flats with BRIGHT %s", (brightMode) => {
    for (let code=0;code<8;code++) {
      const c=zxColor(code,brightMode!=="off");
      const flat=fixture(()=>[c.r,c.g,c.b]);
      const output=convertToZx(flat,256,192,{...base,paletteSelections:[{screenIndex:0,enabledColorIds:[0,1,2,3,4,5,6,7],brightMode}]},"high");
      expect(output.previewRgba).toEqual(flat);
      if(brightMode!=="auto") expect(output.attributes.every(a=>!!(a&64)===(brightMode==="on"))).toBe(true);
    }
  });
  it.each(["checkerboard","horizontal","vertical"] as const)("has nested, exactly calibrated %s coverage including candidate eligibility", family => {
    for(const rowOnly of [false,true]) {
      const thresholds = Array.from({length:4096},(_,i)=>artisticThreshold(i%(rowOnly?128:64),Math.floor(i/(rowOnly?128:64)),family,rowOnly));
      expect(new Set(thresholds).size).toBe(4096);
      let previous=new Set<number>();
      for(const coverage of [0,0.01,0.125,0.25,0.37,0.5,0.63,0.75,0.99,1]) {
        const active=new Set(thresholds.flatMap((t,i)=>t<coverage?[i]:[]));
        for(const i of previous) expect(active.has(i)).toBe(true);
        expect(Math.abs(active.size/4096-coverage)).toBeLessThanOrEqual(0.5/4096);
        previous=active;
      }
    }
  });
  it("produces the requested half-coverage motifs",()=>{
    const bits=(family:"checkerboard"|"horizontal"|"vertical")=>[0,1,2,3].map(i=>Number(artisticThreshold(i%2,Math.floor(i/2),family)<0.5));
    expect(bits("checkerboard")).toEqual([1,0,0,1]);
    expect(bits("horizontal")).toEqual([1,1,0,0]);
    expect(bits("vertical")).toEqual([1,0,1,0]);
  });
  it("covers constant linear-light tones and has no attribute phase restart",()=>{
    for (const v of [32,64,128,163,192,224]) {
      const flat=fixture(()=>[v,v,v]);
      const pixels=renderArtisticOrdered(flat,new Uint8Array(768).fill(71),8,100,"checkerboard");
      const target=v/255;
      expect(Math.abs(pixels.reduce((a,b)=>a+b,0)/pixels.length-target)).toBeLessThan(1/4096);
      for(let y=0;y<192;y++) for(let x=0;x<256;x++) if(pixels[y*256+x]!==Number(target>artisticThreshold(x,y,"checkerboard"))) throw new Error("Phase seam");
    }
  });
  it("preserves exact diagonal edges, one-pixel lines and isolated features",()=>{
    const edge=fixture((x,y)=>x===33 || y===81 || x===y || (x===140&&y===90) ? [255,255,255]:[0,0,0]);
    for(const artisticPattern of ["auto","horizontal","vertical","checkerboard"] as const) {
      const result=convertToZx(edge,256,192,{...base,artisticPattern,paletteSelections:[{screenIndex:0,enabledColorIds:[0,7],brightMode:"on"}]},"high");
      expect(result.previewRgba).toEqual(edge);
    }
  });
  it("uses the same amount-to-coverage transform as ordered Bayer",()=>{
    const flat=fixture(()=>[163,163,163]);
    const target=163/255;
    for(const amount of [1,25,50,75,100]) {
      const pixels=renderArtisticOrdered(flat,new Uint8Array(768).fill(71),8,amount,"checkerboard");
      expect(Math.abs(pixels.reduce((a,b)=>a+b,0)/pixels.length-amountCoverage(target,amount))).toBeLessThan(1/4096);
    }
  });
  it("applies the ordered amount transform to saturated legal mixtures",()=>{
    const red=fixture(()=>[128,0,0]);
    const target=128/205;
    for(const amount of [1,23,33,45,48,75,100]) {
      const pixels=renderArtisticOrdered(red,new Uint8Array(768).fill(2),8,amount,"checkerboard");
      expect(Math.abs(pixels.reduce((a,b)=>a+b,0)/pixels.length-amountCoverage(target,amount))).toBeLessThan(1/4096);
    }
  });
  it("does not inject guide corrections into confirmed palette endpoints",()=>{
    const blackSource=fixture(()=>[0,0,0]);
    const whiteSource=fixture(()=>[255,255,255]);
    const black=renderArtisticOrdered(blackSource,new Uint8Array(768).fill(71),8,23,"checkerboard",new Uint8Array(256*192));
    const white=renderArtisticOrdered(whiteSource,new Uint8Array(768).fill(71),8,23,"checkerboard",new Uint8Array(256*192).fill(1));
    expect(black.every(pixel=>pixel===0)).toBe(true);
    expect(white.every(pixel=>pixel===1)).toBe(true);
  });
  it("keeps guide-confirmed near-endpoint regions solid",()=>{
    const nearBlack=fixture(()=>[8,0,0]);
    const nearRed=fixture(()=>[247,0,0]);
    const blackGuide=new Uint8Array(256*192);
    const redGuide=new Uint8Array(256*192).fill(1);
    const attributes=new Uint8Array(768).fill(2);
    expect(renderArtisticOrdered(nearBlack,attributes,8,38,"checkerboard",blackGuide).every(pixel=>pixel===0)).toBe(true);
    expect(renderArtisticOrdered(nearRed,attributes,8,38,"checkerboard",redGuide).every(pixel=>pixel===1)).toBe(true);
  });
  it("reconstructs guide tone without retaining its Bayer phase",()=>{
    const gray=fixture(()=>[128,128,128]);
    const first=new Uint8Array(256*192);
    const second=new Uint8Array(256*192);
    for(let y=0;y<192;y++) for(let x=0;x<256;x++) {
      first[y*256+x]=((x+y)&1)===0?1:0;
      second[y*256+x]=((x+y)&1)===0?0:1;
    }
    const a=renderArtisticOrdered(gray,new Uint8Array(768).fill(71),8,100,"checkerboard",first);
    const b=renderArtisticOrdered(gray,new Uint8Array(768).fill(71),8,100,"checkerboard",second);
    for(let y=2;y<190;y++) for(let x=2;x<254;x++) expect(a[y*256+x]).toBe(b[y*256+x]);
  });
  it.each([2, 4] as const)("uses a continuous Bayer area envelope for the %ix%i guide", (period) => {
    const gray = fixture(() => [160, 160, 160]);
    const guide = new Uint8Array(256 * 192);
    const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < 192; y++) for (let x = 0; x < 256; x++) {
      const threshold = matrix[(y & 3) * 4 + (x & 3)]! / 16;
      guide[y * 256 + x] = 0.5 > threshold ? 1 : 0;
    }
    const rendered = renderArtisticPairField(
      gray, 256, 192, 100, "checkerboard",
      () => ({ first: black, second: white, firstValue: 0, secondValue: 1, coverage: 0.5 }),
      false, guide, period,
    );
    for (const x of [7, 8, 15, 16]) {
      const left = rendered.slice(x - 1, x + 1).reduce((sum, bit) => sum + bit, 0);
      const right = rendered.slice(x + 1, x + 3).reduce((sum, bit) => sum + bit, 0);
      expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
    }
    for (let top = 0; top < 192; top += 8) for (let left = 0; left < 256; left += 8) {
      let count = 0;
      for (let y = top; y < top + 8; y++) for (let x = left; x < left + 8; x++) count += rendered[y * 256 + x]!;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(64);
    }
  });
  it("uses Bayer 4×4's Halo pairs and preserves rendered tone",()=>{
    const artistic=convertToZx(source,256,192,{...base,ditheringAmount:33},"high");
    const bayer=convertToZx(source,256,192,{
      ...base, ditheringAmount:33, ditherEngineId:"ordered-strict-matrix-v6",
      orderedMatrix:"bayer-4x4",
    },"high");
    expect(artistic.attributes).toEqual(bayer.attributes);
    expect(Math.abs(meanLuma(artistic.previewRgba)-meanLuma(bayer.previewRgba))).toBeLessThanOrEqual(0.065);
    for(let y=0;y<=176;y+=8) for(let x=0;x<=240;x+=8) {
      expect(Math.abs(meanLuma(artistic.previewRgba,x,y,16,16)-meanLuma(bayer.previewRgba,x,y,16,16))).toBeLessThanOrEqual(1/16);
    }
  });
  it("keeps Bayer density across the supported color and level matrix",()=>{
    for(const saturation of [0,-100]) for(const ditheringAmount of [23,30,31,33]) {
      const settings={...base,saturation,gamma:110,ditheringAmount};
      const artistic=convertToZx(source,256,192,settings,"high");
      const bayer=convertToZx(source,256,192,{...settings,ditherEngineId:"ordered-strict-matrix-v6",orderedMatrix:"bayer-4x4"},"high");
      expect(artistic.attributes).toEqual(bayer.attributes);
      expect(Math.abs(meanLuma(artistic.previewRgba)-meanLuma(bayer.previewRgba))).toBeLessThanOrEqual(0.065);
    }
  });
  it("does not introduce an 8×8 density step in a shallow gradient",()=>{
    const shallow=fixture((x)=>{
      const value=104+Math.floor(x/8)*3;
      return [value,value,value];
    });
    const settings={...base,ditheringAmount:23,paletteSelections:[{screenIndex:0,enabledColorIds:[0,7],brightMode:"on" as const}]};
    const artistic=convertToZx(shallow,256,192,settings,"high");
    const bayer=convertToZx(shallow,256,192,{...settings,ditherEngineId:"ordered-strict-matrix-v6",orderedMatrix:"bayer-4x4"},"high");
    expect(artistic.attributes).toEqual(bayer.attributes);
    let placementDifferences=0;
    for(let y=0;y<=176;y+=8) for(let x=0;x<=240;x+=8) {
      for(let yy=y;yy<y+16;yy++) for(let xx=x;xx<x+16;xx++) {
        const index=yy*256+xx;
        placementDifferences+=artistic.pixels[index]!==bayer.pixels[index]?1:0;
      }
      expect(Math.abs(meanLuma(artistic.previewRgba,x,y,16,16)-meanLuma(bayer.previewRgba,x,y,16,16))).toBeLessThanOrEqual(1/16);
    }
    expect(placementDifferences).toBeGreaterThan(128);
  });
  it.each([1,2,4,8] as const)("cannot fill an intermediate 8×%i tile through calibration",(cellHeight)=>{
    const gray=fixture(()=>[188,188,188]);
    const pixels=renderArtisticOrdered(gray,new Uint8Array(32*(192/cellHeight)).fill(71),cellHeight,100,"checkerboard");
    for(let top=0;top<192;top+=cellHeight) for(let left=0;left<256;left+=8) {
      let count=0;
      for(let y=top;y<top+cellHeight;y++) for(let x=left;x<left+8;x++) count+=pixels[y*256+x]!;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(8*cellHeight);
    }
  });
  it("canonicalizes reversed pairs without reversing the visible phase",()=>{
    const gray=fixture(()=>[188,188,188]);
    const forward=renderArtisticPairField(gray,256,192,100,"checkerboard",()=>({first:black,second:white,firstValue:0,secondValue:1,coverage:0.5}));
    const reverse=renderArtisticPairField(gray,256,192,100,"checkerboard",()=>({first:white,second:black,firstValue:1,secondValue:0,coverage:0.5}));
    expect(reverse).toEqual(forward);
  });
  it("does not add Artistic pixels on the dark side of a confirmed contour",()=>{
    const width=64,height=32;
    const edge=new Uint8Array(width*height*4);
    const reference=new Uint8Array(width*height);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const boundary=20+Math.floor(y/4);
      const red=x<boundary?12:x===boundary?112:255;
      edge.set([red,0,0,255],(y*width+x)*4);
      reference[y*width+x]=x>boundary?1:0;
    }
    const rendered=renderArtisticPairField(edge,width,height,100,"checkerboard",(x,y)=>{
      const red=edge[(y*width+x)*4]!;
      return {first:black,second:{r:255,g:0,b:0},firstValue:0,secondValue:1,coverage:red/255};
    },false,reference);
    for(let y=0;y<height;y++) {
      const boundary=20+Math.floor(y/4);
      for(let x=Math.max(0,boundary-2);x<=Math.min(width-1,boundary+2);x++) {
        expect(rendered[y*width+x]).toBe(reference[y*width+x]);
      }
    }
  });
  it("rejects unsupported engines/targets and leaves production defaults alone",()=>{
    expect(isCompatibleEnginePair("zx-guide-reference-halo-v1",base.ditherEngineId)).toBe(true);
    expect(isCompatibleEnginePair("zx-block-dbs-global-v1",base.ditherEngineId)).toBe(false);
    expect(()=>assertCompatibleEngines("pmd-85","pmd85-cell-v1",base.ditherEngineId)).not.toThrow();
    expect(()=>assertCompatibleEngines("sinclair-ql",base.attributeOptimizerId,base.ditherEngineId)).not.toThrow();
    expect(() => convertToZx(source,256,192,{...base,modeId:"zx48-mixed-256x192",paletteSelections:[{screenIndex:0,enabledColorIds:[0,7],brightMode:"off"},{screenIndex:1,enabledColorIds:[0,7],brightMode:"off"}]})).not.toThrow();
    expect(()=>convertToZx(source,256,192,{...base,modeId:"zx48-vertical-spatial-256x192"})).toThrow(/standard or mixed/);
    expect(DITHER_ENGINES.find(e=>e.id===base.ditherEngineId)?.lifecycle).toBe("experimental");
    expect(DEFAULT_CONVERSION_SETTINGS.ditherEngineId).not.toBe(base.ditherEngineId);
  });
});
