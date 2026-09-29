import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  DEFAULT_CONVERSION_SETTINGS,
  resolveZxPalette,
  type RgbColor,
  type ZxPaletteDefinition,
} from "@retro-converter/conversion-core";
import { ZX_BASE_COLORS } from "./inspection.js";

interface ZxPaletteEditorDialogProps {
  readonly definition: ZxPaletteDefinition;
  readonly onChange: (definition: ZxPaletteDefinition) => void;
  readonly onClose: () => void;
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): RgbColor {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function ZxPaletteEditorDialog({ definition, onChange, onClose }: ZxPaletteEditorDialogProps) {
  const palette = resolveZxPalette(definition);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const palettePlanesMatch = palette.normal.every((color, index) => {
    const bright = palette.bright[index];
    return bright !== undefined && color.r === bright.r && color.g === bright.g && color.b === bright.b;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="zx-palette-editor-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="zx-palette-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zx-palette-editor-title"
        onKeyDown={handleKeyDown}
      >
        <header className="zx-palette-editor-header">
          <div>
            <h2 id="zx-palette-editor-title">Palette editor</h2>
            <p>Changes apply immediately and are retained when this window closes.</p>
          </div>
          <button
            ref={closeButtonRef}
            className="secondary compact"
            type="button"
            aria-label="Close Palette editor"
            onClick={onClose}
          >×</button>
        </header>
        <div className="zx-palette-editor-content">
          <label>
            <span>Palette model</span>
            <select
              value={definition.kind}
              onChange={(event) => {
                if (event.target.value === "explicit") {
                  onChange({
                    kind: "explicit",
                    normal: palette.normal.map((color) => ({ ...color })),
                    bright: palette.bright.map((color) => ({ ...color })),
                  });
                } else {
                  onChange(DEFAULT_CONVERSION_SETTINGS.zxPalette);
                }
              }}
            >
              <option value="channel-drive-ramp-v1">Channel-drive ramp</option>
              <option value="explicit">Explicit RGB colors</option>
            </select>
          </label>
          <div className="zx-palette-calibration-actions">
            <button
              className="secondary compact"
              type="button"
              onClick={() => onChange(DEFAULT_CONVERSION_SETTINGS.zxPalette)}
            >Reset palette</button>
            {palettePlanesMatch ? <span role="status">Normal and BRIGHT colors are identical.</span> : null}
          </div>
          {definition.kind === "channel-drive-ramp-v1" ? (
            <div className="zx-palette-ramp-grid">
              {(["normal", "bright"] as const).map((plane) => (
                <fieldset key={plane}>
                  <legend>{plane === "normal" ? "Normal" : "BRIGHT"} channel levels</legend>
                  {(["singleChannel", "doubleChannel", "tripleChannel"] as const).map((key, index) => (
                    <label key={key}>
                      <span>{["Single-channel", "Double-channel", "Triple-channel"][index]}</span>
                      <input
                        type="number"
                        min={0}
                        max={255}
                        step={1}
                        value={definition[plane][key]}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isInteger(value) || value < 0 || value > 255) return;
                          onChange(definition.kind !== "channel-drive-ramp-v1"
                            ? definition
                            : { ...definition, [plane]: { ...definition[plane], [key]: value } });
                        }}
                      />
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          ) : (
            <div className="zx-palette-explicit-grid">
              {ZX_BASE_COLORS.map((color) => (
                <div className="zx-palette-explicit-row" key={color.code}>
                  <span>{color.code} · {color.name}</span>
                  {(["normal", "bright"] as const).map((plane) => (
                    <label key={plane}>
                      <span className="visually-hidden">{color.name} {plane} RGB</span>
                      <input
                        type="color"
                        value={rgbToHex(palette[plane][color.code]!)}
                        aria-label={`${color.name} ${plane} RGB`}
                        onChange={(event) => {
                          const nextColor = hexToRgb(event.target.value);
                          const values = palette[plane].map((item) => ({ ...item }));
                          values[color.code] = nextColor;
                          onChange({
                            kind: "explicit",
                            normal: plane === "normal" ? values : palette.normal.map((item) => ({ ...item })),
                            bright: plane === "bright" ? values : palette.bright.map((item) => ({ ...item })),
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="control-help">
            {definition.kind === "channel-drive-ramp-v1"
              ? "Each active RGB channel receives the level for its one-, two-, or three-channel color. Set BRIGHT levels equal to Normal to collapse the two color planes."
              : "Set each ZX color independently. Color values are used by conversion and exact output previews."}
          </p>
        </div>
      </section>
    </div>
  );
}
