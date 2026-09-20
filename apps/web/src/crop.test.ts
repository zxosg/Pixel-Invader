import { describe, expect, it } from "vitest";
import {
  clampPixelCrop,
  cropResizeHandleAtPoint,
  fitCropPreviewFrame,
  moveCropFromDrag,
  orientedSourceSize,
  pointIsInsideCrop,
  resizeCropFromDrag,
  resizeCropToAspect,
  selectionFromDrag,
} from "./crop.js";

describe("crop helpers", () => {
  it("clamps pixel coordinates to the source bounds", () => {
    expect(clampPixelCrop(
      { x: 620, y: 470, width: 100, height: 100 },
      { width: 640, height: 480 },
    )).toEqual({ x: 620, y: 470, width: 20, height: 10 });
  });

  it("uses oriented dimensions after quarter turns", () => {
    expect(orientedSourceSize(640, 480, 90)).toEqual({ width: 480, height: 640 });
    expect(orientedSourceSize(640, 480, 180)).toEqual({ width: 640, height: 480 });
  });

  it("fits a source into the 256 by 192 crop editor", () => {
    expect(fitCropPreviewFrame(
      { width: 640, height: 360 },
      { width: 256, height: 192 },
    )).toEqual({
      x: 0, y: 24, width: 256, height: 144,
    });
  });

  it.each([
    [{ width: 256, height: 192 }, { x: 32, y: 0, width: 192, height: 192 }],
    [{ width: 256, height: 256 }, { x: 0, y: 0, width: 256, height: 256 }],
    [{ width: 512, height: 256 }, { x: 128, y: 0, width: 256, height: 256 }],
    [{ width: 288, height: 256 }, { x: 16, y: 0, width: 256, height: 256 }],
  ] as const)("fits a square source into destination %o", (destination, expected) => {
    expect(fitCropPreviewFrame({ width: 1000, height: 1000 }, destination)).toEqual(expected);
  });

  it("maintains destination aspect ratio while dragging", () => {
    expect(selectionFromDrag(
      { x: 10, y: 20 },
      { x: 210, y: 170 },
      { width: 640, height: 480 },
      "destination",
      { width: 256, height: 192 },
    )).toEqual({ x: 10, y: 20, width: 200, height: 150 });
  });

  it("maintains source aspect ratio during manual width changes", () => {
    expect(resizeCropToAspect(
      { x: 10, y: 20, width: 320, height: 10 },
      { width: 640, height: 480 },
      "source",
      "width",
      { width: 256, height: 192 },
    )).toEqual({ x: 10, y: 20, width: 320, height: 240 });
  });

  it("moves a selected crop without changing its size", () => {
    expect(moveCropFromDrag(
      { x: 20, y: 30, width: 100, height: 80 },
      { x: 50, y: 60 },
      { x: 90, y: 100 },
      { width: 256, height: 192 },
    )).toEqual({ x: 60, y: 70, width: 100, height: 80 });
  });

  it("moves a selected crop by one source pixel for keyboard steps", () => {
    expect(moveCropFromDrag(
      { x: 20, y: 30, width: 100, height: 80 },
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { width: 256, height: 192 },
    )).toEqual({ x: 19, y: 30, width: 100, height: 80 });
  });

  it("clamps a moved crop to the source bounds", () => {
    expect(moveCropFromDrag(
      { x: 20, y: 30, width: 100, height: 80 },
      { x: 50, y: 60 },
      { x: 500, y: 500 },
      { width: 256, height: 192 },
    )).toEqual({ x: 156, y: 112, width: 100, height: 80 });
  });

  it("uses the active destination ratio for destination-locked crops", () => {
    expect(resizeCropToAspect(
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 1000, height: 1000 },
      "destination",
      "width",
      { width: 512, height: 256 },
    )).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("detects corner and side resize handles", () => {
    const crop = { x: 100, y: 80, width: 300, height: 200 };
    expect(cropResizeHandleAtPoint({ x: 101, y: 81 }, crop, 4)).toBe("nw");
    expect(cropResizeHandleAtPoint({ x: 400, y: 180 }, crop, 4)).toBe("e");
    expect(cropResizeHandleAtPoint({ x: 250, y: 280 }, crop, 4)).toBe("s");
    expect(cropResizeHandleAtPoint({ x: 250, y: 180 }, crop, 4)).toBeNull();
  });

  it("resizes a corner while preserving the destination aspect ratio", () => {
    expect(resizeCropFromDrag(
      { x: 100, y: 100, width: 300, height: 300 },
      { x: 700, y: 600 },
      { width: 1000, height: 1000 },
      "destination",
      "se",
      { width: 512, height: 256 },
    )).toEqual({ x: 100, y: 100, width: 600, height: 300 });
  });

  it("resizes a side while preserving the destination aspect ratio", () => {
    expect(resizeCropFromDrag(
      { x: 100, y: 200, width: 200, height: 200 },
      { x: 700, y: 300 },
      { width: 1000, height: 1000 },
      "destination",
      "e",
      { width: 512, height: 256 },
    )).toEqual({ x: 100, y: 150, width: 600, height: 300 });
  });

  it("resizes freely when aspect locking is disabled", () => {
    expect(resizeCropFromDrag(
      { x: 100, y: 100, width: 300, height: 300 },
      { x: 700, y: 600 },
      { width: 1000, height: 1000 },
      "none",
      "se",
      { width: 256, height: 192 },
    )).toEqual({ x: 100, y: 100, width: 600, height: 500 });
  });

  it("rejects invalid destination dimensions", () => {
    expect(() => fitCropPreviewFrame(
      { width: 100, height: 100 },
      { width: 0, height: 192 },
    )).toThrow(RangeError);
    expect(() => resizeCropToAspect(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 100, height: 100 },
      "none",
      "width",
      { width: 256, height: 0 },
    )).toThrow(RangeError);
  });

  it("hit-tests the crop using inclusive top-left and exclusive bottom-right edges", () => {
    const crop = { x: 20, y: 30, width: 100, height: 80 };
    expect(pointIsInsideCrop({ x: 20, y: 30 }, crop)).toBe(true);
    expect(pointIsInsideCrop({ x: 119, y: 109 }, crop)).toBe(true);
    expect(pointIsInsideCrop({ x: 120, y: 109 }, crop)).toBe(false);
    expect(pointIsInsideCrop({ x: 119, y: 110 }, crop)).toBe(false);
  });
});
