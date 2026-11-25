export type UiLayout = "guided" | "pro";

const UI_LAYOUT_KEY = "pixel-invader.uiLayout";

export function loadUiLayout(storage: Storage): UiLayout {
  try {
    return storage.getItem(UI_LAYOUT_KEY) === "pro" ? "pro" : "guided";
  } catch {
    return "guided";
  }
}

export function saveUiLayout(storage: Storage, layout: UiLayout): void {
  try {
    storage.setItem(UI_LAYOUT_KEY, layout);
  } catch {
    // Layout preference is optional.
  }
}
