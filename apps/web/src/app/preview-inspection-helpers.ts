import { type SavedWorkbenchLayout } from "../saved-workbench-layouts.js";
import { type WorkerCharsetResult } from "../worker/client.js";
import { type TilemapEditorSnapshot } from "../tilemap-editor.js";
import { type PointerEvent as ReactPointerEvent } from "react";

export function workspaceProfileSnapshotKey(layout: SavedWorkbenchLayout): string {
  return JSON.stringify({ workspaceMode: layout.workspaceMode, workspace: layout.workspace, workbench: layout.workbench });
}

export function snapshotTileEditor(result: WorkerCharsetResult): TilemapEditorSnapshot {
  return {
    charset: result.charset.slice(),
    assignments: result.assignments.map((assignment) => ({ ...assignment })),
    attributes: result.attributes.slice(),
    encoding: result.encoding,
  };
}

export function tilemapCellAtCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): readonly [number, number] {
  const bounds = event.currentTarget.getBoundingClientRect();
  const pixelX = Math.max(0, Math.min(255, Math.floor((event.clientX - bounds.left) / bounds.width * 256)));
  const pixelY = Math.max(0, Math.min(191, Math.floor((event.clientY - bounds.top) / bounds.height * 192)));
  return [Math.floor(pixelX / 8), Math.floor(pixelY / 8)];
}
