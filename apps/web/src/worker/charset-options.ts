import type {
  CharsetConversionOptions,
} from "@retro-converter/zx-charset";
import type {
  ConvertCharsetRequest,
} from "./protocol";

export function restoreCharsetConversionOptions(
  options: ConvertCharsetRequest["options"],
): CharsetConversionOptions {
  return {
    source: options.source,
    characterBudget: options.characterBudget,
    encoding: options.encoding,
    allowTransforms: options.allowTransforms,
    allowPolarity: options.allowPolarity,
    derivedStrategy: options.derivedStrategy,
    distanceMetric: options.distanceMetric,
    visualWeighting: options.visualWeighting,
    ...(options.swapRefinementPasses === undefined
      ? {}
      : { swapRefinementPasses: options.swapRefinementPasses }),
    ...(options.existingCharsetRange === undefined
      ? {}
      : { existingCharsetRange: options.existingCharsetRange }),
    ...(options.existingCharsetSelection === undefined
      ? {}
      : { existingCharsetSelection: options.existingCharsetSelection }),
    ...(options.existingCharset === undefined
      ? {}
      : { existingCharset: new Uint8Array(options.existingCharset) }),
  };
}
