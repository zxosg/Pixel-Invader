import { useAppState } from "../app-state.js";
import { workbenchDockIcon, workbenchDockLabel } from "../workbench-windows-helpers.js";
import { createPortal } from "react-dom";

export function WorkbenchWindowTitlebar() {
  const s = useAppState();
  const {
    preventWorkbenchDragClick,
    resetWorkbenchLayout,
    setWorkbenchFloatingX,
    setWorkbenchFloatingY,
    setWorkbenchLayoutMenu,
    setWorkbenchLayoutMenuPosition,
    setWorkbenchSettingsDock,
    setWorkbenchSettingsMinimized,
    startWorkbenchDrag,
    startWorkbenchTitlebarDrag,
    toggleWorkbenchLayoutMenu,
    workbenchDragMovedRef,
    workbenchLayoutMenu,
    workbenchLayoutMenuPosition,
    workbenchSettingsDock,
    workbenchSettingsMinimized,
  } = s;
  return (
    <div
      className="workbench-window-titlebar"
      onPointerDown={(event) => {
        if (workbenchSettingsDock === "floating") startWorkbenchTitlebarDrag("settings", event);
      }}
    >
      <button className="workbench-window-title" type="button" aria-expanded={!workbenchSettingsMinimized} onClick={(event) => {
        if (workbenchSettingsDock === "floating" && workbenchDragMovedRef.current) {
          preventWorkbenchDragClick(event);
          return;
        }
        setWorkbenchSettingsMinimized((value) => !value);
      }}>
        <span aria-hidden="true">{workbenchSettingsMinimized ? "▶" : "▼"}</span>
        <span>Conversion settings</span>
      </button>
      {workbenchSettingsDock === "floating" ? (
        <div
          className="workbench-window-drag-handle"
          role="button"
          tabIndex={0}
          aria-label="Move Conversion settings window"
          title="Drag to move Conversion settings"
          onPointerDown={startWorkbenchDrag}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 32 : 8;
            if (event.key === "ArrowLeft") setWorkbenchFloatingX((x) => Math.max(8, x - step));
            if (event.key === "ArrowRight") setWorkbenchFloatingX((x) => x + step);
            if (event.key === "ArrowUp") setWorkbenchFloatingY((y) => Math.max(8, y - step));
            if (event.key === "ArrowDown") setWorkbenchFloatingY((y) => y + step);
          }}
        >⠿</div>
      ) : null}
      <div className="workbench-window-actions" aria-label="Conversion settings layout actions">
        <span className="workbench-window-location-menu">
          <button
            className="workbench-window-location-button"
            type="button"
            aria-label="Change Conversion settings location"
            title="Change Conversion settings location"
            aria-haspopup="menu"
            aria-expanded={workbenchLayoutMenu === "settings"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleWorkbenchLayoutMenu("settings", event.currentTarget);
            }}
          >{workbenchDockIcon(workbenchSettingsDock)}</button>
          {workbenchLayoutMenu === "settings" ? (
            workbenchLayoutMenuPosition === null ? null : createPortal(
              <span
                className="workbench-window-location-popover"
                role="menu"
                aria-label="Conversion settings locations"
                style={{ left: workbenchLayoutMenuPosition.left, top: workbenchLayoutMenuPosition.top }}
              >
                {(["floating", "left", "right", "bottom"] as const).map((dock) => (
                  <button
                    key={dock}
                    type="button"
                    role="menuitemradio"
                    aria-checked={workbenchSettingsDock === dock}
                    className={workbenchSettingsDock === dock ? "active" : undefined}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setWorkbenchSettingsDock(dock);
                      setWorkbenchLayoutMenu(null);
                      setWorkbenchLayoutMenuPosition(null);
                    }}
                  ><span aria-hidden="true">{workbenchDockIcon(dock)}</span>{workbenchDockLabel(dock)}</button>
                ))}
              </span>,
              document.body,
              "workbench-location-menu-settings",
            )
          ) : null}
        </span>
        <button type="button" aria-label="Reset workbench layout" title="Reset workbench layout" onClick={resetWorkbenchLayout}>↺</button>
      </div>
    </div>
  );
}
