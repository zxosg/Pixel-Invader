import { type PointerEvent as ReactPointerEvent } from "react";

export function tileEditorPixelFromEvent(event: ReactPointerEvent<HTMLDivElement>): { readonly x: number; readonly y: number } | null {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / (rect.width / 8));
  const y = Math.floor((event.clientY - rect.top) / (rect.height / 8));
  return x >= 0 && x < 8 && y >= 0 && y < 8 ? { x, y } : null;
}

export function bitmapEditorPixelFromEvent(event: ReactPointerEvent<HTMLDivElement>): { readonly x: number; readonly y: number } | null {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / (bounds.width / 8));
  const y = Math.floor((event.clientY - bounds.top) / (bounds.height / 8));
  return x >= 0 && x < 8 && y >= 0 && y < 8 ? { x, y } : null;
}
