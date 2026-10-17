import type { OrderedMatrix } from "@retro-converter/conversion-core";

export interface BitmapStipplePatternChoice {
  readonly id: string;
  readonly label: string;
  readonly matrix: OrderedMatrix;
}

interface BitmapEditorStipplePickerProps {
  readonly choices: readonly BitmapStipplePatternChoice[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly disabled?: boolean;
}

function BitmapStippleTile({
  matrix,
  className = "",
}: {
  readonly matrix: OrderedMatrix;
  readonly className?: string;
}) {
  return (
    <span
      className={`bitmap-stipple-tile ${className}`}
      style={{
        gridTemplateColumns: `repeat(${matrix.width}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${matrix.height}, minmax(0, 1fr))`,
      }}
      aria-hidden="true"
    >
      {matrix.values.map((rank, index) => (
        <i className={(rank + 0.5) / matrix.levels < 0.5 ? "on" : ""} key={index} />
      ))}
    </span>
  );
}

export function BitmapEditorStipplePicker({
  choices,
  selectedId,
  onSelect,
  disabled = false,
}: BitmapEditorStipplePickerProps) {
  const selected = choices.find(({ id }) => id === selectedId) ?? choices[0];
  if (selected === undefined) return null;

  return (
    <details className="bitmap-editor-stipple-picker" data-disabled={disabled || undefined}>
      <summary
        aria-label={`Stipple pattern: ${selected.label}`}
        aria-disabled={disabled}
        onClick={(event) => { if (disabled) event.preventDefault(); }}
      >
        <BitmapStippleTile matrix={selected.matrix} className="selected-tile" />
        <span className="bitmap-editor-stipple-selected-label">{selected.label}</span>
        <span className="bitmap-editor-stipple-coverage">50%</span>
        <span className="bitmap-editor-stipple-chevron" aria-hidden="true">▾</span>
      </summary>
      {!disabled ? (
        <div className="bitmap-editor-stipple-menu" role="group" aria-label="Available stipple tiles">
          {choices.map(({ id, label, matrix }) => (
            <button
              className="bitmap-editor-stipple-choice"
              type="button"
              key={id}
              title={`${label} · 50% pattern`}
              aria-label={`${label} stipple pattern`}
              aria-pressed={id === selectedId}
              onClick={(event) => {
                onSelect(id);
                const details = event.currentTarget.closest("details");
                if (details !== null) details.open = false;
              }}
            >
              <BitmapStippleTile matrix={matrix} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </details>
  );
}
