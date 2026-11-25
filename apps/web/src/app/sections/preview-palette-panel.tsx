import { useAppState } from "../app-state.js";
import { type BrightMode } from "@retro-converter/conversion-core";
import { glyphDataUrl } from "../../specscii-assets.js";

export function PreviewPalettePanel() {
  const s = useAppState();
  const {
    applyPickedTilemapIndex,
    beginCharsetSelection,
    charsetGlyphRefs,
    charsetSelectionMode,
    charsetSource,
    charsetState,
    clearCharsetSelection,
    consumeRecentTilePickerClick,
    createEditorTile,
    deleteEditorTile,
    effectivePaletteOptionsByScreen,
    endCharsetSelection,
    existingCharset,
    freezeGeneratedCharset,
    glyphActiveCount,
    glyphActiveIndexSet,
    glyphCharset,
    glyphCount,
    glyphDisplayIndices,
    handleCharsetDoubleClick,
    handleCharsetGlyphKey,
    handleSourceCharsetTileClick,
    invertCharsetSelection,
    isZx,
    maximumTileUsage,
    moveCharsetSelection,
    paletteSelections,
    paletteValid,
    selectEditorTile,
    selectedSourceCharsetTile,
    setPaletteBrightMode,
    showingSourceCharset,
    sourceCharsetCount,
    switchCharsetTilesView,
    tileEditorEdited,
    tileEditorSelected,
    tileEditorTilePickerActive,
    tileEditorTilePickerClickGuardRef,
    tileEditorUsageSort,
    tileUsageAvailable,
    tileUsageCountByIndex,
    toggleCharsetCharacter,
    toggleCharsetSelectionMode,
    toggleEditorTileUsageSort,
    togglePaletteColor,
    workspaceMode,
  } = s;
  return (
    <>{workspaceMode === "palette" ? (
   <aside className="preview-palette-panel" aria-label="Palette summary">
     <div className="palette-control palette-summary-only">
       <div className="palette-summary-heading">
         <span>Palette selection</span>
         <span className="palette-summary">
           {paletteSelections.map((selection) => (
             <span className="palette-summary-screen" key={selection.screenIndex}>
               <span>Screen {selection.screenIndex + 1} · {selection.enabledColorIds.length}</span>
               <span className="mini-palette" aria-hidden="true">
                 {selection.enabledColorIds.map((color) => {
                   const option = (
                     effectivePaletteOptionsByScreen[selection.screenIndex] ??
                     effectivePaletteOptionsByScreen[0] ??
                     []
                   ).find((candidate) => candidate.code === color);
                   return option === undefined ? null : (
                     <span
                       key={color}
                       style={{
                         background: isZx && selection.brightMode === "auto"
                           ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                           : isZx && selection.brightMode === "on"
                             ? option.bright
                             : option.normal,
                       }}
                     />
                   );
                 })}
               </span>
             </span>
           ))}
         </span>
       </div>
       <div className="palette-screen-grid">
         {paletteSelections.map((selection) => (
           <section className="palette-screen" key={selection.screenIndex}>
             <div className="palette-screen-heading">
               <strong>Screen {selection.screenIndex + 1}</strong>
               <span>{selection.enabledColorIds.length} selected</span>
             </div>
             {isZx ? (
               <label>
                 <span>BRIGHT</span>
                 <select
                   value={selection.brightMode ?? "auto"}
                   onChange={(event) =>
                     setPaletteBrightMode(
                       selection.screenIndex,
                       event.target.value as BrightMode,
                     )}
                 >
                   <option value="auto">Auto</option>
                   <option value="on">On</option>
                   <option value="off">Off</option>
                 </select>
               </label>
             ) : null}
             <div
               className="palette-options"
               role="group"
               aria-label={`Screen ${selection.screenIndex + 1} available colors`}
             >
               {(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                 effectivePaletteOptionsByScreen[0] ??
                 []).map((option) => {
                 const selected = selection.enabledColorIds.includes(option.code);
                 return (
                   <button
                     className={`palette-option${selected ? " selected" : ""}`}
                     type="button"
                     key={option.code}
                     aria-label={`${selected ? "Remove" : "Add"} ${option.name} from Screen ${selection.screenIndex + 1}`}
                     aria-pressed={selected}
                     title={option.name}
                     onClick={() => togglePaletteColor(selection.screenIndex, option.code)}
                   >
                     <span
                       className="palette-swatch"
                       style={{
                         background: isZx && selection.brightMode === "auto"
                           ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                           : isZx && selection.brightMode === "on"
                             ? option.bright
                             : option.normal,
                       }}
                       aria-hidden="true"
                     />
                   </button>
                 );
               })}
             </div>
           </section>
         ))}
       </div>
       {paletteValid ? null : (
         <span className="field-error" id="palette-error">
           Invalid value: select at least one color for every screen.
         </span>
       )}
     </div>
   </aside>
   ) : (
   <aside className={`tilemap-charset-panel${charsetSource === "existing" && existingCharset !== null ? showingSourceCharset ? " has-source-view" : " has-source-tabs" : ""}`} aria-label="Charset selector">
     <div className="tilemap-charset-heading">
       <strong>{showingSourceCharset ? "Source charset" : "Charset tiles"}</strong>
       <span>{showingSourceCharset
         ? `${sourceCharsetCount} source tiles · ${glyphActiveCount} included`
         : `${glyphCount} output tiles${tileEditorEdited ? " · Edited" : ""}`}</span>
     </div>
     {charsetSource === "existing" && existingCharset !== null ? <div className={`tilemap-charset-control-row unified-segmented${showingSourceCharset ? " has-selection-action" : ""}`} role="group" aria-label="Charset tile controls">
         <button className={`secondary compact${showingSourceCharset ? " active" : ""}`} type="button" aria-label="Show source charset tiles" title="Show source charset tiles" aria-pressed={showingSourceCharset} onClick={() => switchCharsetTilesView("source")}>Source</button>
         <button className={`secondary compact${!showingSourceCharset ? " active" : ""}`} type="button" aria-label="Show converted output tiles" title="Show converted output tiles" aria-pressed={!showingSourceCharset} disabled={charsetState.kind !== "ready"} onClick={() => switchCharsetTilesView("output")}>Output</button>
         {showingSourceCharset ? <button className={`secondary compact${charsetSelectionMode ? " active" : ""}`} type="button" disabled={charsetState.kind === "running"} aria-label={charsetSelectionMode ? "Finish editing conversion set" : "Edit conversion set"} aria-pressed={charsetSelectionMode} onClick={toggleCharsetSelectionMode} title="Enable source-tile clicks to include or exclude tiles for the next conversion">{charsetSelectionMode ? "Done" : "Edit set"}</button> : null}
     </div> : null}
     {showingSourceCharset ? <div className="tilemap-selection-mode">
       <span className="control-help" role="status">{charsetSelectionMode
         ? "Source tiles are toggles for the next conversion; changes make the result stale."
         : "Click a source tile to select it for the editor or TILE operation. Inclusion changes only in Edit conversion set mode."}</span>
     </div> : null}
     <div className="tilemap-charset-legend" aria-label="Charset tile indicators">
       {showingSourceCharset
         ? <span><i className="charset-included-indicator" aria-hidden="true" />Included tiles are used on the next conversion</span>
         : <><span><i className="charset-used-indicator" aria-hidden="true" />Used on map</span><span><i className="charset-editor-indicator" aria-hidden="true" />Current editor tile</span></>}
     </div>
     <div
       className="tilemap-glyph-grid"
       aria-label="Loaded or generated charset glyphs"
       onPointerMove={moveCharsetSelection}
       onPointerUp={endCharsetSelection}
       onPointerCancel={endCharsetSelection}
     >
       {glyphCount === 0 ? (
         <span className="control-help">No charset loaded.</span>
       ) : glyphDisplayIndices.map((characterIndex) => {
         const active = glyphActiveIndexSet.has(characterIndex);
         const editorReady = charsetState.kind === "ready";
         const selectable = editorReady || (charsetSource === "existing" && existingCharset !== null);
         const usageCount = tileUsageAvailable
           ? tileUsageCountByIndex.get(characterIndex) ?? 0
           : null;
         const usageScale = usageCount === null || usageCount === 0 || maximumTileUsage === 0
           ? 0
           : Math.log1p(usageCount) / Math.log1p(maximumTileUsage);
         const usageColor = usageCount === null || usageCount === 0
           ? undefined
           : `hsl(${205 - Math.round(160 * usageScale)} 82% 62%)`;
         const usageDescription = usageCount === null
           ? "Usage unavailable"
           : usageCount === 0
             ? "Unused · 0 map cells"
             : `Used in ${usageCount} map cells`;
         const inclusionDescription = showingSourceCharset
           ? active ? "Included in conversion" : "Excluded from conversion"
           : "Included in converted tile set";
         const editorDescription = !showingSourceCharset && editorReady && characterIndex === tileEditorSelected
           ? " · Current editor tile"
           : "";
         const sourcePickedDescription = showingSourceCharset && characterIndex === selectedSourceCharsetTile
           ? " · Selected for editor or tile operation"
           : "";
         return (
           <button
             type="button"
             className={`glyph-item ${active ? "active" : "inactive"}${usageCount === 0 ? " zero-use" : usageCount === null ? " usage-unknown" : " map-used"}${!charsetSelectionMode && showingSourceCharset && characterIndex === selectedSourceCharsetTile ? " source-picked" : ""}${!showingSourceCharset && editorReady && characterIndex === tileEditorSelected ? " editor-selected" : ""}`}
             key={characterIndex}
             data-character-index={characterIndex}
             title={`Tile ${characterIndex + 1} (index ${characterIndex}) · ${inclusionDescription}${editorDescription}${sourcePickedDescription} · ${usageDescription}`}
             aria-label={`Tile ${characterIndex + 1}, ${inclusionDescription}${editorDescription}${sourcePickedDescription}, ${usageDescription}`}
             aria-pressed={selectable ? showingSourceCharset && !charsetSelectionMode
               ? characterIndex === selectedSourceCharsetTile
               : active : undefined}
             disabled={!selectable || charsetState.kind === "running"}
             ref={(element) => {
               charsetGlyphRefs.current[characterIndex] = element;
             }}
             onClick={(event) => {
               if (consumeRecentTilePickerClick(characterIndex)) {
                 event.preventDefault();
                 return;
               }
               if (showingSourceCharset) {
                 if (!charsetSelectionMode) handleSourceCharsetTileClick(characterIndex);
               } else if (tileEditorTilePickerActive) {
                 tileEditorTilePickerClickGuardRef.current = { index: characterIndex, until: Date.now() + 500 };
                 applyPickedTilemapIndex(characterIndex);
               } else {
                 selectEditorTile(characterIndex);
               }
             }}
             onDoubleClick={(event) => {
               if (consumeRecentTilePickerClick(characterIndex)) {
                 event.preventDefault();
                 return;
               }
               if (showingSourceCharset) {
                 if (charsetSelectionMode) handleCharsetDoubleClick(characterIndex);
               } else if (tileEditorTilePickerActive) {
                 applyPickedTilemapIndex(characterIndex);
               } else {
                 selectEditorTile(characterIndex);
               }
             }}
             onPointerDown={(event) => {
               if (consumeRecentTilePickerClick(characterIndex)) {
                 event.preventDefault();
                 event.stopPropagation();
                 return;
               }
               if (!showingSourceCharset && tileEditorTilePickerActive) {
                 event.preventDefault();
                 event.stopPropagation();
                 tileEditorTilePickerClickGuardRef.current = { index: characterIndex, until: Date.now() + 500 };
                 applyPickedTilemapIndex(characterIndex);
               } else if (showingSourceCharset && charsetSelectionMode) {
                 beginCharsetSelection(characterIndex, event);
               }
             }}
             onKeyDown={(event) => {
               if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
                 handleCharsetGlyphKey(characterIndex, event);
               } else if (event.key === "Delete" && showingSourceCharset && charsetSelectionMode) {
                 event.preventDefault();
                 clearCharsetSelection();
               } else if (event.key === "Enter" || event.key === " ") {
                 event.preventDefault();
                 if (tileEditorTilePickerActive && !showingSourceCharset) applyPickedTilemapIndex(characterIndex);
                 else if (showingSourceCharset && charsetSelectionMode) toggleCharsetCharacter(characterIndex);
                 else if (showingSourceCharset) handleSourceCharsetTileClick(characterIndex);
                 else selectEditorTile(characterIndex);
               } else if (!editorReady) {
                 handleCharsetGlyphKey(characterIndex, event);
               }
             }}
             onDragStart={(event) => event.preventDefault()}
           >
             <img
               src={glyphDataUrl(glyphCharset!, characterIndex, active, usageCount === 0)}
               alt=""
               draggable={false}
               width="16"
               height="16"
             />
             <span className={`glyph-usage-meter${usageCount === null ? " unavailable" : ""}`} aria-hidden="true">
               <span style={{ width: `${usageScale * 100}%`, backgroundColor: usageColor }} />
             </span>
           </button>
         );
       })}
     </div>
     {charsetSource === "derived" ? (
       <div className="tilemap-charset-freeze">
         <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount === 0} onClick={freezeGeneratedCharset}>Freeze generated charset</button>
         <span className="control-help">Freeze the current generated tiles to enable conversion selection.</span>
       </div>
     ) : null}
     <div className={`tilemap-charset-actions unified-segmented${showingSourceCharset ? " source-actions" : ""}`} role="group" aria-label={showingSourceCharset ? "Source charset selection actions" : "Output tile actions"}>
       {showingSourceCharset ? <>
         <button className="secondary compact" type="button" disabled={!charsetSelectionMode || charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || sourceCharsetCount === 0} onClick={clearCharsetSelection} title="Include all source tiles in the next conversion">Select all</button>
         <button className="secondary compact" type="button" disabled={!charsetSelectionMode || charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || sourceCharsetCount === 0} onClick={invertCharsetSelection} title="Invert the source-tile selection">Invert selection</button>
       </> : <>
         <button
           className="secondary compact"
           type="button"
           disabled={!tileUsageAvailable || glyphCount === 0}
           onClick={toggleEditorTileUsageSort}
           aria-pressed={tileEditorUsageSort}
           title={tileEditorUsageSort ? "Show tiles in memory order" : "Sort displayed tiles by usage"}
         >{tileEditorUsageSort ? "Normal" : "Usage"}</button>
         <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount >= 256} onClick={createEditorTile} title="Add a blank tile">Add</button>
         <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount <= 1} onClick={deleteEditorTile} title="Delete the selected tile">Del</button>
       </>}
     </div>
   </aside>
   )}</>
  );
}
