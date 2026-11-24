import { useEffect, useState } from "react";

export const BITMAP_EDITOR_SEGMENTED_CLASSES = {
  control: "bitmap-editor-segment-control",
  label: "bitmap-editor-segment-label",
  indicator: "bitmap-editor-segment-indicator",
} as const;
export interface RangeNumberControlProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
  readonly resetValue?: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
  readonly onValidityChange: (id: string, valid: boolean) => void;
}

export function RangeNumberControl({
  id,
  label,
  value,
  min,
  max,
  unit = "",
  resetValue,
  disabled = false,
  onChange,
  onValidityChange,
}: RangeNumberControlProps) {
  const [entry, setEntry] = useState(String(value));
  const parsed = Number(entry);
  const valid = /^-?\d+$/.test(entry) && Number.isInteger(parsed) &&
    parsed >= min && parsed <= max;
  useEffect(() => setEntry(String(value)), [value]);
  useEffect(() => {
    onValidityChange(id, valid || disabled);
    return () => onValidityChange(id, true);
  }, [disabled, id, onValidityChange, valid]);
  const commit = () => {
    if (entry.trim() === "" || !Number.isFinite(parsed)) {
      setEntry(String(value));
      onValidityChange(id, true);
      return;
    }
    const next = Math.max(min, Math.min(max, Math.round(parsed)));
    setEntry(String(next));
    onChange(next);
    onValidityChange(id, true);
  };
  const inputs = (
    <>
      <span className="filter-inputs">
        <input
          aria-label={`${label} slider`}
          type="range"
          min={min}
          max={max}
          step="1"
          value={value}
          disabled={disabled}
          onInput={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span className="range-number-entry">
          <input
            aria-label={`${label} value`}
            className={valid ? undefined : "invalid"}
            type="number"
            min={min}
            max={max}
            step="1"
            value={entry}
            disabled={disabled}
            aria-invalid={!valid}
            onChange={(event) => {
              const nextEntry = event.target.value;
              setEntry(nextEntry);
              const next = Number(nextEntry);
              if (
                /^-?\d+$/.test(nextEntry) &&
                Number.isInteger(next) &&
                next >= min &&
                next <= max
              ) onChange(next);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
                event.currentTarget.blur();
              }
            }}
          />
          {unit ? <span className="range-unit" aria-hidden="true">{unit}</span> : null}
        </span>
      </span>
      {valid || disabled ? null : (
        <span className="field-error">Invalid value</span>
      )}
    </>
  );
  if (resetValue === undefined) {
    return <label><span>{label}</span>{inputs}</label>;
  }
  return (
    <div className="range-number-control">
      <button
        className="range-number-label"
        type="button"
        disabled={disabled}
        title={`Reset ${label}`}
        aria-label={`Reset ${label} to ${resetValue}${unit}`}
        onClick={() => {
          setEntry(String(resetValue));
          onChange(resetValue);
          onValidityChange(id, true);
        }}
      >{label}</button>
      {inputs}
    </div>
  );
}
