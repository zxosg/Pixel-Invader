export type ImageImportErrorCode =
  | "IMAGE_UNSUPPORTED_FORMAT"
  | "IMAGE_INVALID_DATA"
  | "IMAGE_LIMIT_EXCEEDED"
  | "IMAGE_ANIMATION_UNSUPPORTED"
  | "IMAGE_COLOR_PROFILE_UNSUPPORTED"
  | "IMAGE_COLOR_MODEL_UNSUPPORTED"
  | "IMAGE_DECODE_FAILED";

export class ImageImportError extends Error {
  readonly code: ImageImportErrorCode;

  constructor(code: ImageImportErrorCode, message: string) {
    super(message);
    this.name = "ImageImportError";
    this.code = code;
  }
}
