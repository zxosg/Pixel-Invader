import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ActiveWorkbenchWindowId, WorkbenchWindowLayout } from "./workbench-preferences.js";
import type { WorkspaceConversionMode } from "./projects.js";
import type { WorkspaceLayoutId } from "./workspace-preferences.js";
import type { ConversionProfile } from "./profiles.js";

type MenuId = "file" | "convert" | "view" | "window" | "settings";

const PANEL_LABELS: Readonly<Record<ActiveWorkbenchWindowId, string>> = {
  tools: "Tools",
  geometry: "Geometry",
  adjustments: "Image adjustments",
  palette: "ZX palette and attributes",
  dithering: "Dithering",
  tilemap: "Tilemap",
  source: "Source preview",
  result: "Result preview",
};

export const BUILT_IN_WORKSPACE_LAYOUTS: readonly { id: Exclude<WorkspaceLayoutId, "custom">; label: string }[] = [
  { id: "conversion", label: "Conversion" },
  { id: "palette", label: "Palette tuning" },
  { id: "dithering", label: "Dithering review" },
  { id: "tilemap", label: "Tilemap cleanup" },
  { id: "editor", label: "Editor" },
  { id: "inspection", label: "Pixel inspection" },
];

export interface WorkspaceProfileOption {
  readonly id: string;
  readonly name: string;
  readonly kind: "builtin" | "saved";
  readonly layout?: Exclude<WorkspaceLayoutId, "custom">;
}

const HARDWARE_MODE_LABELS: Readonly<Record<string, string>> = {
  "zx48-standard-256x192": "Standard · single screen",
  "zx48-mixed-256x192": "Mixed · two screens 50/50",
  "zx48-vertical-spatial-256x192": "Vertical spatial · 8×1",
  "mode8-256x256": "Low / Mode 8 · mixed 256×256",
  "mode4-512x256": "High / Mode 4 · mixed 512×256",
  "mode8-mode4-mixed-512x256": "Mixed Low + High · two screens",
  "mode8-plain-256x256": "Low / Mode 8 · plain 256×256",
  "mode4-plain-512x256": "High / Mode 4 · plain 512×256",
  "mode8-vertical-spatial-256x256": "Mode 8 · vertical spatial",
  "mode4-vertical-spatial-512x256": "Mode 4 · vertical spatial",
  "pmd85-2-tv": "PMD 85-2 / 2A TV/CV",
  "pmd85-2-rgb": "PMD 85-2 / 2A RGB",
  "pmd85-3-tv": "PMD 85-3 TV/CV · grayscale",
  "pmd85-3-pal": "PMD 85-3 PAL/video",
  "pmd85-3-rgb": "PMD 85-3 RGB",
  "pmd85-colorace": "PMD 85 ColorAce",
  "pmd85-2-rgb-vertical-spatial": "PMD 85-2 RGB · vertical spatial",
  "pmd85-3-rgb-vertical-spatial": "PMD 85-3 RGB · vertical spatial",
  "pmd85-3-pal-vertical-spatial": "PMD 85-3 PAL · vertical spatial",
};

export interface WorkbenchMenuBarProps {
  readonly isPmd: boolean;
  readonly isZx: boolean;
  readonly workspaceMode: WorkspaceConversionMode;
  readonly onWorkspaceModeChange: (mode: WorkspaceConversionMode) => void;
  readonly profiles: readonly ConversionProfile[];
  readonly selectedProfile: ConversionProfile;
  readonly selectedProfileId: string;
  readonly selectedPresetId: string;
  readonly targetModeId: string;
  readonly onProfileChange: (profileId: string) => void;
  readonly onPresetChange: (presetId: string) => void;
  readonly onTargetModeChange: (modeId: string) => void;
  readonly canDeleteSelectedProfile: boolean;
  readonly canDeleteImportedProfiles: boolean;
  readonly onDeleteSelectedProfile: () => void;
  readonly onDeleteImportedProfiles: () => void;
  readonly canConvert: boolean;
  readonly conversionRunning: boolean;
  readonly onConvert: () => void;
  readonly onCancelConvert: () => void;
  readonly canSaveProject: boolean;
  readonly canExportResult: boolean;
  readonly canExportMetadata: boolean;
  readonly canExportInspection: boolean;
  readonly canExportTilemap: boolean;
  readonly onOpenImage: (file: File | undefined) => void;
  readonly onImportClipboard: () => void;
  readonly onOpenPmd: (file: File | undefined) => void;
  readonly onOpenProject: (file: File | undefined) => void;
  readonly onImportProfile: (file: File | undefined) => void;
  readonly onSaveProject: () => void;
  readonly onExportPreview: () => void;
  readonly onExportGif: () => void;
  readonly onExportBinary: () => void;
  readonly onExportMetadata: () => void;
  readonly onExportInspection: () => void;
  readonly onExportTilemap: () => void;
  readonly onExportCharset: () => void;
  readonly onExportPaletteSource: () => void;
  readonly onExportTilemapPreview: () => void;
  readonly onExportTilemapDiagnostics: () => void;
  readonly windowLayouts: Readonly<Record<ActiveWorkbenchWindowId, WorkbenchWindowLayout>>;
  readonly onWindowVisibilityChange: (panel: ActiveWorkbenchWindowId, visible: boolean) => void;
  readonly workspaceProfiles: readonly WorkspaceProfileOption[];
  readonly activeWorkspaceProfileId: string;
  readonly workspaceProfileDirty: boolean;
  readonly onWorkspaceProfileSelect: (id: string) => void;
  readonly onSaveWorkspaceProfileChanges: () => void;
  readonly onSaveWorkspaceProfileAs: (name: string) => boolean;
  readonly onRenameWorkspaceProfile: (id: string, name: string) => boolean;
  readonly onDeleteWorkspaceProfile: (id: string) => void;
  readonly onRestoreDefaultWorkspaceProfiles: () => void;
  readonly onResetArrangement: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenPaletteEditor: () => void;
  readonly onOpenAbout: () => void;
}

function resetFileInput(event: ChangeEvent<HTMLInputElement>, callback: (file: File | undefined) => void): void {
  callback(event.currentTarget.files?.[0]);
  event.currentTarget.value = "";
}

export function WorkbenchMenuBar(props: WorkbenchMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [layoutName, setLayoutName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [renamingProfile, setRenamingProfile] = useState(false);
  const [popoverLeft, setPopoverLeft] = useState(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const menuButtonRefs = useRef<Partial<Record<MenuId, HTMLButtonElement | null>>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pmdInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (openMenu === null) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [openMenu]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) return;
      const key = event.key.toLowerCase();
      if (key === "o" && !event.shiftKey) {
        event.preventDefault();
        imageInputRef.current?.click();
      } else if (key === "s" && !event.shiftKey && props.canSaveProject) {
        event.preventDefault();
        props.onSaveProject();
      } else if (event.key === "," && !event.shiftKey) {
        event.preventDefault();
        props.onOpenSettings();
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [props.canSaveProject, props.onOpenSettings, props.onSaveProject]);

  const positionPopover = (id: MenuId) => {
    const root = rootRef.current;
    const trigger = menuButtonRefs.current[id];
    if (root === null || trigger === null || trigger === undefined) return;
    const rootRect = root.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const preferredWidth = id === "convert" || id === "view" ? 384 : 304;
    const popoverWidth = Math.min(preferredWidth, window.innerWidth - 32, rootRect.width);
    const desiredLeft = triggerRect.left - rootRect.left;
    const maxLeft = Math.max(0, rootRect.width - popoverWidth - 8);
    setPopoverLeft(Math.max(0, Math.min(desiredLeft, maxLeft)));
  };

  useEffect(() => {
    if (openMenu === null) return undefined;
    positionPopover(openMenu);
    const reposition = () => positionPopover(openMenu);
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [openMenu]);

  const closeAndReturnFocus = () => {
    if (openMenu !== null) menuButtonRefs.current[openMenu]?.focus();
    setOpenMenu(null);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest("select, input, textarea, [contenteditable='true']")) return;
    if (event.target instanceof HTMLElement && event.target.closest("[role='radiogroup']") &&
      (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowLeft")) {
      const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radiogroup'] [role='radio']"));
      const currentButton = event.target.closest<HTMLButtonElement>("button[role='radio']");
      const current = currentButton === null ? -1 : radios.indexOf(currentButton);
      if (current >= 0 && radios.length > 0) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
        const next = radios[(current + direction + radios.length) % radios.length];
        next?.focus();
        next?.click();
      }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const menu = rootRef.current?.querySelector<HTMLElement>(`[data-workbench-menu="${openMenu ?? ""}"]`);
    if (menu === null || menu === undefined) return;
    const focusables = Array.from(menu.querySelectorAll<HTMLElement>(
      "button:not(:disabled), select:not(:disabled), input:not(:disabled)",
    ));
    if (focusables.length === 0) return;
    event.preventDefault();
    const current = focusables.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? focusables.length - 1
        : event.key === "ArrowDown" ? (current + 1 + focusables.length) % focusables.length
          : (current <= 0 ? focusables.length - 1 : current - 1);
    focusables[next]?.focus();
  };

  const run = (action: () => void) => () => {
    action();
    setOpenMenu(null);
    if (openMenu !== null) menuButtonRefs.current[openMenu]?.focus();
  };

  const menuButton = (id: MenuId, label: string) => (
    <button
      ref={(element) => { menuButtonRefs.current[id] = element; }}
      className="workbench-menu-trigger"
      type="button"
      aria-controls={`workbench-menu-${id}`}
      aria-expanded={openMenu === id}
      onClick={() => {
        const next = openMenu === id ? null : id;
        setOpenMenu(next);
        if (next !== null) requestAnimationFrame(() => {
          positionPopover(id);
          rootRef.current?.querySelector<HTMLElement>(`[data-workbench-menu="${id}"] button:not(:disabled), [data-workbench-menu="${id}"] select:not(:disabled)`)?.focus();
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const menuIds: readonly MenuId[] = ["file", "convert", "view", "window", "settings"];
          const currentIndex = menuIds.indexOf(id);
          const nextIndex = (currentIndex + (event.key === "ArrowRight" ? 1 : menuIds.length - 1)) % menuIds.length;
          const nextMenu = menuIds[nextIndex]!;
          const nextOpenMenu = openMenu === null ? null : nextMenu;
          setOpenMenu(nextOpenMenu);
          menuButtonRefs.current[nextMenu]?.focus();
          if (nextOpenMenu !== null) requestAnimationFrame(() => {
            positionPopover(nextMenu);
            rootRef.current?.querySelector<HTMLElement>(`[data-workbench-menu="${nextMenu}"] button:not(:disabled), [data-workbench-menu="${nextMenu}"] select:not(:disabled)`)?.focus();
          });
          return;
        }
        if ((event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && openMenu !== id) {
          event.preventDefault();
          setOpenMenu(id);
          requestAnimationFrame(() => {
            positionPopover(id);
            rootRef.current?.querySelector<HTMLElement>(`[data-workbench-menu="${id}"] button:not(:disabled), [data-workbench-menu="${id}"] select:not(:disabled)`)?.focus();
          });
        }
      }}
    >{label}</button>
  );

  const selectedProfile = props.profiles.find(({ id }) => id === props.selectedProfileId) ?? props.selectedProfile;
  const modifierLabel = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const profileChoices = props.workspaceMode === "tilemap"
    ? props.profiles.filter((profile) => profile.platform_id === "zx-spectrum")
    : props.profiles;
  const modeChoices = Object.keys(selectedProfile.palette.modes);
  const setLayoutNameAndSave = () => {
    const normalized = layoutName.trim().replace(/\s+/g, " ").slice(0, 40);
    if (normalized.length === 0) return;
    if (props.onSaveWorkspaceProfileAs(normalized)) setLayoutName("");
  };
  const activeWorkspaceProfile = props.workspaceProfiles.find(({ id }) => id === props.activeWorkspaceProfileId);
  const renameActiveWorkspaceProfile = () => {
    if (activeWorkspaceProfile === undefined) return;
    const normalized = renameName.trim().replace(/\s+/g, " ").slice(0, 40);
    if (normalized.length === 0) return;
    if (!props.onRenameWorkspaceProfile(activeWorkspaceProfile.id, normalized)) return;
    setRenamingProfile(false);
    setRenameName("");
  };

  return (
    <nav className="workbench-menubar" aria-label="Workbench menu" ref={rootRef} onKeyDown={handleMenuKeyDown} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenMenu(null);
    }}>
      <div className="workbench-menu-triggers" role="group" aria-label="Workbench menus">
        <button
          className="workbench-menu-about-trigger"
          type="button"
          aria-label="About Pixel Invader"
          title="About Pixel Invader"
          onClick={() => {
            setOpenMenu(null);
            props.onOpenAbout();
          }}
        >
          <img src={`${import.meta.env.BASE_URL}invader-hdi-2.png`} alt="" />
        </button>
        {menuButton("file", "File")}
        {menuButton("convert", "Convert")}
        {menuButton("view", "View")}
        {menuButton("window", "Window")}
        {menuButton("settings", "Tools")}
      </div>
      <div className="workbench-menu-summary" aria-label="Current conversion setup">
        <span className="workbench-menu-summary-mode">{props.workspaceMode === "tilemap" ? "Tilemap" : "Palette"}</span>
        <span className="workbench-menu-summary-separator" aria-hidden="true">/</span>
        <span className="workbench-menu-summary-profile">{selectedProfile.name}</span>
        <span className="workbench-menu-summary-separator" aria-hidden="true">/</span>
        <span className="workbench-menu-summary-hardware">{props.workspaceMode === "tilemap" ? "ZX Spectrum" : HARDWARE_MODE_LABELS[props.targetModeId] ?? props.targetModeId}</span>
      </div>

      <input ref={imageInputRef} className="workbench-menu-file-input" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => resetFileInput(event, props.onOpenImage)} />
      <input ref={pmdInputRef} className="workbench-menu-file-input" type="file" accept="application/octet-stream,.bin" onChange={(event) => resetFileInput(event, props.onOpenPmd)} />
      <input ref={projectInputRef} className="workbench-menu-file-input" type="file" accept=".rccproject,application/zip" onChange={(event) => resetFileInput(event, props.onOpenProject)} />
      <input ref={profileInputRef} className="workbench-menu-file-input" type="file" accept="application/json,.json" onChange={(event) => resetFileInput(event, props.onImportProfile)} />

      {openMenu === "file" ? (
        <div id="workbench-menu-file" className="workbench-menu-popover" data-workbench-menu="file" role="region" aria-label="File" style={{ "--workbench-menu-popover-left": `${popoverLeft}px` } as CSSProperties}>
          <div className="workbench-menu-group">
            <button type="button" onClick={() => { setOpenMenu(null); imageInputRef.current?.click(); }}><span>Open Image…</span><kbd>{modifierLabel} O</kbd></button>
            <button type="button" onClick={run(props.onImportClipboard)}>Import Image from Clipboard</button>
            {props.isPmd ? <button type="button" onClick={() => { setOpenMenu(null); pmdInputRef.current?.click(); }}>Open PMD Binary…</button> : null}
            <button type="button" onClick={() => { setOpenMenu(null); projectInputRef.current?.click(); }}>Open Project…</button>
            <button type="button" onClick={() => { setOpenMenu(null); profileInputRef.current?.click(); }}>Import Profile…</button>
            <button type="button" disabled={!props.canSaveProject} onClick={run(props.onSaveProject)}><span>Save Project</span><kbd>{modifierLabel} S</kbd></button>
          </div>
          <div className="workbench-menu-group">
            <span className="workbench-menu-heading">Export</span>
            {props.workspaceMode === "tilemap" ? <>
              <button type="button" disabled={!props.canExportTilemap} onClick={run(props.onExportTilemap)}>Raw Tilemap</button>
              <button type="button" disabled={!props.canExportTilemap} onClick={run(props.onExportCharset)}>Final Charset</button>
              <button type="button" disabled={!props.canExportResult} onClick={run(props.onExportPaletteSource)}>Palette Source .scr</button>
              <button type="button" disabled={!props.canExportTilemap} onClick={run(props.onExportTilemapPreview)}>Decoder Preview PNG</button>
              <button type="button" disabled={!props.canExportTilemap} onClick={run(props.onExportGif)}>Animated GIF</button>
              <button type="button" disabled={!props.canExportTilemap} onClick={run(props.onExportTilemapDiagnostics)}>Tilemap Diagnostics JSON</button>
            </> : <>
              <button type="button" disabled={!props.canExportResult} onClick={run(props.onExportPreview)}>PNG Preview</button>
              <button type="button" disabled={!props.canExportResult} onClick={run(props.onExportGif)}>Animated GIF</button>
              <button type="button" disabled={!props.canExportResult} onClick={run(props.onExportBinary)}>Hardware Binary</button>
              <button type="button" disabled={!props.canExportMetadata} onClick={run(props.onExportMetadata)}>Metadata JSON</button>
              {props.isZx ? <button type="button" disabled={!props.canExportInspection} onClick={run(props.onExportInspection)}>Inspection JSON</button> : null}
            </>}
          </div>
        </div>
      ) : null}

      {openMenu === "convert" ? (
        <div id="workbench-menu-convert" className="workbench-menu-popover workbench-menu-wide" data-workbench-menu="convert" role="region" aria-label="Convert" style={{ "--workbench-menu-popover-left": `${popoverLeft}px` } as CSSProperties}>
          <div className="workbench-menu-context"><span className="workbench-menu-context-label">Active setup</span><strong>{props.workspaceMode === "tilemap" ? "Tilemap" : "Palette conversion"}</strong><span>{selectedProfile.name}</span><span>{selectedProfile.presets.find(({ id }) => id === props.selectedPresetId)?.name ?? "Preset"}</span></div>
          <label className="workbench-menu-select"><span>Conversion mode</span><select id="workspace-conversion-mode" data-testid="workspace-conversion-mode" value={props.workspaceMode} onChange={(event) => props.onWorkspaceModeChange(event.target.value as WorkspaceConversionMode)}><option value="palette">Palette conversion</option><option value="tilemap" disabled={!props.isZx}>Tilemap conversion · ZX only</option></select></label>
          <label className="workbench-menu-select"><span>Profile</span><select value={props.selectedProfileId} onChange={(event) => props.onProfileChange(event.target.value)}>{profileChoices.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          <label className="workbench-menu-select"><span>Preset</span><select value={props.selectedPresetId} onChange={(event) => props.onPresetChange(event.target.value)}>{selectedProfile.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
          {props.workspaceMode === "tilemap" ? (
            <label className="workbench-menu-select"><span>Hardware mode</span><select value="zx48-standard-256x192" disabled><option value="zx48-standard-256x192">ZX standard · single screen · 8×8</option></select></label>
          ) : (
            <label className="workbench-menu-select"><span>Hardware mode</span><select value={props.targetModeId} onChange={(event) => props.onTargetModeChange(event.target.value)}>{modeChoices.map((mode) => <option key={mode} value={mode}>{HARDWARE_MODE_LABELS[mode] ?? mode}</option>)}</select></label>
          )}
          <div className="workbench-menu-group">
            <button className="workbench-menu-primary" type="button" disabled={!props.canConvert} onClick={run(props.onConvert)}>Convert High</button>
            {props.conversionRunning ? <button type="button" onClick={run(props.onCancelConvert)}>Cancel High</button> : null}
          </div>
          {props.canDeleteSelectedProfile || props.canDeleteImportedProfiles ? <div className="workbench-menu-group workbench-menu-profile-management">
            <span className="workbench-menu-heading">Profile management</span>
            {props.canDeleteSelectedProfile ? <button className="workbench-menu-destructive" type="button" onClick={run(props.onDeleteSelectedProfile)}>Remove “{selectedProfile.name}” profile</button> : null}
            {props.canDeleteImportedProfiles ? <button className="workbench-menu-destructive" type="button" onClick={run(props.onDeleteImportedProfiles)}>Remove all imported profiles…</button> : null}
          </div> : null}
        </div>
      ) : null}

      {openMenu === "view" ? (
        <div id="workbench-menu-view" className="workbench-menu-popover workbench-menu-wide" data-workbench-menu="view" role="region" aria-label="View" style={{ "--workbench-menu-popover-left": `${popoverLeft}px` } as CSSProperties}>
          <div className="workbench-menu-group">
            <span className="workbench-menu-heading">Workspace profiles</span>
            <div className="workbench-menu-profile-list" role="radiogroup" aria-label="Workspace profiles">
              {props.workspaceProfiles.filter((profile) => profile.layout !== "tilemap" || props.workspaceMode === "tilemap")
                .filter((profile) => profile.layout !== "editor" || props.workspaceMode === "palette")
                .map((profile) => <button key={profile.id} type="button" role="radio" aria-checked={props.activeWorkspaceProfileId === profile.id} onClick={run(() => props.onWorkspaceProfileSelect(profile.id))}>
                  <span className="workbench-menu-check" aria-hidden="true">{props.activeWorkspaceProfileId === profile.id ? "✓" : ""}</span>
                  <span>{profile.name}</span>
                  {profile.kind === "saved" ? <span className="workbench-menu-profile-kind">Saved</span> : null}
                </button>)}
            </div>
            <div className="workbench-menu-context" aria-live="polite">
              <span className="workbench-menu-context-label">Active profile</span>
              <strong>{activeWorkspaceProfile?.name ?? "Custom workspace"}</strong>
              {props.workspaceProfileDirty ? <span>Unsaved changes</span> : <span>{activeWorkspaceProfile?.kind === "builtin" ? "Default profile" : "Saved profile"}</span>}
            </div>
            <div className="workbench-menu-group workbench-menu-profile-actions">
              <button type="button" disabled={!props.workspaceProfileDirty || activeWorkspaceProfile === undefined} onClick={props.onSaveWorkspaceProfileChanges}>Save changes</button>
              <button type="button" disabled={activeWorkspaceProfile === undefined} onClick={run(() => props.onWorkspaceProfileSelect(props.activeWorkspaceProfileId))}>Reapply profile</button>
              {activeWorkspaceProfile !== undefined ? <button type="button" onClick={() => {
                setRenameName(activeWorkspaceProfile.name);
                setRenamingProfile((current) => !current);
              }}>{renamingProfile ? "Cancel rename" : "Rename profile…"}</button> : null}
              {renamingProfile && activeWorkspaceProfile !== undefined ? <form className="workbench-menu-save-layout" onSubmit={(event) => { event.preventDefault(); renameActiveWorkspaceProfile(); }}>
                <label><span className="visually-hidden">New profile name</span><input value={renameName} maxLength={40} placeholder="Profile name" onChange={(event) => setRenameName(event.target.value)} /></label>
                <button type="submit" disabled={renameName.trim().length === 0}>Rename</button>
              </form> : null}
              {activeWorkspaceProfile !== undefined ? <button className="workbench-menu-destructive" type="button" onClick={() => props.onDeleteWorkspaceProfile(activeWorkspaceProfile.id)}>Delete profile</button> : null}
              <form className="workbench-menu-save-layout" onSubmit={(event) => { event.preventDefault(); setLayoutNameAndSave(); }}>
                <label><span className="visually-hidden">New workspace profile name</span><input value={layoutName} maxLength={40} placeholder="Save as new profile…" onChange={(event) => setLayoutName(event.target.value)} /></label>
                <button type="submit" disabled={layoutName.trim().length === 0}>Save as</button>
              </form>
              <button type="button" onClick={props.onRestoreDefaultWorkspaceProfiles}>Restore default profiles</button>
              <button type="button" onClick={props.onResetArrangement}>Reset workspace arrangement</button>
            </div>
          </div>
        </div>
      ) : null}

      {openMenu === "window" ? (
        <div id="workbench-menu-window" className="workbench-menu-popover" data-workbench-menu="window" role="region" aria-label="Window" style={{ "--workbench-menu-popover-left": `${popoverLeft}px` } as CSSProperties}>
          <div className="workbench-menu-group" role="group" aria-label="Windows">
            {(Object.keys(PANEL_LABELS) as ActiveWorkbenchWindowId[])
              .filter((panel) => panel !== "tilemap" || props.workspaceMode === "tilemap")
              .filter((panel) => panel !== "palette" && panel !== "dithering" || props.workspaceMode === "palette")
              .map((panel) => {
                const visible = props.windowLayouts[panel].visible;
                return <button
                  key={panel}
                  className="workbench-menu-window-item"
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={visible}
                  onClick={() => props.onWindowVisibilityChange(panel, !visible)}
                >
                  <span className="workbench-menu-check" aria-hidden="true">{visible ? "✓" : ""}</span>
                  <span>{PANEL_LABELS[panel]}</span>
                </button>;
              })}
          </div>
        </div>
      ) : null}

      {openMenu === "settings" ? (
        <div id="workbench-menu-settings" className="workbench-menu-popover" data-workbench-menu="settings" role="region" aria-label="Tools" style={{ "--workbench-menu-popover-left": `${popoverLeft}px` } as CSSProperties}>
          {props.isZx ? <button type="button" onClick={run(props.onOpenPaletteEditor)}>Palette editor…</button> : null}
          <button type="button" onClick={run(props.onOpenSettings)}><span>Application Settings…</span><kbd>{modifierLabel} ,</kbd></button>
        </div>
      ) : null}
    </nav>
  );
}
