

export function downloadBytes(bytes: Uint8Array, type: string, fileName: string) {
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
