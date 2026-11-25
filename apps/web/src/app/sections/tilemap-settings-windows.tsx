import { useAppState } from "../app-state.js";
import { ATTRIBUTE_OPTIMIZERS, DITHER_ENGINES } from "@retro-converter/conversion-core";
import { type CharsetDistanceMetric, type CharsetEncoding, type CharsetSource, type DerivedCharsetStrategy } from "@retro-converter/zx-charset";
import { clampCharsetRange } from "../../specscii-assets.js";

export function TilemapSettingsWindows() {
  const s = useAppState();
  const {
    adjustWorkbenchFloatingSize,
    attributeOptimizerId,
    availableExistingCharsetCount,
    bringWorkbenchWindowToFront,
    builtInSpecsciiFontError,
    charsetAllowPolarity,
    charsetAllowTransforms,
    charsetBudget,
    charsetDistance,
    charsetEncoding,
    charsetRangeEntriesValid,
    charsetSource,
    charsetState,
    charsetStrategy,
    charsetVisualWeighting,
    commitCharsetLengthEntry,
    commitCharsetStartEntry,
    ditherEngineId,
    existingActiveCharacterCount,
    existingCharset,
    existingCharsetLength,
    existingCharsetLengthEntry,
    existingCharsetName,
    existingCharsetSelection,
    existingCharsetStart,
    existingCharsetStartEntry,
    handleWorkbenchTitlebarClick,
    handleWorkbenchTitlebarKeyDown,
    importExistingCharset,
    invalidateCharset,
    markCharsetSelectionChanged,
    paletteSelections,
    setCharsetAllowPolarity,
    setCharsetAllowTransforms,
    setCharsetBudget,
    setCharsetDistance,
    setCharsetEncoding,
    setCharsetSelectionMode,
    setCharsetSource,
    setCharsetStrategy,
    setCharsetTilesView,
    setCharsetVisualWeighting,
    setExistingCharsetLength,
    setExistingCharsetLengthEntry,
    setExistingCharsetStart,
    setExistingCharsetStartEntry,
    setSelectedSourceCharsetTile,
    setTilemapStale,
    setWorkbenchTilemapFloatingX,
    setWorkbenchTilemapFloatingY,
    setWorkbenchWindowOpen,
    settingsSection,
    startWorkbenchFloatingResize,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchPortal,
    workbenchTilemapFloating,
    workbenchTilemapFloatingAutoHeight,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
  } = s;
  return (
    <>
    {workbenchPortal("tilemap", (
    <details
      className={`workbench-settings-section workbench-window${workbenchTilemapFloating ? ` workbench-section-floating workbench-tilemap-floating${workbenchTilemapFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
      {...workbenchWindowDragAttributes("tilemap")}
      data-workbench-window="tilemap"
      hidden={!workbenchWindowLayout("tilemap").visible}
      data-dock={workbenchWindowLayout("tilemap").dock}
      data-minimized={workbenchWindowLayout("tilemap").minimized ? "true" : "false"}
      open={workbenchWindowLayout("tilemap").open && !workbenchWindowLayout("tilemap").minimized}
      style={workbenchDockWindowStyle("tilemap", workbenchTilemapFloating ? { zIndex: workbenchWindowZIndex("tilemap") } : undefined)}
      onPointerDown={(event) => {
        if (workbenchTilemapFloating) {
          event.stopPropagation();
          bringWorkbenchWindowToFront("tilemap");
        }
      }}
      onFocusCapture={() => {
        if (workbenchTilemapFloating) bringWorkbenchWindowToFront("tilemap");
      }}
      onToggle={(event) => setWorkbenchWindowOpen("tilemap", event.currentTarget.open)}
    >
      <summary
        onPointerDown={(event) => {
          startWorkbenchTitlebarDrag("tilemap", event);
        }}
        onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("tilemap", event)}
        onClick={(event) => handleWorkbenchTitlebarClick("tilemap", event)}
      >
        <span>Tilemap</span>
        {workbenchWindowActions("tilemap")}
        {workbenchTilemapFloating ? (
          <span
            className="workbench-window-drag-handle"
            role="button"
            tabIndex={0}
            aria-label="Move Tilemap window"
            title="Drag to move Tilemap"
            onPointerDown={(event) => startWorkbenchSectionDrag("tilemap", event)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 32 : 8;
              if (event.key === "ArrowLeft") setWorkbenchTilemapFloatingX((x) => Math.max(8, x - step));
              if (event.key === "ArrowRight") setWorkbenchTilemapFloatingX((x) => x + step);
              if (event.key === "ArrowUp") setWorkbenchTilemapFloatingY((y) => Math.max(8, y - step));
              if (event.key === "ArrowDown") setWorkbenchTilemapFloatingY((y) => y + step);
            }}
          >⠿</span>
        ) : null}
      </summary>
      {workbenchDockSplitHandle("tilemap")}
    <fieldset id="settings-tilemap" className={`control-group tilemap-settings-group${settingsSection === "tilemap" ? " settings-focused" : ""}`}>
      <legend>Tilemap conversion</legend>
      <div className="tilemap-source-inline">
      <div className="tilemap-source-summary control-row control-row-5">
        <div>
          <span>Optimizer</span>
          <strong>
            {ATTRIBUTE_OPTIMIZERS.find((engine) =>
              engine.id === attributeOptimizerId)?.name ??
              attributeOptimizerId}
          </strong>
        </div>
        <div>
          <span>Dither engine</span>
          <strong>
            {DITHER_ENGINES.find((engine) =>
              engine.id === ditherEngineId)?.name ?? ditherEngineId}
          </strong>
        </div>
        <div>
          <span>Palette</span>
          <strong>
            {paletteSelections[0]?.enabledColorIds.length ?? 0} colors ·
            BRIGHT {paletteSelections[0]?.brightMode ?? "auto"}
          </strong>
        </div>
        <div>
          <span>Character budget</span>
          <strong>{charsetSource === "existing" ? existingActiveCharacterCount : charsetBudget}</strong>
        </div>
        <div><span>Target</span><strong>ZX 256×192 · 8×8</strong></div>
      </div>
      </div>
      <div className={`tilemap-primary-controls control-row control-row-${charsetSource === "derived" ? 5 : 4}`}>
      <label>
        <span>Charset source</span>
        <select
          value={charsetSource}
          disabled={charsetState.kind === "running"}
          onChange={(event) => {
            const source = event.target.value as CharsetSource;
            setCharsetSource(source);
            setCharsetTilesView(source === "existing" ? "source" : "output");
            setCharsetSelectionMode(false);
            setSelectedSourceCharsetTile(null);
            if (
              source === "existing" &&
              existingCharset !== null &&
              existingCharsetLength === 0
            ) {
              const count = existingCharset.length / 8;
              setExistingCharsetStart(0);
              setExistingCharsetLength(count);
              setExistingCharsetStartEntry("1");
              setExistingCharsetLengthEntry(String(count));
              if (count > 32) setCharsetEncoding("extended");
            }
            invalidateCharset();
            setTilemapStale(true);
          }}
        >
          <option value="derived">Derive from palette source</option>
          <option value="existing">Existing charset</option>
        </select>
      </label>
      <label>
        <span>Output mapping</span>
        <select
          value={charsetEncoding}
          disabled={charsetState.kind === "running"}
          onChange={(event) => {
            const encoding = event.target.value as CharsetEncoding;
            setCharsetEncoding(encoding);
            if (encoding === "compact") {
              if (charsetSource === "existing") {
                if (existingCharsetSelection !== null) {
                  markCharsetSelectionChanged(
                    existingCharsetSelection.slice(0, 32),
                  );
                } else {
                  setExistingCharsetLength((value) => {
                    const next = Math.min(value, 32);
                    setExistingCharsetLengthEntry(String(next));
                    return next;
                  });
                }
              } else {
                setCharsetBudget((value) => Math.min(value, 32));
              }
            }
            invalidateCharset();
            setTilemapStale(true);
          }}
        >
          <option value="compact">Compact · 1–32 chars</option>
          <option value="extended">Extended · 1–256 chars</option>
        </select>
      </label>
      {charsetSource === "derived" ? <label>
        <span>Character budget</span>
        <input
          type="number"
          min="1"
          max="256"
          value={charsetBudget}
          disabled={charsetState.kind === "running"}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next) && next >= 1 && next <= 256) {
              setCharsetBudget(next);
              if (next > 32) setCharsetEncoding("extended");
              invalidateCharset();
              setTilemapStale(true);
            }
          }}
        />
      </label> : (
      <>
        <label>
          <span>Start tile</span>
          <input
            type="text"
            inputMode={existingCharsetSelection === null
              ? "numeric"
              : undefined}
            value={existingCharsetSelection === null
              ? existingCharsetStartEntry
              : "Selection"}
            readOnly={existingCharsetSelection !== null}
            aria-invalid={existingCharsetSelection === null &&
              !charsetRangeEntriesValid}
            disabled={charsetState.kind === "running" || availableExistingCharsetCount === 0}
            onChange={(event) => {
              const entry = event.target.value;
              setExistingCharsetStartEntry(entry);
              const requestedStart = Number(entry);
              if (
                !/^\d+$/.test(entry) ||
                !Number.isInteger(requestedStart) ||
                requestedStart < 1 ||
                requestedStart > availableExistingCharsetCount
              ) return;
              const range = clampCharsetRange(
                availableExistingCharsetCount,
                requestedStart - 1,
                existingCharsetLength,
              );
              setExistingCharsetStart(range.startIndex);
              setExistingCharsetLength(range.length);
              setExistingCharsetLengthEntry(String(range.length));
              invalidateCharset();
              setTilemapStale(true);
            }}
            onBlur={commitCharsetStartEntry}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCharsetStartEntry();
              }
            }}
          />
          {existingCharsetSelection === null &&
              !charsetRangeEntriesValid ? (
            <span className="field-error">Invalid value</span>
          ) : null}
        </label>
        <label>
          <span>Length</span>
          <input
            type={existingCharsetSelection === null ? "text" : "number"}
            inputMode={existingCharsetSelection === null
              ? "numeric"
              : undefined}
            value={existingCharsetSelection === null
              ? existingCharsetLengthEntry
              : existingCharsetSelection.length}
            readOnly={existingCharsetSelection !== null}
            aria-invalid={existingCharsetSelection === null &&
              !charsetRangeEntriesValid}
            disabled={charsetState.kind === "running" || availableExistingCharsetCount === 0}
            onChange={(event) => {
              const entry = event.target.value;
              setExistingCharsetLengthEntry(entry);
              const requestedLength = Number(entry);
              const maximum = availableExistingCharsetCount - existingCharsetStart;
              if (
                !/^\d+$/.test(entry) ||
                !Number.isInteger(requestedLength) ||
                requestedLength < 1 ||
                requestedLength > maximum
              ) return;
              setExistingCharsetLength(requestedLength);
              if (requestedLength > 32) setCharsetEncoding("extended");
              invalidateCharset();
              setTilemapStale(true);
            }}
            onBlur={commitCharsetLengthEntry}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCharsetLengthEntry();
              }
            }}
          />
          {existingCharsetSelection === null &&
              !charsetRangeEntriesValid ? (
            <span className="field-error">Invalid value</span>
          ) : null}
        </label>
      </>
      )}
      {charsetSource === "derived" ? <label>
        <span>Derived strategy</span>
        <select
          value={charsetStrategy}
          disabled={charsetSource !== "derived" ||
            charsetState.kind === "running"}
          onChange={(event) => {
            setCharsetStrategy(
              event.target.value as DerivedCharsetStrategy,
            );
            invalidateCharset();
            setTilemapStale(true);
          }}
        >
          <option value="frequency">Most frequent · fastest</option>
          <option value="best-coverage">Best coverage v1 · baseline</option>
          <option value="image-similarity-v2">
            Image similarity v2 · experimental
          </option>
          <option value="image-similarity-v3">
            Image similarity v3 · contextual experimental
          </option>
          <option value="image-similarity-v4">
            Image similarity v4 · RGB-safe experimental
          </option>
          <option value="image-similarity-v5">
            Image similarity v5 · bounded contextual experimental
          </option>
        </select>
      </label> : null}
      {charsetSource === "derived" ? <label>
        <span>Matching metric</span>
        <select
          value={
            charsetStrategy === "image-similarity-v2" ||
            charsetStrategy === "image-similarity-v3" ||
            charsetStrategy === "image-similarity-v4" ||
            charsetStrategy === "image-similarity-v5"
            ? charsetStrategy
            : charsetDistance}
          disabled={
            charsetStrategy === "image-similarity-v2" ||
            charsetStrategy === "image-similarity-v3" ||
            charsetStrategy === "image-similarity-v4" ||
            charsetStrategy === "image-similarity-v5" ||
            charsetState.kind === "running"}
          onChange={(event) => {
            setCharsetDistance(
              event.target.value as CharsetDistanceMetric,
            );
            invalidateCharset();
            setTilemapStale(true);
          }}
        >
          <option value="hamming">Pixel Hamming</option>
          <option value="hybrid">Hybrid structural</option>
          {charsetStrategy === "image-similarity-v2" ||
              charsetStrategy === "image-similarity-v3" ||
              charsetStrategy === "image-similarity-v4" ||
              charsetStrategy === "image-similarity-v5" ? (
            <option value={charsetStrategy}>
              Rendered image similarity
            </option>
          ) : null}
        </select>
      </label> : null}
      </div>
      <div className="tilemap-options-row control-row control-row-3">
      <label className="check-control">
        <input
          type="checkbox"
          checked={charsetAllowTransforms}
          disabled={charsetState.kind === "running"}
          onChange={(event) => {
            setCharsetAllowTransforms(event.target.checked);
            invalidateCharset();
            setTilemapStale(true);
          }}
        />
        <span>Rotations and reflections</span>
      </label>
      <label className="check-control">
        <input
          type="checkbox"
          checked={charsetAllowPolarity}
          disabled={charsetState.kind === "running"}
          onChange={(event) => {
            setCharsetAllowPolarity(event.target.checked);
            invalidateCharset();
            setTilemapStale(true);
          }}
        />
        <span>Polarity through INK/PAPER swap</span>
      </label>
      <label className="check-control">
        <input
          type="checkbox"
          checked={charsetVisualWeighting}
          disabled={charsetSource !== "derived" ||
            charsetState.kind === "running"}
          onChange={(event) => {
            setCharsetVisualWeighting(event.target.checked);
            invalidateCharset();
            setTilemapStale(true);
          }}
        />
        <span>Visual importance weighting</span>
      </label>
      </div>
      {charsetSource === "existing" ? (
        <label className="file-picker secondary-picker charset-picker">
          <span>
            {existingCharsetName ?? "Choose raw charset"}
            {existingCharsetName === null ? "" : " · Replace…"}
          </span>
          <input
            type="file"
            accept=".chr,.bin,application/octet-stream"
            disabled={charsetState.kind === "running"}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              // Clear the input so selecting the same file again still
              // emits a change event and resets any prior tile subset.
              input.value = "";
              void importExistingCharset(file);
            }}
          />
        </label>
      ) : null}
      {charsetSource === "existing" && existingCharset === null ? (
        <p className="control-help" role="status">
          {builtInSpecsciiFontError === null
            ? "Loading the built-in Specscii font…"
            : `Built-in Specscii font unavailable: ${builtInSpecsciiFontError}. Import a raw charset to continue.`}
        </p>
      ) : null}
      <p className="control-help tilemap-mapping-help">
        Compact embeds transform bits and supports 1–32 active tiles.
        Extended supports 1–256 tiles and stores transforms in a separate
        288-byte plane.
      </p>
    </fieldset>
    {workbenchTilemapFloating ? (
      <div
        className="workbench-floating-resize-handle"
        role="button"
        tabIndex={0}
        aria-label="Resize Tilemap window"
        onPointerDown={(event) => startWorkbenchFloatingResize("tilemap", event)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 32 : 8;
          if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("tilemap", step, 0);
          if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("tilemap", -step, 0);
          if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("tilemap", 0, step);
          if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("tilemap", 0, -step);
        }}
      />
    ) : null}
    </details>
    ))}
    </>
  );
}
