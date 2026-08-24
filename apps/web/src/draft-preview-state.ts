export type RetainedDraftState<Result> =
  | { readonly kind: "idle" }
  | { readonly kind: "scheduled"; readonly retainedResult: Result | null }
  | { readonly kind: "running"; readonly retainedResult: Result | null }
  | { readonly kind: "ready"; readonly result: Result }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly retainedResult: Result | null;
    };

export function draftPreviewResult<Result>(
  state: RetainedDraftState<Result>,
): Result | null {
  if (state.kind === "ready") return state.result;
  if (
    state.kind === "scheduled" ||
    state.kind === "running" ||
    state.kind === "error"
  ) {
    return state.retainedResult;
  }
  return null;
}
