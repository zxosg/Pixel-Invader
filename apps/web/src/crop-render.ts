import { type WorkerDecodedImage } from "./worker/client.js";
import { type Rotation } from "@retro-converter/conversion-core";
import { orientedSourceSize } from "./crop.js";

export function drawOrientedCropSource(
  context: CanvasRenderingContext2D,
  image: WorkerDecodedImage,
  rotation: Rotation,
  mirrorHorizontal: boolean,
  mirrorVertical: boolean,
): void {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (sourceContext === null) return;
  const pixels = new Uint8ClampedArray(Uint8Array.from(image.rgba).buffer);
  sourceContext.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);

  const mirroredCanvas = document.createElement("canvas");
  mirroredCanvas.width = image.width;
  mirroredCanvas.height = image.height;
  const mirroredContext = mirroredCanvas.getContext("2d");
  if (mirroredContext === null) return;
  mirroredContext.translate(
    mirrorHorizontal ? image.width : 0,
    mirrorVertical ? image.height : 0,
  );
  mirroredContext.scale(mirrorHorizontal ? -1 : 1, mirrorVertical ? -1 : 1);
  mirroredContext.drawImage(sourceCanvas, 0, 0);

  const oriented = orientedSourceSize(image.width, image.height, rotation);
  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = oriented.width;
  rotatedCanvas.height = oriented.height;
  const rotatedContext = rotatedCanvas.getContext("2d");
  if (rotatedContext === null) return;
  if (rotation === 90) {
    rotatedContext.translate(oriented.width, 0);
    rotatedContext.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    rotatedContext.translate(oriented.width, oriented.height);
    rotatedContext.rotate(Math.PI);
  } else if (rotation === 270) {
    rotatedContext.translate(0, oriented.height);
    rotatedContext.rotate(-Math.PI / 2);
  }
  rotatedContext.drawImage(mirroredCanvas, 0, 0);
  context.drawImage(rotatedCanvas, 0, 0);
}
