import { useEffect } from "react";
import { useAppState } from "../app-state.js";

export type CompareMode = "side-by-side" | "swipe" | "result-only" | "difference";

const MODES: ReadonlyArray<{ readonly id: CompareMode; readonly label: string }> = [
  { id: "side-by-side", label: "Side by side" },
  { id: "swipe", label: "Swipe" },
  { id: "result-only", label: "Result only" },
  { id: "difference", label: "Difference" },
];

export function CompareModeBar({ mode, onModeChange, swipe, onSwipeChange }: {
  readonly mode: CompareMode;
  readonly onModeChange: (mode: CompareMode) => void;
  readonly swipe: number;
  readonly onSwipeChange: (value: number) => void;
}) {
  const { resultPreviewContent, setResultPreviewContent, synchronizeZoom, setSynchronizeZoom } = useAppState();

  useEffect(() => {
    if (mode === "difference") {
      if (resultPreviewContent !== "difference") setResultPreviewContent("difference");
    } else if (resultPreviewContent === "difference") {
      setResultPreviewContent("image");
    }
    // Linked zoom is the default in the guided layout; stay linked while comparing.
    if (!synchronizeZoom) setSynchronizeZoom(true);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="compare-mode-bar">
      <div role="radiogroup" aria-label="Compare mode" className="compare-mode-segments">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            className={`compare-mode-segment${mode === id ? " active" : ""}`}
            onClick={() => onModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "swipe" ? (
        <label className="compare-swipe">
          <span>Swipe</span>
          <input type="range" min={0} max={100} value={swipe} aria-label="Swipe position" onChange={(event) => onSwipeChange(Number(event.target.value))} />
          <span className="compare-swipe-value">{swipe}%</span>
        </label>
      ) : null}
      <label className="compare-linked">
        <input type="checkbox" checked={synchronizeZoom} onChange={(event) => setSynchronizeZoom(event.target.checked)} />
        <span>Linked zoom</span>
      </label>
    </div>
  );
}
