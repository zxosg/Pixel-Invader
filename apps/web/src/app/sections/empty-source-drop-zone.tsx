import { useEffect, useRef, useState, type DragEvent } from "react";

interface EmptySourceDropZoneProps {
  readonly onImportFile: (file: File | undefined) => void | Promise<void>;
  readonly onPasteClipboard: () => void;
}

export function EmptySourceDropZone({ onImportFile, onPasteClipboard }: EmptySourceDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent): void {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith("image/"));
      if (file === undefined) return;
      event.preventDefault();
      void onImportFile(file);
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [onImportFile]);

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragOver(false);
    void onImportFile(event.dataTransfer.files[0]);
  }

  return (
    <div
      className={`empty-drop-zone${dragOver ? " drag-over" : ""}`}
      data-testid="empty-drop-zone"
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <strong className="empty-drop-zone-title">Drop an image here</strong>
      <span className="empty-drop-zone-hint">or paste with ⌘V / Ctrl+V</span>
      <div className="empty-drop-zone-actions">
        <button type="button" className="empty-drop-zone-primary" onClick={() => inputRef.current?.click()}>Open image…</button>
        <button type="button" onClick={onPasteClipboard}>Paste from clipboard</button>
      </div>
      <span className="empty-drop-zone-hint">PNG, JPEG, GIF or ZX .scr · up to 8192 × 8192 px</span>
      <input
        ref={inputRef}
        className="workbench-menu-file-input"
        type="file"
        accept="image/png,image/jpeg,image/gif,.png,.jpg,.jpeg,.gif,.scr"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void onImportFile(file);
        }}
      />
    </div>
  );
}
