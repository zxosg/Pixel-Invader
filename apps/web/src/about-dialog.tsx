import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

interface AboutDialogProps {
  readonly open: boolean;
  readonly version: string;
  readonly build: string;
  readonly releaseDate: string;
  readonly onClose: () => void;
}

export function AboutDialog({ open, version, build, releaseDate, onClose }: AboutDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
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
  };

  return (
    <div
      className="about-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <button
          ref={closeButtonRef}
          className="about-dialog-close secondary compact"
          type="button"
          aria-label="Close About Pixel Invader"
          onClick={onClose}
        >×</button>
        <img className="about-dialog-icon" src={`${import.meta.env.BASE_URL}invader-hdi-2.png`} alt="" />
        <h2 id="about-dialog-title">Pixel Invader</h2>
        <p className="about-dialog-subtitle">Image Converter · powered by Void Engine</p>
        <dl className="about-dialog-details">
          <div><dt>Version</dt><dd>{version}</dd></div>
          <div><dt>Build</dt><dd>{build}</dd></div>
          <div><dt>Release date</dt><dd>{releaseDate}</dd></div>
        </dl>
        <div className="about-dialog-hardware">
          <h3>Supported hardware</h3>
          <ul>
            <li><span>ZX</span><small>ZX Spectrum</small></li>
            <li><span>QL</span><small>Sinclair QL</small></li>
            <li><span>PMD</span><small>PMD 85</small></li>
          </ul>
        </div>
        <button className="about-dialog-done" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
