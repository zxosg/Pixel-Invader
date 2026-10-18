import type { OrderedMatrix } from "@retro-converter/conversion-core";

export interface BitmapStipplePatternChoice {
  readonly id: string;
  readonly label: string;
  readonly matrix: OrderedMatrix;
}

interface BitmapEditorStipplePickerProps {
  readonly choices: readonly BitmapStipplePatternChoice[];
  readonly selectedId: string;
  readonly density: number;
  readonly onSelect: (id: string) => void;
  readonly onDensityChange: (density: number) => void;
  readonly disabled?: boolean;
}

function MatrixPreview({
  matrix,
  density,
  width = matrix.width,
  height = matrix.height,
  label,
}: {
  readonly matrix: OrderedMatrix;
  readonly density: number;
  readonly width?: number;
  readonly height?: number;
  readonly label: string;
}) {
  const cells = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const rank = matrix.values[(y % matrix.height) * matrix.width + (x % matrix.width)] ?? 0;
    return (rank + 0.5) / matrix.levels * 100 < density;
  });

  return (
    <div
      className="bitmap-editor-stipple-matrix"
      style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${height}, minmax(0, 1fr))` }}
      role="img"
      aria-label={label}
    >
      {cells.map((on, index) => <i className={on ? "on" : ""} key={index} />)}
    </div>
  );
}

export function BitmapEditorStipplePicker({
  choices,
  selectedId,
  density,
  onSelect,
  onDensityChange,
  disabled = false,
}: BitmapEditorStipplePickerProps) {
  const selected = choices.find(({ id }) => id === selectedId) ?? choices[0];
  if (selected === undefined) return null;

  return (
    <div className="bitmap-editor-stipple-picker">
      <label className="bitmap-editor-stipple-matrix-select">
        <span>Ordered matrix</span>
        <select value={selected.id} onChange={(event) => onSelect(event.target.value)} disabled={disabled} aria-label="Ordered dithering matrix">
          {choices.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
        </select>
      </label>
      <div className="bitmap-editor-stipple-previews" aria-label="Stipple previews">
        <div className="bitmap-editor-stipple-preview">
          <span>Selected matrix · {selected.matrix.width}×{selected.matrix.height}</span>
          <MatrixPreview matrix={selected.matrix} density={density} label={`${selected.label} threshold preview`} />
        </div>
        <div className="bitmap-editor-stipple-preview">
          <span>Stipple pattern · 8×8</span>
          <MatrixPreview matrix={selected.matrix} density={density} width={8} height={8} label={`8 by 8 stipple pattern at ${density}%`} />
        </div>
      </div>
      <label className="bitmap-editor-stipple-density">
        <span>Pattern density</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={density}
          onChange={(event) => onDensityChange(Number(event.target.value))}
          disabled={disabled}
          aria-label="Stipple pattern density"
          aria-valuetext={`${density}%`}
        />
        <output>{density}%</output>
      </label>
    </div>
  );
}
