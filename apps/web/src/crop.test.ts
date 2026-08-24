import { describe, expect, it } from "vitest";
import {
  clampPixelCrop,
  fitCropPreviewFrame,
  moveCropFromDrag,
  orientedSourceSize,
  pointIsInsideCrop,
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
    expect(fitCropPreviewFrame({ width: 640, height: 360 })).toEqual({
      x: 0, y: 24, width: 256, height: 144,
    });
  });

  it("maintains destination aspect ratio while dragging", () => {
    expect(selectionFromDrag(
      { x: 10, y: 20 },
      { x: 210, y: 170 },
      { width: 640, height: 480 },
      "destination",
    )).toEqual({ x: 10, y: 20, width: 200, height: 150 });
  });

  it("maintains source aspect ratio during manual width changes", () => {
    expect(resizeCropToAspect(
      { x: 10, y: 20, width: 320, height: 10 },
      { width: 640, height: 480 },
      "source",
      "width",
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

  it("hit-tests the crop using inclusive top-left and exclusive bottom-right edges", () => {
    const crop = { x: 20, y: 30, width: 100, height: 80 };
    expect(pointIsInsideCrop({ x: 20, y: 30 }, crop)).toBe(true);
    expect(pointIsInsideCrop({ x: 119, y: 109 }, crop)).toBe(true);
    expect(pointIsInsideCrop({ x: 120, y: 109 }, crop)).toBe(false);
    expect(pointIsInsideCrop({ x: 119, y: 110 }, crop)).toBe(false);
  });
});
